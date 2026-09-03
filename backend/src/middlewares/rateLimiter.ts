import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';

type LimiterOpts = {
  keyPrefix: string;
  points: number;
  durationSeconds: number;
};

/**
 * Build a Redis-backed rate limiter. We pass `redis` directly so limits survive
 * server restarts and work across multiple instances (per CLAUDE.md).
 */
function makeLimiter({ keyPrefix, points, durationSeconds }: LimiterOpts) {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix,
    points,
    duration: durationSeconds,
    // We want to reject (not block) when the limit is hit, so callers get an
    // immediate 429 instead of being held open.
    blockDuration: 0,
  });
}

// Window lengths, in seconds. Each limiter states its duration explicitly so
// future tuning doesn't ripple across unrelated endpoints.
const TEN_MIN = 10 * 60;

// --- OTP limits (auth flow) -------------------------------------------------

export const otpRequestByPhoneLimiter = makeLimiter({
  keyPrefix: 'rl:otp:req:phone',
  points: 3,
  durationSeconds: TEN_MIN,
});

export const otpRequestByIpLimiter = makeLimiter({
  keyPrefix: 'rl:otp:req:ip',
  points: 5,
  durationSeconds: TEN_MIN,
});

export const otpVerifyByPhoneLimiter = makeLimiter({
  keyPrefix: 'rl:otp:verify:phone',
  points: 5,
  durationSeconds: TEN_MIN,
});

// --- Auth refresh -----------------------------------------------------------
// Burst control only — reuse-detection (rotated jti + per-family revocation)
// already handles the actual abuse cases. We just cap raw request rate.
export const refreshLimiter = makeLimiter({
  keyPrefix: 'rl:auth:refresh:ip',
  points: 30,
  durationSeconds: TEN_MIN,
});

export const googleSignInLimiter = makeLimiter({
  keyPrefix: 'rl:auth:google:ip',
  points: 10,
  durationSeconds: TEN_MIN,
});

export const phoneLinkRequestLimiter = makeLimiter({
  keyPrefix: 'rl:auth:phonelink:req:user',
  points: 3,
  durationSeconds: TEN_MIN,
});

export const phoneLinkVerifyLimiter = makeLimiter({
  keyPrefix: 'rl:auth:phonelink:verify:user',
  points: 5,
  durationSeconds: TEN_MIN,
});

// --- Posts ------------------------------------------------------------------

export const postCreateLimiter = makeLimiter({
  keyPrefix: 'rl:posts:create:user',
  points: 10,
  durationSeconds: TEN_MIN,
});

export const postResponseLimiter = makeLimiter({
  keyPrefix: 'rl:posts:respond:user',
  points: 30,
  durationSeconds: TEN_MIN,
});

// --- Groups -----------------------------------------------------------------

export const groupCreateLimiter = makeLimiter({
  keyPrefix: 'rl:groups:create:user',
  points: 5,
  durationSeconds: TEN_MIN,
});

export const groupInviteLimiter = makeLimiter({
  keyPrefix: 'rl:groups:invite:user',
  points: 10,
  durationSeconds: TEN_MIN,
});

export const groupInviteResponseLimiter = makeLimiter({
  keyPrefix: 'rl:groups:inviteResponse:user',
  points: 30,
  durationSeconds: TEN_MIN,
});

export const groupLeaveLimiter = makeLimiter({
  keyPrefix: 'rl:groups:leave:user',
  points: 10,
  durationSeconds: TEN_MIN,
});

// --- Notifications ------------------------------------------------------

export const notificationsListLimiter = makeLimiter({
  keyPrefix: 'rl:notifications:list:user',
  points: 60,
  durationSeconds: TEN_MIN,
});

export const pushTokenRegisterLimiter = makeLimiter({
  keyPrefix: 'rl:notifications:pushtoken:user',
  points: 10,
  durationSeconds: TEN_MIN,
});

/**
 * Express middleware factory: consumes `points` from a limiter keyed by
 * `keyFn(req)`. Throws AppError(RATE_LIMITED) on breach, including retry-after.
 */
export function rateLimit(
  limiter: RateLimiterRedis | RateLimiterMemory,
  keyFn: (req: Request) => string,
  points = 1,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyFn(req);
      await limiter.consume(key, points);
      next();
    } catch (errOrRes) {
      // rate-limiter-flexible throws either an Error OR a RateLimiterRes when
      // the limit is exceeded. Both shapes expose msBeforeNext.
      const msBeforeNext =
        (errOrRes as { msBeforeNext?: number }).msBeforeNext ??
        limiter.duration * 1000;
      const retryAfter = Math.ceil(msBeforeNext / 1000);
      logger.warn({ key: keyFn(req), retryAfter }, 'rate limit exceeded');
      next(
        new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${retryAfter}s`, {
          retryAfter,
        }),
      );
    }
  };
}