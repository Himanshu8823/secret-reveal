import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  deleteMyMembership,
  getGroupById,
  getMyGroups,
} from './groups.controller.js';

/**
 * Groups routes. Mounted at /api/v1/groups in app.ts, behind requireAuth.
 *
 * Per CLAUDE.md: every authenticated request is gated by requireAuth.
 *
 * There is no POST /groups and no invite flow anymore. A group is
 * materialised from its member set by the posts module's
 * findOrCreateGroupByMembers; the HTTP surface here is list, get, and
 * leave only.
 */
export const groupsRouter = Router();

groupsRouter.use(requireAuth);

groupsRouter.get('/', getMyGroups);
groupsRouter.get('/:id', getGroupById);
groupsRouter.delete('/:id/members/me', deleteMyMembership);
