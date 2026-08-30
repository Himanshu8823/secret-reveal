import type { Request, Response, NextFunction } from 'express';
import {
  getMyProfile as getMyProfileService,
  updateProfile as updateProfileService,
  getMyStats as getMyStatsService,
  listUsers as listUsersService,
} from './users.service.js';
import { listUsersQuerySchema, updateProfileSchema } from './users.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape
 * the response envelope.
 *
 * All routes are requireAuth-gated at the router (see users.routes.ts),
 * so `req.user` is guaranteed when the handlers run. We still
 * defensive-guard to make the type-narrowing explicit.
 */

function requireUser(req: Request): { id: string } {
  if (!req.user) {
    // requireAuth guarantees req.user is present; defensive guard.
    return { id: '' };
  }
  return { id: req.user.id };
}

/**
 * GET /users/me
 *
 * Returns the current user's full profile. Mobile profile screen calls
 * this on mount via TanStack Query.
 */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const profile = await getMyProfileService(user.id);
    res.status(200).json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /users/me
 *
 * Update the caller's profile. Body may contain any subset of
 * {name, username, bio, avatarUrl}. Username uniqueness is checked
 * via a hybrid bloom filter (Redis) + Postgres UNIQUE constraint; the
 * service layer surfaces USERNAME_TAKEN as a 409.
 */
export async function patchMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = updateProfileSchema.parse(req.body);
    const updated = await updateProfileService({
      userId: user.id,
      name: body.name,
      username: body.username,
      bio: body.bio,
      avatarUrl: body.avatarUrl,
    });
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users/me/stats
 *
 * Returns aggregate counts for the profile stats row. Two simple COUNT
 * queries run in parallel inside the service.
 */
export async function getMyStats(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const stats = await getMyStatsService(user.id);
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /users?cursor=...&limit=...&search=...
 *
 * Powers the composer's member picker (step 3). Per the product rule
 * the picker shows ALL platform users — no group filter — so this
 * route does not require a groupId. The caller is excluded so the
 * picker doesn't list "me" alongside other people.
 *
 * Cursor pagination + optional case-insensitive search (`search` matches
 * against `name` OR `username`). Both are bounded at the controller so
 * a malformed query becomes a clean 400 via zod, not a 500 from Prisma.
 */
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const q = listUsersQuerySchema.parse(req.query);
    const result = await listUsersService({
      callerId: user.id,
      cursor: q.cursor,
      limit: q.limit,
      search: q.search,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
