import { Router } from 'express';
import {
  postRequestOtp,
  postVerifyOtp,
  postRefresh,
  postLogout,
  postGoogleSignIn,
  postRequestPhoneLink,
  postVerifyPhoneLink,
} from './auth.controller.js';
import {
  otpRequestByPhoneLimiter,
  otpRequestByIpLimiter,
  otpVerifyByPhoneLimiter,
  refreshLimiter,
  googleSignInLimiter,
  phoneLinkRequestLimiter,
  phoneLinkVerifyLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';
import { requireAuth } from '../../middlewares/auth.js';

/**
 * Auth routes. Rate limits are composed per-route (not global) so future
 * non-auth endpoints aren't penalized.
 *
 * Per CLAUDE.md: every public endpoint that accepts user input gets
 * rate-limited. No exceptions "just for now".
 *
 * Rate-limit keys are derived from the request body. Because the body now
 * carries `{ countryCode, phoneNumber }` instead of a pre-joined E.164, we
 * compose the key with a `+` separator — distinct from any phone format
 * we accept. The key is opaque; what matters is that the same phone always
 * lands on the same key.
 */
function phoneKeyFromBody(req: { body?: { countryCode?: unknown; phoneNumber?: unknown } }): string {
  const cc = typeof req.body?.countryCode === 'string' ? req.body.countryCode : 'unknown';
  const pn = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber : 'unknown';
  return `${cc}+${pn}`;
}

export const authRouter = Router();

authRouter.post(
  '/otp/request',
  rateLimit(otpRequestByPhoneLimiter, phoneKeyFromBody),
  rateLimit(otpRequestByIpLimiter, (req) => req.ip ?? 'unknown'),
  postRequestOtp,
);

authRouter.post(
  '/otp/verify',
  rateLimit(otpVerifyByPhoneLimiter, phoneKeyFromBody),
  postVerifyOtp,
);

/**
 * Refresh + logout.
 *
 * /refresh is rate-limited by IP (refreshLimiter) as burst control. The real
 * abuse guard lives in the reuse-detection algorithm in token.service
 * (rotated jti + per-family revocation). /logout is intentionally
 * un-throttled — it is idempotent.
 */
authRouter.post('/refresh', rateLimit(refreshLimiter, (req) => req.ip ?? 'unknown'), postRefresh);
authRouter.post('/logout', postLogout);

/**
 * Google sign-in. Rate-limited by IP only — there's no phone/email in the
 * body to key on before the token is verified, and the verification call
 * itself (network round-trip to Google's JWK cache) already bounds abuse
 * cost per request.
 */
authRouter.post(
  '/google',
  rateLimit(googleSignInLimiter, (req) => req.ip ?? 'unknown'),
  postGoogleSignIn,
);

/**
 * Phone-link (post-Google-signup onboarding). Both routes require an
 * authenticated caller — you can only attach a phone to your OWN account.
 * Rate-limited by user id (the resource being mutated) same as the OTP
 * login routes are keyed by phone.
 */
authRouter.post(
  '/phone/link/request',
  requireAuth,
  rateLimit(phoneLinkRequestLimiter, (req) => req.user?.id ?? 'unknown'),
  postRequestPhoneLink,
);
authRouter.post(
  '/phone/link/verify',
  requireAuth,
  rateLimit(phoneLinkVerifyLimiter, (req) => req.user?.id ?? 'unknown'),
  postVerifyPhoneLink,
);