import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  acceptInviteHandler,
  createGroupHandler,
  deleteMyMembership,
  getGroupById,
  getMyGroups,
  listPendingInvitesHandler,
  rejectInviteHandler,
  sendInvitesHandler,
} from './groups.controller.js';

/**
 * Groups routes. Mounted at /api/v1/groups in app.ts, behind requireAuth.
 *
 * Invite flow (simple, per product request):
 *   POST /groups              — create group with creator as first member
 *   POST /groups/:id/invites  — send pending invites (phoneNumbers)
 *   GET  /groups/invites/pending — list my pending invites (must be before /:id)
 */
export const groupsRouter = Router();

groupsRouter.use(requireAuth);

// Pending invites must be before /:id to avoid shadowing
groupsRouter.get('/invites/pending', listPendingInvitesHandler);

groupsRouter.get('/', getMyGroups);
groupsRouter.post('/', createGroupHandler);
groupsRouter.get('/:id', getGroupById);
groupsRouter.post('/:id/invites', sendInvitesHandler);
groupsRouter.delete('/:id/members/me', deleteMyMembership);

// Invites router — mounted at /api/v1/invites (mobile expects POST /invites/:id/accept)
export const invitesRouter = Router();
invitesRouter.use(requireAuth);
invitesRouter.post('/:inviteId/accept', acceptInviteHandler);
invitesRouter.post('/:inviteId/reject', rejectInviteHandler);
