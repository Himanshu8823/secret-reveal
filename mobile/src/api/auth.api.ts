import { apiClient, unwrap } from './client';
import type {
  ApiEnvelope,
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../features/auth/types';

/**
 * Auth API surface. The backend envelope is unwrapped here; callers see
 * only the typed `data` payload.
 *
 * Phone input shape: `{ countryCode, phoneNumber }`.
 *   - `countryCode` is the ISO-3166-1 alpha-2 ('IN' / 'US' / 'GB').
 *   - `phoneNumber` is the bare national number WITHOUT a leading + or
 *     country code (e.g. '9876543210', not '+919876543210').
 * The backend validates with libphonenumber-js and returns the E.164 form
 * to the client for storage; we never compose the E.164 on the client.
 */

export async function requestOtp(input: {
  countryCode: string;
  phoneNumber: string;
}): Promise<RequestOtpResponse> {
  return unwrap<RequestOtpResponse>(
    apiClient.post<ApiEnvelope<RequestOtpResponse>>('/auth/otp/request', input),
  );
}

export async function verifyOtp(input: {
  countryCode: string;
  phoneNumber: string;
  otp: string;
}): Promise<VerifyOtpResponse> {
  return unwrap<VerifyOtpResponse>(
    apiClient.post<ApiEnvelope<VerifyOtpResponse>>('/auth/otp/verify', input),
  );
}

/**
 * Exchange a refresh token for a fresh access + refresh pair. Implemented in
 * Phase 0.4 to support cold-start bootstrapping (see boot.ts) and the axios
 * 401-refresh interceptor (see client.ts).
 *
 * Response shape mirrors verifyOtp's `data` payload so callers can use the
 * same setSession reducer.
 */
export async function refresh(input: {
  refreshToken: string;
}): Promise<VerifyOtpResponse> {
  return unwrap<VerifyOtpResponse>(
    apiClient.post<ApiEnvelope<VerifyOtpResponse>>('/auth/refresh', input),
  );
}

/**
 * Logout. Best-effort — the server always responds 204, even if the token is
 * invalid or expired. Returns void; the caller clears local state regardless.
 */
export async function logout(input: { refreshToken: string }): Promise<void> {
  await apiClient.post('/auth/logout', input);
}