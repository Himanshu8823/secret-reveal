import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

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
