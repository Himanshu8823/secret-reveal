import { revealDuePosts } from '../modules/posts/posts.service.js';
import { logger } from '../lib/logger.js';

/**
 * Reveal worker — periodically flips posts from 'active' to 'revealed'
 * once their DiscussionMeta.revealEndsAt passes.
 *
 * Per CLAUDE.md: no queues / background job frameworks. setInterval in
 * the same Node process is the right answer at this stage. The DB-level
 * update in revealDuePosts is idempotent (status='active' guard), so a
 * second concurrent sweeper (e.g. after a process restart and an
 * in-flight tick overlap) is safe.
 *
 * Sweep cadence: every 30 seconds. Reveal timing in the product is
 * coarse (5 minute minimum, 24 hour ceiling — see createPostSchema),
 * so 30s is a comfortable margin without hammering Postgres. We also
 * run a sweep once at boot so a server restart doesn't leave posts
 * stuck in 'active' for the duration of the next tick.
 *
 * Lifecycle:
 *   startRevealWorker() — idempotent; safe to call once from server.ts
 *   stopRevealWorker()  — call on SIGTERM/SIGINT alongside server.close
 *
 * The timer is `.unref()`-ed so a never-stopped worker doesn't pin the
 * process during a hot reload. Production shutdown goes through stop().
 */

const SWEEP_INTERVAL_MS = 30 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;
let isSweepInFlight = false;

/**
 * Run a single sweep. Exported for tests and for one-shot invocations
 * (e.g. boot-time warm-up).
 *
 * Re-entrancy guard: if a sweep is already running when the timer ticks
 * again, skip the new tick. Postgres won't benefit from a second
 * concurrent SELECT against the same index, and the in-flight sweep
 * already covers everything revealed between the two ticks.
 */
export async function runRevealSweep(): Promise<string[]> {
  if (isSweepInFlight) {
    logger.debug('reveal sweep already in flight; skipping this tick');
    return [];
  }
  isSweepInFlight = true;
  try {
    return await revealDuePosts();
  } catch (err) {
    // A failed sweep must not crash the process. Log and move on — the
    // next tick will retry the same set of candidates.
    logger.error({ err }, 'reveal sweep failed');
    return [];
  } finally {
    isSweepInFlight = false;
  }
}

/**
 * Start the periodic sweep. Idempotent: a second call while already
 * running is a no-op (we don't double-tick).
 */
export function startRevealWorker(): void {
  if (intervalHandle !== null) {
    logger.warn('reveal worker already started; ignoring second startRevealWorker call');
    return;
  }

  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, 'reveal worker starting');

  // Fire-and-forget boot sweep. The interval below will pick up anything
  // missed (process crash mid-sweep, etc.) on the next tick.
  void runRevealSweep();

  intervalHandle = setInterval(() => {
    void runRevealSweep();
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive solely for this timer — server.ts owns
  // the event loop and will call stopRevealWorker() on shutdown.
  intervalHandle.unref();
}

/**
 * Stop the periodic sweep. Safe to call multiple times. After stop, the
 * in-flight tick (if any) finishes naturally — we don't try to abort
 * the DB transaction mid-flight.
 */
export function stopRevealWorker(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  logger.info('reveal worker stopped');
}
