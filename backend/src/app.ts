import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { groupsRouter, invitesRouter } from './modules/groups/groups.routes.js';
import { postsRouter } from './modules/posts/posts.routes.js';
import { mediaRouter } from './modules/media/media.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestId } from './middlewares/requestId.js';
import { requestLogger } from './middlewares/requestLogger.js';

export function buildApp() {
  const app = express();

  // Security headers — explicit per-directive CSP. Defaults from helmet() are
  // fine for an API that serves no HTML, but we lock them down so any future
  // web client can't accidentally inherit permissive policies.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: {
        maxAge: 15552000, // 180 days
        includeSubDomains: true,
        preload: false,
      },
      crossOriginEmbedderPolicy: false, // mobile clients don't need COEP
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      xFrameOptions: { action: 'deny' },
      hidePoweredBy: true,
    }),
  );

  // CORS: mobile/native clients don't send an Origin header (so they bypass
  // this), but browser clients must respect the allowlist. In development,
  // Expo dev tools (localhost:8081, 19000, 19006) are added implicitly so
  // testing from the Expo web UI works without configuring .env. Production
  // relies entirely on CORS_ORIGINS.
  const devOrigins =
    env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:8081', 'http://localhost:19000', 'http://localhost:19006'];
  const allowedOrigins = [...env.CORS_ORIGINS, ...devOrigins];

  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin (mobile/native) — allow.
        if (!origin) return cb(null, true);
        if (allowedOrigins.length === 0) return cb(null, false);
        return cb(null, allowedOrigins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  // requestId must run BEFORE requestLogger so every logged line carries the
  // correlation id (pino-http reads `req.id`).
  app.use(requestId);
  app.use(requestLogger);

  // Health probes — mounted at root, not under /api/v1, because k8s
  // liveness/readiness and load balancers expect /healthz and /ready there.
  app.use('/', healthRouter);

  // Version banner — makes the API version discoverable. Per CLAUDE.md, every
  // successful response uses the { success, data } envelope, so we use it here.
  app.get('/api/v1', (_req, res) => {
    res.json({ success: true, data: { name: env.APP_NAME, version: 'v1' } });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/invites', invitesRouter);
  app.use('/api/v1/posts', postsRouter);
  app.use('/api/v1/media', mediaRouter);

  // Centralized error handling — must be last.
  app.use(errorHandler);

  return app;
}
