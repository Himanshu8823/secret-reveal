import { Router } from 'express';
import { postRequestOtp, postVerifyOtp } from './auth.controller.js';
import {
  otpRequestByPhoneLimiter,
  otpRequestByIpLimiter,
  otpVerifyByPhoneLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';

/**
 * Auth routes. Rate limits are composed per-route (not global) so future
 * non-auth endpoints aren't penalized.
 *
 * Per CLAUDE.md: every public endpoint that accepts user input gets
 * rate-limited. No exceptions "just for now".
 */
export const authRouter = Router();

authRouter.post(
  '/otp/request',
  rateLimit(otpRequestByPhoneLimiter, (req) => req.body?.phone ?? 'unknown'),
  rateLimit(otpRequestByIpLimiter, (req) => req.ip ?? 'unknown'),
  postRequestOtp,
);

authRouter.post(
  '/otp/verify',
  rateLimit(otpVerifyByPhoneLimiter, (req) => req.body?.phone ?? 'unknown'),
  postVerifyOtp,
);
