import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import {
  createGroup as createGroupService,
  listMyGroups as listMyGroupsService,
  getGroup as getGroupService,
} from './groups.service.js';
import { createGroupSchema, listMyGroupsQuery } from './groups.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape
 * the response envelope.
 *
 * Validation throws ZodError, which the central error middleware maps to
 * the standard envelope. Auth errors come from the requireAuth middleware
 * mounted at the router level.
 */

function requireUser(req: Request): { id: string } {
  if (!req.user) {
    // requireAuth guarantees req.user is present; defensive guard.
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Authentication required');
  }
  return { id: req.user.id };
}

/**
 * POST /groups
 *
 * Creates a new group with the caller as creator + initial member.
 * Optional `memberIds` are added as additional members in the same
 * transaction (atomic — never a group with zero members).
 */
export async function postGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = createGroupSchema.parse(req.body);
    const group = await createGroupService({
      creatorId: user.id,
      name: body.name,
      memberIds: body.memberIds,
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /groups?mine=true&cursor=...&limit=...
 *
 * Lists groups the caller is a member of, sorted by lastActivityAt DESC.
 * Cursor pagination. `mine=true` is required — the only listing scope
 * we ship today; other scopes (e.g., public discover) land later.
 */
export async function getMyGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const q = listMyGroupsQuery.parse(req.query);
    const result = await listMyGroupsService({
      userId: user.id,
      cursor: q.cursor,
      limit: q.limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /groups/:id
 *
 * Returns the single group with its members. 404 if the group doesn't
 * exist, 403 if the caller is not a member (privacy posture: we don't
 * leak existence to non-members, but a clearly-bad id gets a clear 404).
 */
export async function getGroupById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const groupId = req.params.id;
    if (!groupId) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Missing group id');
    }
    const group = await getGroupService(user.id, groupId);
    res.status(200).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /groups/:id/posts
 *
 * Placeholder for Phase 3a. Returns an empty array so the Home screen
 * can wire to a real URL today; the actual feed lands with the posts
 * migration.
 */
export async function getGroupPosts(_req: Request, res: Response) {
  res.status(200).json({ success: true, data: [] });
}
