import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  postCreateLimiter,
  postResponseLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';
import {
  postCreate,
  getPostDetail,
  getResponses,
  postResponse,
} from './posts.controller.js';

/**
 * Posts routes. Mounted at /api/v1/posts in app.ts.
 *
 * Per CLAUDE.md: every public endpoint that accepts user input gets
 * rate-limited. requireAuth is applied at the router level so every
 * handler can assume req.user is set; per-route limiters are mounted
 * individually on the write paths (after auth, before validation, so
 * abuse is rejected cheaply without parsing bodies).
 */
export const postsRouter = Router();

postsRouter.use(requireAuth);

postsRouter.post('/', rateLimit(postCreateLimiter, (req) => req.user?.id ?? 'unknown'), postCreate);
postsRouter.get('/:id', getPostDetail);
postsRouter.get('/:id/responses', getResponses);
postsRouter.post(
  '/:id/responses',
  rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postResponse,
);