/**
 * Public types of the auth feature. Mirrors the backend response shape
 * (kept in lockstep — no shared package yet per CLAUDE.md).
 */

export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
};

export type VerifyOtpResponse = {
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export type RequestOtpResponse = { message: string };
