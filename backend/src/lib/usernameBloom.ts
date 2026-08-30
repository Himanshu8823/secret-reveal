import { BloomFilter } from 'bloom-filters';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { logger } from './logger.js';

// Redis key under which the serialized bloom filter lives. We store the
// whole filter as a single JSON blob (no RedisBloom module dependency) so
// the bloom filter works on any Redis instance — production pattern used
// by Twitter / GitHub / Instagram for username availability at scale.
const BLOOM_KEY = 'usernames:bloom';

// Per-request memoization — bloom filter lookups happen on every profile
// update and the filter itself is immutable for the lifetime of a request,
// so caching it per-call avoids deserializing JSON on each `has()` check.
let memo: BloomFilter | null = null;

/**
 * Return a BloomFilter ready for `has()` checks. Memoizes the deserialized
 * filter for the lifetime of the process — `addUsernameToBloom` and
 * `rebuildBloomFromDb` invalidate the cache so callers always see the
 * latest state.
 *
 * Cold start (no key in Redis): returns an empty, optimally-sized filter.
 * The caller (`rebuildBloomFromDb` at server boot) is responsible for
 * populating it before any `usernameProbablyExists` returns a useful
 * answer — until then every username looks "probably not taken", which
 * is safe because Postgres UNIQUE is the real authority.
 */
export async function getBloom(): Promise<BloomFilter> {
  if (memo) return memo;
  const cached = await redis.get(BLOOM_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Parameters<typeof BloomFilter.fromJSON>[0];
      const restored = BloomFilter.fromJSON(parsed);
      memo = restored;
      return restored;
    } catch (err) {
      // Corrupt cache (e.g., library version drift between writer and
      // reader). Log and fall through to an empty filter — the next
      // rebuild will replace it. Don't crash the boot.
      logger.warn({ err }, 'username bloom cache unreadable, rebuilding');
    }
  }
  const fresh = BloomFilter.create(env.BLOOM_CAPACITY, env.BLOOM_ERROR_RATE);
  memo = fresh;
  return fresh;
}

/**
 * Probabilistic "is this username probably taken?" check. Sub-ms once the
 * filter is in memory. False positives are safe (Postgres catches the
 // truth); false negatives are mathematically impossible by construction.
 */
export async function usernameProbablyExists(username: string): Promise<boolean> {
  const filter = await getBloom();
  return filter.has(username);
}

/**
 * Record a username as taken in the bloom filter and persist the
 * serialized filter back to Redis. Call AFTER a successful DB write so the
 * filter never claims a username is taken before it actually is — a
 // premature "yes" would be a soft cache poison with no recovery until
 // the next rebuild.
 */
export async function addUsernameToBloom(username: string): Promise<void> {
  const filter = await getBloom();
  filter.add(username);
  await redis.set(BLOOM_KEY, JSON.stringify(filter.saveAsJSON()));
  memo = filter;
}

/**
 * Rebuild the bloom filter from scratch by streaming all usernames out of
 * Postgres. Used on cold start (cache empty after a flush or first boot)
 * and as a recovery path if the cache ever becomes corrupt.
 *
 * For v1 we load all non-null usernames in a single findMany — fine up to
 * ~100K users (the bloom JSON is ~1.14 MB regardless of how full it is).
 * Above that we'd want cursor-based streaming; YAGNI for now.
 */
export async function rebuildBloomFromDb(): Promise<{ count: number }> {
  logger.info('rebuilding username bloom from DB…');
  const filter = BloomFilter.create(env.BLOOM_CAPACITY, env.BLOOM_ERROR_RATE);
  const rows = await prisma.user.findMany({
    where: { username: { not: null } },
    select: { username: true },
  });
  for (const row of rows) {
    if (row.username) filter.add(row.username);
  }
  await redis.set(BLOOM_KEY, JSON.stringify(filter.saveAsJSON()));
  memo = filter;
  logger.info({ count: rows.length }, 'rebuilt username bloom');
  return { count: rows.length };
}

/**
 * Ensure the bloom filter is populated. Idempotent: if Redis already has
 * the filter we do nothing; otherwise we rebuild from the DB. Called once
 * at server boot so the very first profile update sees a warm filter.
 */
export async function ensureBloomLoaded(): Promise<void> {
  const exists = await redis.exists(BLOOM_KEY);
  if (!exists) {
    await rebuildBloomFromDb();
  } else {
    // Hydrate the in-process memo from Redis so the first `has()` call
    // doesn't pay the deserialization cost.
    await getBloom();
  }
}
