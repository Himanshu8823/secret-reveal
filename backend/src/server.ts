import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { ensureBloomLoaded } from './lib/usernameBloom.js';

const app = buildApp();

// Warm the username uniqueness bloom filter before we start accepting
// traffic. ensureBloomLoaded is a no-op when the filter is already in
// Redis (the common case on restart); it rebuilds from Postgres on cold
// start or after a flush. Done synchronously before .listen() so the
// first profile-update request always sees a warm filter.
void ensureBloomLoaded().catch((err) => {
  // Don't crash boot — Postgres UNIQUE still catches conflicts. Just log
  // so the operator notices the filter is cold.
  logger.warn({ err }, 'username bloom failed to warm at boot');
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'backend listening');
});

// Graceful shutdown — let in-flight requests finish on SIGTERM/SIGINT.
const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  // Hard kill after 10s if connections won't drain.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
