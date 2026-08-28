import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import {
  acceptInvite as acceptInviteService,
  createGroup as createGroupService,
  getGroup as getGroupService,
  leaveGroup as leaveGroupService,
  listMyGroups as listMyGroupsService,
  listPendingInvites as listPendingInvitesService,
  rejectInvite as rejectInviteService,
  sendInvites as sendInvitesService,
} from './groups.service.js';
import {
  createGroupSchema,
  listMyGroupsQuery,
  sendInvitesSchema,
} from './groups.validation.js';

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
 * Creates a new group with the caller as creator + sole initial member.
 * Optional `phoneNumbers` are turned into pending GroupInvite rows.
 */
export async function postGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = createGroupSchema.parse(req.body);
    const group = await createGroupService({
      creatorId: user.id,
      name: body.name,
      phoneNumbers: body.phoneNumbers,
    });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
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
 * GET /groups/:id/posts
 *
 * Placeholder for Phase 3a. Returns an empty array so the Home screen
 * can wire to a real URL today; the actual feed lands with the posts
 * migration.
 */
export async function getGroupPosts(_req: Request, res: Response) {
  res.status(200).json({ success: true, data: [] });
}

/**
 * POST /groups/:id/invites
 *
 * Send invites to one or more phone numbers. The caller must already be
 * a member of the group. Returns the count actually created (existing
 * members / pending invites are skipped silently).
 */
export async function postGroupInvites(
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
    const body = sendInvitesSchema.parse(req.body);
    const result = await sendInvitesService({
      inviterId: user.id,
      groupId,
      phoneNumbers: body.phoneNumbers,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /groups/invites/pending
 *
 * Lists invites sent TO the caller that are still pending.
 */
export async function getPendingInvites(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = requireUser(req);
    const result = await listPendingInvitesService(user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /invites/:id/accept
 *
 * Accepts an invite addressed to the caller. Creates a GroupMember row
 * and flips the invite to accepted, all in one transaction.
 */
export async function postAcceptInvite(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = requireUser(req);
    const inviteId = req.params.id;
    if (!inviteId) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Missing invite id');
    }
    const invite = await acceptInviteService({
      inviteId,
      userId: user.id,
    });
    res.status(200).json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /invites/:id/reject
 *
 * Rejects an invite addressed to the caller. No membership change.
 */
export async function postRejectInvite(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = requireUser(req);
    const inviteId = req.params.id;
    if (!inviteId) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Missing invite id');
    }
    const invite = await rejectInviteService({
      inviteId,
      userId: user.id,
    });
    res.status(200).json({ success: true, data: invite });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /groups/:id/members/me
 *
 * Leave a group. Creator cannot leave — they must delete the group
 * (not a v1 endpoint).
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