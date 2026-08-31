import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

/**
 * Notifications API surface. Mirrors the backend `notifications` module.
 * The backend envelope is unwrapped here; callers see only the typed
 * `data` payload.
 */

export type NotificationType =
  | 'invite'
  | 'invite_accepted'
  | 'reveal'
  | 'comment'
  | 'response';

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

export type ListNotificationsResponse = {
  notifications: NotificationItem[];
  nextCursor: string | null;
};

export async function listNotifications(params: {
  cursor?: string;
  limit?: number;
} = {}): Promise<ListNotificationsResponse> {
  const query: Record<string, string> = {};
  if (params.cursor) query.cursor = params.cursor;
  if (params.limit) query.limit = String(params.limit);
  return unwrap<ListNotificationsResponse>(
    apiClient.get<ApiEnvelope<ListNotificationsResponse>>('/notifications', {
      params: Object.keys(query).length > 0 ? query : undefined,
    }),
  );
}

export async function markNotificationRead(id: string): Promise<void> {
  await unwrap<null>(
    apiClient.post<ApiEnvelope<null>>(`/notifications/${id}/read`),
  );
}

export async function markAllNotificationsRead(): Promise<void> {
  await unwrap<null>(apiClient.post<ApiEnvelope<null>>('/notifications/read-all'));
}

export async function getUnreadNotificationCount(): Promise<{ count: number }> {
  return unwrap<{ count: number }>(
    apiClient.get<ApiEnvelope<{ count: number }>>('/notifications/unread-count'),
  );
}

export async function registerPushToken(token: string): Promise<void> {
  await unwrap<null>(
    apiClient.post<ApiEnvelope<null>>('/notifications/push-token', { token }),
  );
}

export async function unregisterPushToken(): Promise<void> {
  await unwrap<null>(
    apiClient.delete<ApiEnvelope<null>>('/notifications/push-token'),
  );
}
