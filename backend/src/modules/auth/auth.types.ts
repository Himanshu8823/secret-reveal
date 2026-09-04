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
  /**
   * Still nullable at the type level because the column is nullable (a
   * leftover from the removed Google sign-in path). In practice OTP is
   * the only signup route, so every account created today has one.
   */
  phone: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

export type VerifyOtpResult = {
  isNewUser: boolean;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};