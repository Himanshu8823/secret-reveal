import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import type { UserProfile, UserStats } from '../modules/users/users.types.js';

/**
 * Cache-aside wrapper around the user's own profile + stats. Lives in
 * Redis with an explicit TTL — never longer than PROFILE_CACHE_TTL_SECONDS
 * per CLAUDE.md ("every Redis key gets an explicit TTL, no key lives
 * forever by accident").
 *
 * Privacy: the cache value is `PublicUserProfile`, NOT `UserProfile`. The
 * phone number is intentionally EXCLUDED from the cached payload — phone
 * is sensitive PII and the cache lives in shared infrastructure, so we
 * keep it out of the cache value entirely (per CLAUDE.md "never cache
 * anything containing another user's private data under a key any other
 * user could guess or access" — the cache key is keyed by userId which
 * is server-derived, but the principle still applies: minimise what
 * leaves the DB).
 *
 * Failure modes are deliberately permissive: a Redis outage MUST NOT
 * 5xx the caller. We log and fall through to the DB path. The cache
 * is an optimization, never an authority — the DB has the truth.
 *
 * Key format: `profile:v1:{userId}`. The `v1` segment is a schema
 * version — if we ever change UserProfile shape, bump to v2 so stale
 * v1 entries are ignored (they'll just expire on TTL).
 */

const KEY_PREFIX = 'profile:v1:';
const profileKey = (userId: string) => `${KEY_PREFIX}${userId}`;
const statsKey = (userId: string) => `${KEY_PREFIX}stats:${userId}`;

/**
 * The subset of UserProfile that's safe to cache. Phone is excluded.
 * createdAt is included because the profile UI displays "Joined [Month
 * Year]" — losing it from the cache would force a DB roundtrip to
 * render that label, defeating the cache's purpose.
 */
export type CachedUserProfile = Omit<UserProfile, 'phone'>;

const PROFILE_TTL = env.PROFILE_CACHE_TTL_SECONDS;

/**
 * Read a cached profile. Returns null on cache miss, parse failure, or
 * Redis unavailability. The caller MUST treat null as "go read from DB".
 */
export async function getCachedProfile(
  userId: string,
): Promise<CachedUserProfile | null> {
  try {
    const raw = await redis.get(profileKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedUserProfile;
  } catch (err) {
    // Redis is down or the entry is corrupt. Fall through to DB.
    logger.warn({ err, userId }, 'profile cache read failed');
    return null;
  }
}

/**
 * Read a cached stats blob. Same semantics as getCachedProfile — null
 * means "go read from DB".
 */
export async function getCachedStats(userId: string): Promise<UserStats | null> {
  try {
    const raw = await redis.get(statsKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as UserStats;
  } catch (err) {
    logger.warn({ err, userId }, 'stats cache read failed');
    return null;
  }
}

/**
 * Write both cache entries after a successful DB read. Both writes
 * fire in parallel; if either fails we log but don't throw — the
 * caller already has the data, the cache is best-effort.
 */
export async function setCachedProfile(
  userId: string,
  profile: CachedUserProfile,
  stats: UserStats,
): Promise<void> {
  try {
    await Promise.all([
      redis.set(profileKey(userId), JSON.stringify(profile), 'EX', PROFILE_TTL),
      redis.set(statsKey(userId), JSON.stringify(stats), 'EX', PROFILE_TTL),
    ]);
  } catch (err) {
    logger.warn({ err, userId }, 'profile cache write failed');
  }
}

/**
 * Write the stats cache entry alone — used when a profile cache hit
 * doesn't need to be rewritten but the caller just fetched fresh stats
 * (e.g., on a stats-only endpoint hit). Same best-effort semantics as
 * setCachedProfile: a Redis failure is logged, not thrown.
 */
export async function setCachedStats(userId: string, stats: UserStats): Promise<void> {
  try {
    await redis.set(statsKey(userId), JSON.stringify(stats), 'EX', PROFILE_TTL);
  } catch (err) {
    logger.warn({ err, userId }, 'stats cache write failed');
  }
}

/**
 * Invalidate both cache entries for a user. Called from updateProfile
 * on successful PATCH so the next read fetches fresh data instead of
 * serving the pre-update cached value. Idempotent — DEL on missing keys
 * is a no-op.
 */
export async function invalidateProfileCache(userId: string): Promise<void> {
  try {
    await Promise.all([redis.del(profileKey(userId)), redis.del(statsKey(userId))]);
  } catch (err) {
    // Failing to invalidate is the dangerous case — the caller will keep
    // seeing the stale value until TTL expires. Log loudly so this is
    // caught in monitoring, but don't crash the request (the DB write
    // already succeeded and is the source of truth).
    logger.error({ err, userId }, 'profile cache invalidation FAILED');
  }
}
