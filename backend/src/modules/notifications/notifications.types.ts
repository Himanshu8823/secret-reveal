/**
 * Public types of the notifications module. Narrow on purpose: only what
 * crosses module boundaries.
 */

export type NotificationType =
  | 'invite'
  | 'invite_accepted'
  | 'reveal'
  | 'comment'
  | 'response';

/**
 * Row shape returned by GET /notifications. Mirrors the Notification model
 * minus internal fields not useful to the client.
 */
export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  postId: string | null;
  groupId: string | null;
  inviteId: string | null;
  read: boolean;
  createdAt: string;
};

export type ListNotificationsInput = {
  userId: string;
  cursor?: string;
  limit: number;
};

/**
 * Cursor-paginated result for GET /notifications. `nextCursor` is the value
 * the client passes back as `?cursor=` to fetch the next page; null means
 * "no more pages".
 */
export type ListNotificationsResult = {
  notifications: NotificationItem[];
  nextCursor: string | null;
};

/**
 * Service-layer input for creating a notification. This is the one function
 * every other module calls to notify a user — push + realtime delivery are
 * centralized inside createNotification, not scattered across callers.
 */
export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  postId?: string;
  groupId?: string;
  inviteId?: string;
};
