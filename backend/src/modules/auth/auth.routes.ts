import { Router } from 'express';
import {
  postRequestOtp,
  postVerifyOtp,
  postRefresh,
  postLogout,
} from './auth.controller.js';
import {
  otpRequestByPhoneLimiter,
  otpRequestByIpLimiter,
  otpVerifyByPhoneLimiter,
  refreshLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';

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