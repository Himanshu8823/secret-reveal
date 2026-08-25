import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const app = buildApp();

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
