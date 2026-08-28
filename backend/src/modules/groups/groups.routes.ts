import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  groupCreateLimiter,
  groupInviteLimiter,
  groupInviteResponseLimiter,
  groupLeaveLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';
import {
  deleteMyMembership,
  getGroupById,
  getGroupPosts,
  getMyGroups,
  getPendingInvites,
  postAcceptInvite,
  postGroup,
  postGroupInvites,
  postRejectInvite,
} from './groups.controller.js';

/**
 * Groups routes. Mounted at /api/v1/groups in app.ts, behind requireAuth.
 *
 * Per CLAUDE.md: every authenticated request is gated by requireAuth.
 * Rate limits are mounted per-route — after auth, before validation — so
 * abusive clients are rejected cheaply without parsing bodies.
 *
 * `POST /invites/:id/{accept,reject}` are mounted on this router too so
 * they sit alongside the rest of the groups surface, but the URL is
 * un-nested (`/api/v1/invites/...`) for the mobile client. The router
 * is therefore split into two exports: `groupsRouter` for /groups/* and
 * `invitesRouter` for /invites/*. See app.ts for the mount points.
 */
export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.post(
  '/',
  rateLimit(groupCreateLimiter, (req) => req.user?.id ?? 'unknown'),
  postGroup,
);
groupsRouter.get('/', getMyGroups);
groupsRouter.get('/:id', getGroupById);
groupsRouter.get('/:id/posts', getGroupPosts);
groupsRouter.post(
  '/:id/invites',
  rateLimit(groupInviteLimiter, (req) => req.user?.id ?? 'unknown'),
  postGroupInvites,
);
groupsRouter.get('/invites/pending', getPendingInvites);
groupsRouter.delete(
  '/:id/members/me',
  rateLimit(groupLeaveLimiter, (req) => req.user?.id ?? 'unknown'),
  deleteMyMembership,
);

/**
 * Separate router for the global `/invites/:id/...` URLs. Mounted at
 * /api/v1 in app.ts. requireAuth still applies per-route so the unauth
 * middleware doesn't run globally.
 */
export const invitesRouter = Router();

invitesRouter.use(requireAuth);

invitesRouter.post(
  '/:id/accept',
  rateLimit(groupInviteResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postAcceptInvite,
);
invitesRouter.post(
  '/:id/reject',
  rateLimit(groupInviteResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postRejectInvite,
);