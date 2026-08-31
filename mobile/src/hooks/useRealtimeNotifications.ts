import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import type { NotificationItem } from '../api/notifications.api';

/**
 * Realtime layer for the notification bell — connects to the backend's
 * Socket.IO server (see backend/src/lib/realtime.ts) so a new notification
 * shows up instantly instead of waiting for the next poll/focus refetch.
 *
 * Single connection per app session, reused across screens: this hook is
 * meant to be mounted once near the root (app/(app)/_layout.tsx), not per
 * screen. It authenticates with the same access token used for HTTP calls,
 * and on any 'notification' event just invalidates the relevant query keys
 * — the existing TanStack Query fetchers become the source of truth, this
 * hook only tells them "something changed, go refetch."
 *
 * The API base URL includes a `/api/v1` suffix (see api/client.ts);
 * Socket.IO attaches to the bare HTTP server, not that path, so we strip it.
 */
function deriveSocketOrigin(): string {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
  return apiUrl.replace(/\/api\/v1\/?$/, '');
}

export function useRealtimeNotifications(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(deriveSocketOrigin(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('notification', (_payload: NotificationItem) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // Re-connect whenever the access token changes (login/refresh/logout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);
}
