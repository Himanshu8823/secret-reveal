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

// 10 minutes in seconds — shared by all OTP-related limits.
const TEN_MIN = 10 * 60;

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
