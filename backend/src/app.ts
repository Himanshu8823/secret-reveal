import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestLogger } from './middlewares/requestLogger.js';

export function buildApp() {
  const app = express();

  // Security headers — one-line addition per CLAUDE.md.
  app.use(helmet());

  // CORS: mobile clients don't send an Origin header (so they bypass this),
  // but browser clients must respect the allowlist. Empty list = allow none.
  // TODO: lock to known origins once mobile calling pattern is confirmed.
  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin (mobile/native) — allow.
        if (!origin) return cb(null, true);
        if (env.CORS_ORIGINS.length === 0) return cb(null, false);
        return cb(null, env.CORS_ORIGINS.includes(origin));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  // Health check — handy for the dev smoke test.
  app.get('/healthz', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/v1/auth', authRouter);

  // Centralized error handling — must be last.
  app.use(errorHandler);

  return app;
}
