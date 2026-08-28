/**
 * Public types of the auth module. Kept narrow on purpose: only what crosses
 * module boundaries (controller output, service inputs).
 */

export type RequestOtpInput = {
  e164: `+${string}`;
};

export type VerifyOtpInput = {
  e164: `+${string}`;
  otp: string;
};

export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
};

export type VerifyOtpResult = {
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};