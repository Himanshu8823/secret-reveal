import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import {
  getGroup as getGroupService,
  leaveGroup as leaveGroupService,
  listMyGroups as listMyGroupsService,
} from './groups.service.js';
import { listMyGroupsQuery } from './groups.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape
 * the response envelope.
 *
 * Validation throws ZodError, which the central error middleware maps to
 * the standard envelope. Auth errors come from the requireAuth middleware
 * mounted at the router level.
 *
 * Groups are no longer created or invited to explicitly. A group IS its
 * member set: the only entrypoint that produces groups is
 * findOrCreateGroupByMembers inside the posts module. The HTTP surface
 * here is therefore read + leave only.
 */

function requireUser(req: Request): { id: string } {
  if (!req.user) {
    // requireAuth guarantees req.user is present; defensive guard.
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Authentication required');
  }
  return { id: req.user.id };
}

/**
 * GET /groups?cursor=...&limit=...
 *
 * Lists groups the caller is a member of, sorted by lastActivityAt DESC.
 * Cursor pagination. The only listing scope we ship today; other scopes
 * (e.g., public discover) land later.
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
 * DELETE /groups/:id/members/me
 *
 * Leave a group. Every member can leave freely — there is no creator.
 */
export async function deleteMyMembership(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = requireUser(req);
    const groupId = req.params.id;
    if (!groupId) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Missing group id');
    }
    await leaveGroupService({ userId: user.id, groupId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
