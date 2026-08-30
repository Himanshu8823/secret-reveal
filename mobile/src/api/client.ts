import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { getRefreshToken, setRefreshToken, clearRefreshToken } from '../utils/secureStorage';
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
      // Only wipe on auth errors (401 / TOKEN_INVALID). Network / 5xx
      // should preserve the token so next cold-start can retry.
      const status = (e as { response?: { status?: number } })?.response?.status;
      const code = (e as { code?: string })?.code;
      const isAuth =
        status === 401 ||
        code === 'TOKEN_INVALID' ||
        code === 'TOKEN_EXPIRED' ||
        code === 'UNAUTHENTICATED';
      if (isAuth) {
        await clearRefreshToken();
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
      const data = e.response?.data as
        | { success?: false; error?: { code: string; message: string } }
        | undefined;
      if (data?.error) {
        const err = new Error(data.error.message) as Error & { code?: string };
        err.code = data.error.code;
        throw err;
      }
      throw new Error(e.message);
    }
    throw e;
  }
}

// Re-export AxiosError so feature code can `isAxiosError` without importing axios.
export { AxiosError };
