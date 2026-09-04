import { z } from 'zod';
import { phoneRawShapeSchema } from './phone.schema.js';

// Re-export so other modules that want phone validation (e.g. profile update
// in v2) can import from one place.
export { phoneInputSchema, phoneRawShapeSchema } from './phone.schema.js';
export type { PhoneInput, PhoneRawInput } from './phone.schema.js';

/**
 * Request body for POST /auth/request-otp.
 *   { countryCode: 'IN' | 'US' | 'GB', phoneNumber: '9876543210' }
 * The controller separately re-parses via phoneInputSchema to derive e164.
 */
export const requestOtpSchema = phoneRawShapeSchema;

export type RequestOtpBody = z.infer<typeof requestOtpSchema>;

/**
 * Request body for POST /auth/verify-otp.
 * Same phone shape, plus a 6-digit OTP.
 */
export const verifyOtpSchema = phoneRawShapeSchema.extend({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;

/**
 * Request body for POST /auth/refresh.
 * Per 03-BACKEND-ARCHITECTURE.md §5.2.1: refresh token travels in the body
 * (mobile clients can pass it without exposing it to any middleware that
 * strips Authorization headers).
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'refreshToken required'),
});
export type RefreshBody = z.infer<typeof refreshSchema>;

/**
 * Request body for POST /auth/logout.
 * Same shape as refresh — the client sends the refresh token it wants to
 * invalidate. Logout is best-effort and always returns 204; a malformed
 * token does not leak whether it was valid.
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(10),
});
export type LogoutBody = z.infer<typeof logoutSchema>;
