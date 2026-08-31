import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  rateLimit,
  notificationsListLimiter,
  pushTokenRegisterLimiter,
} from '../../middlewares/rateLimiter.js';
import {
  getNotifications,
  postMarkRead,
  postMarkAllRead,
  getUnreadCount,
  postPushToken,
  deletePushToken,
} from './notifications.controller.js';

/**
 * Notifications routes. Mounted at /api/v1/notifications in app.ts.
 *
 * All routes are authenticated — the caller is always acting on their own
 * notifications, identified via req.user.id.
 *
 *   GET    /                — paginated notification list (bell screen)
 *   POST   /:id/read        — mark one read
 *   POST   /read-all        — mark all read
 *   GET    /unread-count    — badge count
 *   POST   /push-token      — register this device's Expo push token
 *   DELETE /push-token      — unregister (called on logout)
 *
 * NOTE: route ordering matters. `/read-all`, `/unread-count`, and
 * `/push-token` must be declared before the `/:id/read` matcher would ever
 * shadow them — they don't share a prefix here, but the convention (from
 * users.routes.ts) is to keep static routes visually grouped ahead of
 * param routes regardless.
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  rateLimit(notificationsListLimiter, (req) => req.user?.id ?? 'unknown'),
  getNotifications,
);
notificationsRouter.post('/read-all', postMarkAllRead);
notificationsRouter.get('/unread-count', getUnreadCount);
notificationsRouter.post(
  '/push-token',
  rateLimit(pushTokenRegisterLimiter, (req) => req.user?.id ?? 'unknown'),
  postPushToken,
);
notificationsRouter.delete('/push-token', deletePushToken);
notificationsRouter.post('/:id/read', postMarkRead);
