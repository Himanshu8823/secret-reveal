import type { Request, Response, NextFunction } from 'express';
import {
  listNotifications as listNotificationsService,
  markRead as markReadService,
  markAllRead as markAllReadService,
  getUnreadCount as getUnreadCountService,
  registerPushToken as registerPushTokenService,
  unregisterPushToken as unregisterPushTokenService,
} from './notifications.service.js';
import { listNotificationsQuerySchema, registerPushTokenSchema } from './notifications.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape the
 * response envelope.
 *
 * All routes are requireAuth-gated at the router (see notifications.routes.ts),
 * so `req.user` is guaranteed when the handlers run. We still
 * defensive-guard to make the type-narrowing explicit, matching the
 * convention in users.controller.ts.
 */

function requireUser(req: Request): { id: string } {
  if (!req.user) {
    return { id: '' };
  }
  return { id: req.user.id };
}

/**
 * GET /notifications?cursor=...&limit=...
 */
export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const q = listNotificationsQuerySchema.parse(req.query);
    const result = await listNotificationsService({
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
 * POST /notifications/:id/read
 */
export async function postMarkRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    await markReadService(req.params.id, user.id);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/read-all
 */
export async function postMarkAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    await markAllReadService(user.id);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /notifications/unread-count
 */
export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const result = await getUnreadCountService(user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/push-token
 */
export async function postPushToken(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = registerPushTokenSchema.parse(req.body);
    await registerPushTokenService(user.id, body.token);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /notifications/push-token
 */
export async function deletePushToken(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    await unregisterPushTokenService(user.id);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
}
