import type { Request, Response } from 'express';
import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../lib/logger.js';

/**
 * Health probes — liveness + readiness.
 *
 * Per CLAUDE.md: keep business logic in services / controllers thin; this
 * is a thin adapter between Express and the two probe functions below.
 * Per task spec: `/healthz` is cheap (process-alive only); `/ready` actually
 * pings dependencies with a timeout, in parallel, with a short cache, and
 * logs transitions via the existing pino logger.
 */

const PROBE_TIMEOUT_MS = 2000;
const READINESS_CACHE_TTL_MS = 5000;

type CheckStatus = 'ok' | 'down';
interface CheckResult {
  status: CheckStatus;
  latencyMs: number;
  error?: string;
}
interface ReadinessChecks {
  postgres: CheckResult;
  redis: CheckResult;
}
interface ReadinessResponse {
  status: 'ok' | 'degraded';
  checks: ReadinessChecks;
  timestamp: string;
}

/**
 * Run a check under a timeout. If the wrapped promise doesn't settle in
 * `ms`, we resolve with `timeout: true` rather than letting the request hang.
 * We intentionally swallow any error so the caller always gets a structured
 * result — the whole point of health endpoints is that they degrade,
 * not crash.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probePostgres(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS, 'postgres');
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeRedis(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const reply = await withTimeout(redis.ping(), PROBE_TIMEOUT_MS, 'redis');
    if (reply !== 'PONG') {
      return {
        status: 'down',
        latencyMs: Date.now() - start,
        error: `unexpected ping reply: ${String(reply)}`,
      };
    }
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Readiness probe — probes Postgres + Redis in parallel, caches the
 * result for 5s. The cache lives in-process; it resets on restart, which
 * is acceptable since k8s rolling-restarts each pod independently anyway.
 *
 * One health request per pod per 5s keeps repeated probes from hammering
 * the DB during a tight readiness-loop scenario.
 */
let cachedReadiness: ReadinessResponse | undefined;
let cacheExpiresAt = 0;
let lastOverallStatus: 'ok' | 'degraded' | undefined;

export async function buildReadiness(): Promise<ReadinessResponse> {
  const now = Date.now();
  if (cachedReadiness && now < cacheExpiresAt) return cachedReadiness;

  const [postgres, redisCheck] = await Promise.all([probePostgres(), probeRedis()]);

  const checks: ReadinessChecks = { postgres, redis: redisCheck };
  const allOk = postgres.status === 'ok' && redisCheck.status === 'ok';
  const result: ReadinessResponse = {
    status: allOk ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  };

  // Log transitions only — stable-state churn during a partial outage would
  // flood the logs otherwise.
  if (lastOverallStatus !== undefined && lastOverallStatus !== result.status) {
    logger.info(
      { from: lastOverallStatus, to: result.status, checks },
      'readiness status changed',
    );
  }
  lastOverallStatus = result.status;

  cachedReadiness = result;
  cacheExpiresAt = now + READINESS_CACHE_TTL_MS;
  return result;
}

/**
 * GET /healthz — liveness.
 * Process alive, event loop responsive — that's the whole contract.
 * Never touches dependencies. Cheap on purpose.
 */
export function getLiveness(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * GET /ready — readiness.
 * Pings Postgres + Redis. 200 on healthy, 503 if either dependency is down.
 * Uses the standard envelope; failures are conveyed via `success: false`.
 */
export async function getReadiness(_req: Request, res: Response): Promise<void> {
  const result = await buildReadiness();
  const httpStatus = result.status === 'ok' ? 200 : 503;
  if (result.status === 'ok') {
    res.status(httpStatus).json({ success: true, data: result });
  } else {
    res.status(httpStatus).json({
      success: false,
      data: result,
      error: {
        code: 'NOT_READY',
        message: 'One or more dependencies are unhealthy.',
      },
    });
  }
}
