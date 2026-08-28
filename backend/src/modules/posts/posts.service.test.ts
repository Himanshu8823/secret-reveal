import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    post: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    group: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
    },
    response: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    reaction: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
    OTP_TTL_SECONDS: 300,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    OTP_PROVIDER: 'mock',
  },
}));

import { prisma } from '../../config/db.js';
import {
  createPost,
  getPost,
  listResponses,
  submitResponse,
} from './posts.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  post: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  group: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  groupMember: { findUnique: ReturnType<typeof vi.fn> };
  response: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  reaction: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma as unknown as typeof prisma),
  );
});

describe('createPost', () => {
  it('rejects when the author is not a member of the group', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      createPost({
        authorId: 'user-1',
        groupId: 'group-1',
        caption: 'hi',
        mediaIds: [],
        timerMinutes: 30,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'You are not a member of this group',
    } satisfies Partial<AppError>);

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('rejects when the group does not exist (404 vs FK error)', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.group.findUnique.mockResolvedValue(null);

    await expect(
      createPost({
        authorId: 'user-1',
        groupId: 'group-1',
        caption: 'hi',
        mediaIds: [],
        timerMinutes: 30,
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);
  });

  it('creates the post + media rows + discussion meta + bumps group activity in one tx', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.group.update.mockResolvedValue({});
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const revealEndsAt = new Date('2026-01-01T00:30:00Z');
    mockPrisma.post.create.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
      groupId: 'group-1',
      caption: 'hi',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
      media: [
        {
          order: 0,
          media: { id: 'm-1', url: 'https://x/1', mimeType: 'image/png' },
        },
        {
          order: 1,
          media: { id: 'm-2', url: 'https://x/2', mimeType: 'image/png' },
        },
      ],
      discussionMeta: {
        postId: 'post-1',
        timerMinutes: 30,
        revealEndsAt,
        revealedAt: null,
        revealNotifiedAt: null,
      },
    });

    const result = await createPost({
      authorId: 'user-1',
      groupId: 'group-1',
      caption: 'hi',
      mediaIds: ['m-1', 'm-2'],
      timerMinutes: 30,
    });

    // post.create was called with the right shape
    const createCall = mockPrisma.post.create.mock.calls[0]![0] as {
      data: {
        authorId: string;
        groupId: string;
        caption: string;
        status: string;
        media: { create: { mediaId: string; order: number }[] };
        discussionMeta: {
          create: { timerMinutes: number; revealEndsAt: Date };
        };
      };
    };
    expect(createCall.data.authorId).toBe('user-1');
    expect(createCall.data.groupId).toBe('group-1');
    expect(createCall.data.caption).toBe('hi');
    expect(createCall.data.status).toBe('active');
    expect(createCall.data.media.create).toHaveLength(2);
    expect(createCall.data.media.create[0]).toEqual({ mediaId: 'm-1', order: 0 });
    expect(createCall.data.media.create[1]).toEqual({ mediaId: 'm-2', order: 1 });
    expect(createCall.data.discussionMeta.create.timerMinutes).toBe(30);

    // group.update was called inside the same tx to bump activity
    expect(mockPrisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { lastActivityAt: expect.any(Date) as Date },
    });

    // Result shape
    expect(result.id).toBe('post-1');
    expect(result.status).toBe('active');
    expect(result.media).toHaveLength(2);
    expect(result.discussionMeta.timerMinutes).toBe(30);
    expect(result.discussionMeta.revealEndsAt).toEqual(revealEndsAt);
  });
});

describe('getPost', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);

    await expect(getPost('user-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Post not found',
    } satisfies Partial<AppError>);
  });

  it('throws 403 when the viewer is not a member of the post group', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-2',
      groupId: 'group-1',
      caption: 'hi',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: 'user-2', name: 'B' },
      group: { id: 'group-1', name: 'Friends' },
      media: [],
      discussionMeta: null,
      _count: { responses: 0, reactions: 0, comments: 0 },
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(getPost('user-1', 'post-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'You are not a member of this group',
    } satisfies Partial<AppError>);

    expect(mockPrisma.reaction.findUnique).not.toHaveBeenCalled();
  });

  it('returns the post detail with viewer-scoped fields when the viewer is a member', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
      groupId: 'group-1',
      caption: 'hi',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
      author: { id: 'user-1', name: 'A' },
      group: { id: 'group-1', name: 'Friends' },
      media: [
        {
          order: 0,
          media: { id: 'm-1', url: 'https://x/1', mimeType: 'image/png' },
        },
      ],
      discussionMeta: {
        postId: 'post-1',
        timerMinutes: 30,
        revealEndsAt: new Date('2026-01-01T00:30:00Z'),
        revealedAt: null,
        revealNotifiedAt: null,
      },
      _count: { responses: 2, reactions: 4, comments: 1 },
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.reaction.findUnique.mockResolvedValue({ type: 'like' });

    const result = await getPost('user-1', 'post-1');

    expect(result.id).toBe('post-1');
    expect(result.authorName).toBe('A');
    expect(result.groupName).toBe('Friends');
    expect(result.responseCount).toBe(2);
    expect(result.reactionCount).toBe(4);
    expect(result.viewerReaction).toBe('like');
    expect(result.media).toHaveLength(1);
    expect(result.discussionMeta?.timerMinutes).toBe(30);
  });

  it('returns viewerReaction=null when the viewer has not reacted', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
      groupId: 'group-1',
      caption: 'hi',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { id: 'user-1', name: 'A' },
      group: { id: 'group-1', name: 'Friends' },
      media: [],
      discussionMeta: null,
      _count: { responses: 0, reactions: 0, comments: 0 },
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.reaction.findUnique.mockResolvedValue(null);

    const result = await getPost('user-1', 'post-1');

    expect(result.viewerReaction).toBeNull();
    expect(result.discussionMeta).toBeNull();
  });
});

describe('listResponses', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);

    await expect(listResponses('user-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);
  });

  it('throws 403 when the viewer is not a group member', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-2',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(listResponses('user-1', 'post-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.response.findMany).not.toHaveBeenCalled();
  });

  it('throws "responses are hidden until reveal" for non-authors during active phase', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-2',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });

    await expect(listResponses('user-1', 'post-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Responses are hidden until reveal',
    } satisfies Partial<AppError>);

    expect(mockPrisma.response.findMany).not.toHaveBeenCalled();
  });

  it('lets the author view responses during the active phase', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.response.findMany.mockResolvedValue([
      {
        id: 'r-1',
        postId: 'post-1',
        authorId: 'user-1',
        body: 'mine',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { name: 'A' },
      },
    ]);

    const result = await listResponses('user-1', 'post-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.body).toBe('mine');
    expect(result[0]!.authorName).toBe('A');
  });

  it('lets any group member view responses after reveal', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-2',
      groupId: 'group-1',
      status: 'revealed',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.response.findMany.mockResolvedValue([
      {
        id: 'r-1',
        postId: 'post-1',
        authorId: 'user-2',
        body: 'revealed body',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { name: 'B' },
      },
    ]);

    const result = await listResponses('user-1', 'post-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.authorName).toBe('B');
  });
});

describe('submitResponse', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);

    await expect(
      submitResponse({ viewerId: 'user-1', postId: 'missing', body: 'hi' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);
  });

  it('throws 403 when the viewer is not a group member', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ id: 'post-1', groupId: 'group-1' });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      submitResponse({ viewerId: 'user-1', postId: 'post-1', body: 'hi' }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.response.create).not.toHaveBeenCalled();
  });

  it('creates the response for a group member', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ id: 'post-1', groupId: 'group-1' });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.response.create.mockResolvedValue({
      id: 'r-1',
      postId: 'post-1',
      authorId: 'user-1',
      body: 'my response',
      createdAt,
      updatedAt: createdAt,
      author: { name: 'A' },
    });

    const result = await submitResponse({
      viewerId: 'user-1',
      postId: 'post-1',
      body: 'my response',
    });

    expect(mockPrisma.response.create).toHaveBeenCalledWith({
      data: { postId: 'post-1', authorId: 'user-1', body: 'my response' },
      include: { author: { select: { name: true } } },
    });
    expect(result.body).toBe('my response');
    expect(result.authorName).toBe('A');
  });

  it('allows responses during both active and revealed phases (visibility is enforced at list time)', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({ id: 'post-1', groupId: 'group-1' });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.response.create.mockResolvedValue({
      id: 'r-1',
      postId: 'post-1',
      authorId: 'user-1',
      body: 'hi',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { name: 'A' },
    });

    // submitResponse does NOT inspect post.status — only membership. So
    // we just confirm it succeeds without ever calling post.findUnique for
    // the status. The membership lookup uses (groupId, userId) only.
    await submitResponse({
      viewerId: 'user-1',
      postId: 'post-1',
      body: 'hi',
    });

    // post.findUnique is called once (for the post existence + groupId),
    // but it returns a partial select without status.
    expect(mockPrisma.post.findUnique).toHaveBeenCalledTimes(1);
  });
});
