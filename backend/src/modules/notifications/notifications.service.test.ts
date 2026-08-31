import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../../lib/realtime.js', () => ({
  emitToUser: vi.fn(),
}));
vi.mock('../../lib/expoPush.js', () => ({
  sendExpoPush: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../config/db.js';
import { emitToUser } from '../../lib/realtime.js';
import { sendExpoPush } from '../../lib/expoPush.js';
import {
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
} from './notifications.service.js';
import { AppError } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  notification: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNotification', () => {
  it('persists the row and emits it over realtime', async () => {
    const row = {
      id: 'notif-1',
      userId: 'user-1',
      type: 'invite',
      title: 'New invite',
      body: 'Someone invited you',
      postId: null,
      groupId: 'group-1',
      inviteId: 'invite-1',
      read: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    mockPrisma.notification.create.mockResolvedValue(row);
    mockPrisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

    const result = await createNotification({
      userId: 'user-1',
      type: 'invite',
      title: 'New invite',
      body: 'Someone invited you',
      groupId: 'group-1',
      inviteId: 'invite-1',
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'invite',
        title: 'New invite',
        body: 'Someone invited you',
        postId: null,
        groupId: 'group-1',
        inviteId: 'invite-1',
      },
    });
    expect(emitToUser).toHaveBeenCalledWith(
      'user-1',
      'notification',
      expect.objectContaining({ id: 'notif-1', type: 'invite' }),
    );
    expect(result.id).toBe('notif-1');
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('sends an Expo push when the user has a registered token', async () => {
    mockPrisma.notification.create.mockResolvedValue({
      id: 'notif-2',
      userId: 'user-1',
      type: 'reveal',
      title: 'Results are in',
      body: 'Caption here',
      postId: 'post-1',
      groupId: null,
      inviteId: null,
      read: false,
      createdAt: new Date(),
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      expoPushToken: 'ExponentPushToken[abc]',
    });

    await createNotification({
      userId: 'user-1',
      type: 'reveal',
      title: 'Results are in',
      body: 'Caption here',
      postId: 'post-1',
    });

    // Push fan-out is fire-and-forget inside an IIFE; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendExpoPush).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ExponentPushToken[abc]', title: 'Results are in' }),
    );
  });

  it('does not send a push when the user has no registered token', async () => {
    mockPrisma.notification.create.mockResolvedValue({
      id: 'notif-3',
      userId: 'user-1',
      type: 'comment',
      title: 'New comment',
      body: 'Someone commented',
      postId: 'post-1',
      groupId: null,
      inviteId: null,
      read: false,
      createdAt: new Date(),
    });
    mockPrisma.user.findUnique.mockResolvedValue({ expoPushToken: null });

    await createNotification({
      userId: 'user-1',
      type: 'comment',
      title: 'New comment',
      body: 'Someone commented',
      postId: 'post-1',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendExpoPush).not.toHaveBeenCalled();
  });
});

describe('listNotifications', () => {
  it('returns a page with nextCursor null when there is no more data', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        type: 'invite',
        title: 'New invite',
        body: 'body',
        postId: null,
        groupId: 'group-1',
        inviteId: 'invite-1',
        read: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const result = await listNotifications({ userId: 'user-1', limit: 30 });

    expect(result.notifications).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor and trims to `limit` when there is an extra row', async () => {
    const makeRow = (i: number) => ({
      id: `notif-${i}`,
      userId: 'user-1',
      type: 'invite',
      title: 't',
      body: 'b',
      postId: null,
      groupId: null,
      inviteId: null,
      read: false,
      createdAt: new Date(`2026-01-0${i}T00:00:00Z`),
    });
    mockPrisma.notification.findMany.mockResolvedValue([makeRow(3), makeRow(2), makeRow(1)]);

    const result = await listNotifications({ userId: 'user-1', limit: 2 });

    expect(result.notifications).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });
});

describe('markRead', () => {
  it('marks the row read when owned by the caller', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

    await markRead('notif-1', 'user-1');

    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', userId: 'user-1' },
      data: { read: true },
    });
  });

  it('throws NOT_FOUND when the row does not exist or is not owned by the caller', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(markRead('notif-1', 'user-1')).rejects.toMatchObject({
      status: 404,
    });
    await expect(markRead('notif-1', 'user-1')).rejects.toBeInstanceOf(AppError);
  });
});

describe('markAllRead', () => {
  it('bulk-marks all unread rows for the caller', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await markAllRead('user-1');

    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', read: false },
      data: { read: true },
    });
  });
});

describe('getUnreadCount', () => {
  it('returns the count for the caller', async () => {
    mockPrisma.notification.count.mockResolvedValue(5);

    const result = await getUnreadCount('user-1');

    expect(result).toEqual({ count: 5 });
    expect(mockPrisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', read: false },
    });
  });
});
