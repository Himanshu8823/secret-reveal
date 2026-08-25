/**
 * Public types of the auth module. Kept narrow on purpose: only what crosses
 * module boundaries (controller output, service inputs).
 */

export type RequestOtpInput = {
  phone: string;
};

export type VerifyOtpInput = {
  phone: string;
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
