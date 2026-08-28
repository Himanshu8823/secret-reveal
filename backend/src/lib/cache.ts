import { redis } from '../config/redis.js';
import { logger } from './logger.js';

/**
 * Transparent cache-aside helpers.
 *
 * Contract (per CLAUDE.md: cache MUST never break the request path):
 *   - JSON-serializable values only; non-serializable values skip caching.
 *   - Every operation swallows Redis errors and falls through to the loader
 *     / no-op. Cache is observability + perf, not correctness.
 *   - Every key gets an explicit TTL with +/-20% jitter to prevent
 *     thundering-herd on expiry.
 *   - Pattern deletes use SCAN, never KEYS (don't block Redis).
 *
 * Privacy posture: viewer-scoped reads (anything that branches on
 * `viewerId`) MUST use the viewer id in the cache key. Do not cache
 * "is this viewer a member / what can this viewer see" results under
 * a generic key another user could guess.
 */

/** Returns ttl * (0.8 + Math.random() * 0.4) — +/-20% jitter. */
function withJitter(ttlSeconds: number): number {
  const jittered = ttlSeconds * (0.8 + Math.random() * 0.4);
  // Round to whole seconds; ioredis SETEX takes seconds as a string anyway.
  return Math.max(1, Math.round(jittered));
}

/**
 * Get a value; on miss, run the loader exactly once and store the result.
 *
 * Loader exceptions propagate to the caller. Cache exceptions do NOT.
 *
 * If the loader returns a non-JSON-serializable value, we return it to the
 * caller but skip writing — caching for that call only. This keeps the
 * helper safe for any return shape.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  // 1. Try the cache. Swallow any Redis error.
  let cached: string | null = null;
  try {
    cached = await redis.get(key);
  } catch (err) {
    logger.debug({ err, key }, 'cache get failed; falling through to loader');
  }

  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as T;
      logger.debug({ key, hit: true }, 'cache hit');
      return parsed;
    } catch (err) {
      // Corrupt entry — discard and reload.
      logger.debug({ err, key }, 'cache value unparseable; reloading');
    }
  } else {
    logger.debug({ key, hit: false }, 'cache miss');
  }

  // 2. Miss (or corrupt): invoke the loader exactly once.
  const value = await loader();

  // 3. Best-effort write. Skip if the value isn't JSON-serializable.
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      await redis.set(key, serialized, 'EX', withJitter(ttlSeconds));
    }
  } catch (err) {
    logger.debug({ err, key }, 'cache set skipped (non-serializable or redis error)');
  }

  return value;
}

/** Invalidate a single key. Never throws. */
export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.debug({ err, key }, 'cache del failed');
  }
}

/**
 * Invalidate every key matching `pattern` (e.g. `cache:post:abc:*`).
 *
 * Uses SCAN with MATCH so we never block Redis on a big keyspace. UNLINK
 * (vs DEL) frees the key memory in the background when the set is large.
 * Never throws.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const allKeys: string[] = await new Promise((resolve, reject) => {
      const collected: string[] = [];
      stream.on('data', (keys: string[]) => {
        for (const k of keys) collected.push(k);
      });
      stream.on('end', () => resolve(collected));
      stream.on('error', reject);
    });
    if (allKeys.length > 0) {
      await redis.unlink(...allKeys);
    }
  } catch (err) {
    logger.debug({ err, pattern }, 'cache delPattern failed');
  }
}

/**
 * Namespaced key builders. Centralized so we don't typo prefixes in
 * service code, and so the cache layer has one obvious place to grep.
 */
export const cacheKey = {
  post: (id: string) => `cache:post:${id}`,
  postResponses: (postId: string, cursor?: string) =>
    `cache:post:${postId}:responses:${cursor ?? 'first'}`,
  group: (id: string) => `cache:group:${id}`,
  userGroups: (userId: string, cursor?: string) =>
    `cache:user:${userId}:groups:${cursor ?? 'first'}`,
};
