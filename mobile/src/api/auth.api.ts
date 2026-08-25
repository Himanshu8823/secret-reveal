import { apiClient, unwrap } from './client';
import type {
  ApiEnvelope,
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../features/auth/types';

/**
 * Auth API surface. The backend envelope is unwrapped here; callers see
 * only the typed `data` payload.
 */

export async function requestOtp(phone: string): Promise<RequestOtpResponse> {
  return unwrap<RequestOtpResponse>(
    apiClient.post<ApiEnvelope<RequestOtpResponse>>('/auth/otp/request', { phone }),
  );
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResponse> {
  return unwrap<VerifyOtpResponse>(
    apiClient.post<ApiEnvelope<VerifyOtpResponse>>('/auth/otp/verify', { phone, otp }),
  );
}
