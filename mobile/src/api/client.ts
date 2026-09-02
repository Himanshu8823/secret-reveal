import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { getRefreshToken, setRefreshToken, clearAllAuthData } from '../utils/secureStorage';
import { refresh } from './auth.api';

/**
 * Single axios instance. baseURL is read from a public env var (must be
 * prefixed EXPO_PUBLIC_ to be bundled into the app). The auth interceptor
 * pulls the access token from the zustand store on every request — keeps
 * the store the single source of truth.
 */

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { 'content-type': 'application/json' },
});

/**
 * Interceptor-free instance for the auth endpoints themselves.
 *
 * /auth/refresh must NEVER go through the 401-retry interceptor below: a
 * 401 from the refresh call means "this refresh token is dead", not
 * "mint a new access token". Routing it through apiClient made the
 * interceptor fire tryRefresh() on the failure of a refresh, spending a
 * second rotation on a token the server had already rejected/consumed.
 * The backend reads that replay as token reuse and revokes the whole
 * family (token.service.ts), which signed the user out on every restart.
 */
export const authClient = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { 'content-type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// TODO: once authStore exposes `setAccessToken` and `signOut`, prefer those
// over the setState fallbacks below. The TypeScript check will fail until
// those exports land.
let refreshInFlight: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = await getRefreshToken();
    if (!token) return null;
    try {
      const { accessToken, refreshToken: newRefresh } = await refresh({ refreshToken: token });
      await setRefreshToken(newRefresh);
      const setAccessToken = useAuthStore.getState().setAccessToken;
      if (setAccessToken) {
        setAccessToken(accessToken);
      } else {
        // Fallback if setAccessToken isn't added yet
        useAuthStore.setState({ accessToken });
      }
      return accessToken;
    } catch (e) {
      // Only wipe on auth errors. Network / 5xx must preserve the token so
      // the next cold start can retry — see boot.ts's isAuthError.
      //
      // NOTE: unwrap() re-throws a plain Error carrying `status`, `code`
      // and `isNetworkError`; it does NOT preserve `e.response`. Reading
      // `e.response.status` here therefore always saw `undefined`, so a
      // server-sent 401 was only caught via `code`. Read the flattened
      // fields that unwrap actually sets.
      const err = e as {
        code?: string;
        status?: number;
        isNetworkError?: boolean;
        response?: { status?: number };
      };
      // Server never answered — nothing was rejected, so keep the token.
      const isAuth =
        !err.isNetworkError &&
        ((err.status ?? err.response?.status) === 401 ||
          err.code === 'TOKEN_INVALID' ||
          err.code === 'TOKEN_EXPIRED' ||
          err.code === 'UNAUTHENTICATED');
      if (isAuth) {
        // Clear the user blob alongside the token — leaving a stored user
        // behind with no token is the orphan state boot.ts has to special
        // case, and it makes the next cold start ambiguous.
        await clearAllAuthData();
        const signOut = useAuthStore.getState().signOut;
        if (signOut) {
          signOut();
        } else {
          // Fallback if signOut isn't added yet
          useAuthStore.setState({ accessToken: null });
        }
      }
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (!original) throw error;
    if (error.response?.status !== 401 || original._retry) throw error;
    original._retry = true;
    const newToken = await tryRefresh();
    if (!newToken) throw error;
    original.headers.Authorization = `Bearer ${newToken}`;
    return apiClient.request(original);
  },
);

/**
 * Unwrap the standard backend envelope. Throws an Error with the server's
 * `error.code` so callers can branch on it (OTP_EXPIRED vs OTP_INCORRECT etc).
 */
export async function unwrap<T>(p: Promise<{ data: import('../features/auth/types').ApiEnvelope<T> }>): Promise<T> {
  try {
    const { data } = await p;
    if (!data.success) {
      const err = new Error(data.error.message) as Error & { code?: string; details?: unknown };
      err.code = data.error.code;
      err.details = data.error.details;
      throw err;
    }
    return data.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      // Preserve the HTTP status and a network-vs-server distinction on the
      // re-thrown error. Callers (notably boot.ts's isAuthError) branch on
      // these; dropping them made "server unreachable" indistinguishable
      // from "token rejected", which silently signed users out on any
      // transient network failure.
      const status = e.response?.status;
      const isNetworkError = !e.response;
      const data = e.response?.data as
        | { success?: false; error?: { code: string; message: string } }
        | undefined;
      if (data?.error) {
        const err = new Error(data.error.message) as Error & {
          code?: string;
          status?: number;
          isNetworkError?: boolean;
        };
        err.code = data.error.code;
        err.status = status;
        err.isNetworkError = false;
        throw err;
      }
      const err = new Error(e.message) as Error & {
        status?: number;
        isNetworkError?: boolean;
      };
      err.status = status;
      err.isNetworkError = isNetworkError;
      throw err;
    }
    throw e;
  }
}

// Re-export AxiosError so feature code can `isAxiosError` without importing axios.
export { AxiosError };
