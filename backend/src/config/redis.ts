import Redis from 'ioredis';
import { env } from './env.js';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    // Don't block boot if Redis is briefly unavailable; surface errors via logs
    // and let rate-limiter-flexible / OTP routes return 5xx naturally.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
