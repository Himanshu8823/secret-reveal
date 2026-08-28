import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { patchMe } from './users.controller.js';

/**
 * Users routes. Mounted at /api/v1/users in app.ts.
 *
 * Per CLAUDE.md: every public endpoint that accepts user input gets
 * rate-limited. The only route here right now is authenticated (PATCH
 * /me) — authenticated routes are gated by requireAuth which throws on
 * missing/invalid tokens; rate limiting is a future polish on top of
 * that. We deliberately don't add speculative middlewares.
 */
export const usersRouter = Router();

usersRouter.patch('/me', requireAuth, patchMe);