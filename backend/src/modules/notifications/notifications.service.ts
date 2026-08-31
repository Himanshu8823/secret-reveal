import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import { emitToUser } from '../../lib/realtime.js';
import { sendExpoPush } from '../../lib/expoPush.js';
import type {
  CreateNotificationInput,
  ListNotificationsInput,
  ListNotificationsResult,
  NotificationItem,
  NotificationType,
} from './notifications.types.js';

/**
 * Notifications service — business logic lives here per CLAUDE.md.
 *
 * `createNotification` is the single entry point every other module calls
 * to notify a user. It persists the row, then fans out to realtime
 * (Socket.IO, if the user has a live connection) and push (Expo, if the
 * user has a registered token) — both best-effort, neither can fail the
 * write. Callers elsewhere in the codebase (groups.service.ts,
 * posts.service.ts) should call this fire-and-forget so a notification
 * bug never breaks the parent operation (invite/accept/reveal/comment).
 */

function toItem(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  postId: string | null;
  groupId: string | null;
  inviteId: string | null;
  read: boolean;
  createdAt: Date;
}): NotificationItem {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    postId: row.postId,
    groupId: row.groupId,
    inviteId: row.inviteId,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationItem> {
  const { userId, type, title, body, postId, groupId, inviteId } = input;

  const created = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      postId: postId ?? null,
      groupId: groupId ?? null,
      inviteId: inviteId ?? null,
    },
  });

  const item = toItem(created);

  // Realtime fan-out — best-effort, in-process, no-ops if the layer isn't
  // initialized (see lib/realtime.ts). Never let this throw past us.
  try {
    emitToUser(userId, 'notification', item);
  } catch (err) {
    logger.warn({ err, userId }, 'notifications: realtime emit failed');
  }

  // Push fan-out — best-effort, only if the user has a registered token.
  // Fire-and-forget: we don't await inside a try/catch here because
  // sendExpoPush itself never throws (see lib/expoPush.ts), it only logs.
  void (async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true },
    });
    if (user?.expoPushToken) {
      await sendExpoPush({
        to: user.expoPushToken,
        title,
        body,
        data: { type, postId, groupId, inviteId },
      });
    }
  })().catch((err) => {
    logger.warn({ err, userId }, 'notifications: push fan-out failed');
  });

  return item;
}

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof decoded.t === 'string' && typeof decoded.i === 'string') {
      return { createdAt: new Date(decoded.t), id: decoded.i };
    }
  } catch {
    // fall through — bad cursor treated as "no cursor"
  }
  return undefined;
}

/**
 * List a user's notifications, newest first. Cursor pagination on
 * (createdAt, id) DESC, same convention as listUsers/listMyGroups.
 */
export async function listNotifications(
  input: ListNotificationsInput,
): Promise<ListNotificationsResult> {
  const { userId, cursor, limit } = input;

  const cursorClause = decodeCursor(cursor);
  const cursorOr = cursorClause
    ? {
        OR: [
          { createdAt: { lt: cursorClause.createdAt } },
          { createdAt: cursorClause.createdAt, id: { lt: cursorClause.id } },
        ],
      }
    : {};

  const rows = await prisma.notification.findMany({
    where: { userId, ...cursorOr },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ t: last.createdAt.toISOString(), i: last.id }),
        ).toString('base64')
      : null;

  return { notifications: page.map(toItem), nextCursor };
}

/**
 * Mark a single notification read. Throws NOT_FOUND if it doesn't exist or
 * belongs to a different user — same "don't leak existence" posture as
 * other ownership-gated reads in this codebase.
 */
export async function markRead(notificationId: string, userId: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
  if (result.count === 0) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Notification not found');
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function getUnreadCount(userId: string): Promise<{ count: number }> {
  const count = await prisma.notification.count({ where: { userId, read: false } });
  return { count };
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { expoPushToken: token },
  });
}

export async function unregisterPushToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { expoPushToken: null },
  });
}
