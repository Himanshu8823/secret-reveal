import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { getMe, patchMe, getMyStats } from './users.controller.js';

/**
 * Users routes. Mounted at /api/v1/users in app.ts.
 *
 * All routes are authenticated. Per CLAUDE.md: every public endpoint that
 * accepts user input gets rate-limited — these are auth-gated so the
 * caller is identifiable via req.user.id, which would be the limiter key
 * when per-user limiting lands. We deliberately don't add speculative
 * middlewares today (rate-limiter-flexible is wired elsewhere already).
 *
 *   GET   /me       — current user's profile (mobile profile page)
 *   PATCH /me       — update profile (mobile edit-profile screen)
 *   GET   /me/stats — aggregate counts (mobile profile stats row)
 */
export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', getMe);
usersRouter.patch('/me', patchMe);
usersRouter.get('/me/stats', getMyStats);
