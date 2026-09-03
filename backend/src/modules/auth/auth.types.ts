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

/**
 * Result of POST /auth/google. Same shape as VerifyOtpResult plus
 * `needsPhone` — true when the account has no verified phone yet, which
 * the client uses to route straight to the phone-link onboarding step
 * instead of (or before) the name/username welcome screen.
 */
export type GoogleSignInResult = VerifyOtpResult & {
  needsPhone: boolean;
};