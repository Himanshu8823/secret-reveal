import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { getMe, patchMe, getMyStats, getUsers } from './users.controller.js';
import { rateLimit } from '../../middlewares/rateLimiter.js';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redis } from '../../config/redis.js';

/**
 * Users routes. Mounted at /api/v1/users in app.ts.
 *
 * All routes are authenticated. Per CLAUDE.md: every public endpoint that
 * accepts user input gets rate-limited — these are auth-gated so the
 * caller is identifiable via req.user.id (the limiter key). The list
 * endpoint (`GET /`) is the only one with a search query param, so it's
 * the only one that gets a rate-limit keyed by user id; the rest don't
 * take user input beyond the token.
 *
 *   GET   /          — paginated user list (member picker)
 *   GET   /me        — current user's profile (mobile profile page)
 *   PATCH /me        — update profile (mobile edit-profile screen)
 *   GET   /me/stats  — aggregate counts (mobile profile stats row)
 *
 * NOTE: route ordering matters. `/me` and `/me/stats` must be declared
 * before any catch-all `:id` matcher, otherwise they'd be shadowed by
 * the new GET / route that lists users. There is no :id matcher today,
 * but the convention still applies.
 */
export const usersRouter = Router();

usersRouter.use(requireAuth);

const TEN_MIN = 10 * 60;

// Limiter for the picker list. Search-driven queries are cheap per-call
// but abusive clients could fan out (different `search` strings) to
// scrape the user table; the limiter caps that pattern. Keyed on the
// authenticated user id, not IP, so the cap follows the account.
const usersListLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:users:list:user',
  points: 60,
  duration: TEN_MIN,
  blockDuration: 0,
});

usersRouter.get('/', rateLimit(usersListLimiter, (req) => req.user?.id ?? 'unknown'), getUsers);
usersRouter.get('/me', getMe);
usersRouter.patch('/me', patchMe);
usersRouter.get('/me/stats', getMyStats);
