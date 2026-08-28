import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { groupCreateLimiter, rateLimit } from '../../middlewares/rateLimiter.js';
import {
  postGroup,
  getMyGroups,
  getGroupById,
  getGroupPosts,
} from './groups.controller.js';

/**
 * Groups routes. Mounted at /api/v1/groups in app.ts, behind requireAuth.
 *
 * Per CLAUDE.md: every authenticated request is gated by requireAuth.
 * We only rate-limit the write path (group creation) — reads are
 * membership-scoped and low risk. The limiter is mounted after
 * requireAuth (so req.user is available for the key) and before
 * validation, so abusive clients are rejected before we parse a body.
 */
export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.post('/', rateLimit(groupCreateLimiter, (req) => req.user?.id ?? 'unknown'), postGroup);
groupsRouter.get('/', getMyGroups);
groupsRouter.get('/:id', getGroupById);
groupsRouter.get('/:id/posts', getGroupPosts);