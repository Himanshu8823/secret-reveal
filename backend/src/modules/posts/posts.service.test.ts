import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    post: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    group: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    response: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    reaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    rating: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    postLike: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    pollOption: {
      findMany: vi.fn(),
    },
    pollVote: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      groupBy: vi.fn(),
    },
    // Reached through findOrCreateGroupByMembers when a post is created
    // from a member set rather than an existing groupId.
    groupInvite: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    discussionMeta: {
      update: vi.fn(),
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
vi.mock('../notifications/notifications.service.js', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
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
  createComment,
  createPost,
  getPost,
  listComments,
  listPosts,
  listResponses,
  revealDuePosts,
  submitResponse,
} from './posts.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  post: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  group: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  groupMember: {
    findUnique: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  user: { findMany: ReturnType<typeof vi.fn> };
  response: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  reaction: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  comment: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  rating: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  postLike: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  pollOption: {
    findMany: ReturnType<typeof vi.fn>;
  };
  pollVote: {
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  groupInvite: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  discussionMeta: {
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma as unknown as typeof prisma),
  );
  // Viewer-scoped lookups that every getPost/listPosts call makes. Tests
  // that care about these override them; the rest just need them not to
  // be undefined.
  mockPrisma.pollVote.findMany.mockResolvedValue([]);
  mockPrisma.postLike.findMany.mockResolvedValue([]);
  mockPrisma.postLike.findUnique.mockResolvedValue(null);
  mockPrisma.rating.findUnique.mockResolvedValue(null);
  // No pending invite by default — the member-set path then creates one.
  mockPrisma.groupInvite.findUnique.mockResolvedValue(null);
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

  it('blocks the author from viewing responses during the active phase (no author exemption)', async () => {
    // Per the product rule ("ek bhi comment nahi dikhega us post par,
    // jab reveal hoga tab dikhega"), the author is NOT exempt from the
    // reveal gate. Bodies must never leave the server pre-reveal — not
    // even to the author. The old code branched on `isAuthor`; verify
    // that branch is gone.
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
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

  it('lets any group member (including the author) view responses after reveal', async () => {
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

/**
 * Tests for the new memberIds-based post creation flow. The contract:
 * two posts with the same memberIds resolve to the same group row, so
 * a user can re-share with the same subset and the new post lands in
 * the existing group's discussion thread.
 *
 * We stub group.findUnique to return an existing group on the second
 * call (signature match) and create a fresh group on the first call
 * (signature miss). The membership-row writes happen inside the
 * find-or-create helper, not the post transaction.
 */
describe('createPost with memberIds (find-or-create group)', () => {
  const basePostCreate = () =>
    mockPrisma.post.create.mockResolvedValue({
      id: 'post-1',
      authorId: 'user-1',
      groupId: 'group-A',
      caption: 'hi',
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      media: [],
      discussionMeta: {
        postId: 'post-1',
        timerMinutes: 30,
        revealEndsAt: new Date('2026-01-01T00:30:00Z'),
        revealedAt: null,
        revealNotifiedAt: null,
      },
    });

  beforeEach(() => {
    // The post transaction calls group.update — stub it so the tx callback
    // completes cleanly. We assert against it in some tests below.
    mockPrisma.group.update.mockResolvedValue({});
    basePostCreate();
  });

  it('returns the same groupId when the same memberIds are submitted twice', async () => {
    // First call: no existing group with this signature → create one.
    // Second call: existing group found → reuse it.
    mockPrisma.group.findFirst
      .mockResolvedValueOnce(null) // signature miss → create path
      .mockResolvedValueOnce({
        // signature hit on the SECOND createPost invocation
        id: 'group-A',
        name: 'A, B, C, D',
        createdById: 'user-1',
        lastActivityAt: new Date(),
        createdAt: new Date(),
        _count: { members: 4 },
      });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Carol' },
      { id: 'user-4', name: 'Dan' },
    ]);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-A',
      name: 'Alice, Bob, Carol, Dan',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      _count: { members: 4 },
    });

    const first = await createPost({
      authorId: 'user-1',
      memberIds: ['user-2', 'user-3', 'user-4'],
      caption: 'first',
      mediaIds: [],
      timerMinutes: 30,
    });

    const second = await createPost({
      authorId: 'user-1',
      memberIds: ['user-4', 'user-3', 'user-2'], // different order
      caption: 'second',
      mediaIds: [],
      timerMinutes: 30,
    });

    expect(first.groupId).toBe('group-A');
    expect(second.groupId).toBe('group-A');
    // The second call resolved via the find-or-create lookup, not a new
    // group.create — proves the same memberIds hit the existing group.
    expect(mockPrisma.group.create).toHaveBeenCalledTimes(1);
  });

  it('returns different groupIds when the memberIds differ', async () => {
    // Call 1: signature miss → create group-A for {user-2, user-3, user-4}.
    // Call 2: signature miss again (different set) → create group-B for {user-2, user-3}.
    mockPrisma.group.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Carol' },
      { id: 'user-4', name: 'Dan' },
    ]);
    mockPrisma.group.create
      .mockResolvedValueOnce({
        id: 'group-A',
        name: 'A, B, C, D',
        createdById: 'user-1',
        lastActivityAt: new Date(),
        createdAt: new Date(),
        _count: { members: 4 },
      })
      .mockResolvedValueOnce({
        id: 'group-B',
        name: 'A, B, C',
        createdById: 'user-1',
        lastActivityAt: new Date(),
        createdAt: new Date(),
        _count: { members: 3 },
      });
    // Override the post mock per group so we can read groupId off the result.
    mockPrisma.post.create
      .mockResolvedValueOnce({
        id: 'post-1',
        authorId: 'user-1',
        groupId: 'group-A',
        caption: 'first',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        media: [],
        discussionMeta: {
          postId: 'post-1',
          timerMinutes: 30,
          revealEndsAt: new Date(Date.now() + 30 * 60 * 1000),
          revealedAt: null,
          revealNotifiedAt: null,
        },
      })
      .mockResolvedValueOnce({
        id: 'post-2',
        authorId: 'user-1',
        groupId: 'group-B',
        caption: 'second',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        media: [],
        discussionMeta: {
          postId: 'post-2',
          timerMinutes: 30,
          revealEndsAt: new Date(Date.now() + 30 * 60 * 1000),
          revealedAt: null,
          revealNotifiedAt: null,
        },
      });

    const first = await createPost({
      authorId: 'user-1',
      memberIds: ['user-2', 'user-3', 'user-4'],
      caption: 'first',
      mediaIds: [],
      timerMinutes: 30,
    });
    const second = await createPost({
      authorId: 'user-1',
      memberIds: ['user-2', 'user-3'], // subset, distinct signature
      caption: 'second',
      mediaIds: [],
      timerMinutes: 30,
    });

    expect(first.groupId).toBe('group-A');
    expect(second.groupId).toBe('group-B');
    expect(mockPrisma.group.create).toHaveBeenCalledTimes(2);
  });

  it('treats the same set with different order as the same group', async () => {
    // Signature hit on the very first call — group already exists.
    mockPrisma.group.findFirst.mockResolvedValueOnce({
      id: 'group-A',
      name: 'A, B, C',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      _count: { members: 3 },
    });

    const result = await createPost({
      authorId: 'user-1',
      memberIds: ['user-3', 'user-2'], // reverse order of a known {user-1, user-2, user-3}
      caption: 'test',
      mediaIds: [],
      timerMinutes: 30,
    });

    expect(result.groupId).toBe('group-A');
    expect(mockPrisma.group.create).not.toHaveBeenCalled();
  });

  it('rejects when neither groupId nor memberIds is provided', async () => {
    await expect(
      createPost({
        authorId: 'user-1',
        caption: 'hi',
        mediaIds: [],
        timerMinutes: 30,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listPosts (feed)
// ---------------------------------------------------------------------------

describe('listPosts', () => {
  const viewerMembership = (groupIds: string[]) =>
    groupIds.map((groupId) => ({ groupId }));

  it('returns an empty page when the viewer is in no groups', async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue([]);

    const result = await listPosts({ viewerId: 'user-1', limit: 20 });

    expect(result.posts).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(mockPrisma.post.findMany).not.toHaveBeenCalled();
  });

  it('throws 403 when a groupId filter is passed but the viewer is not a member', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      listPosts({ viewerId: 'user-1', groupId: 'group-X', limit: 20 }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
    } satisfies Partial<AppError>);

    expect(mockPrisma.post.findMany).not.toHaveBeenCalled();
  });

  it('returns post summaries with counts only (no bodies) for the home feed', async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue(viewerMembership(['group-1']));
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: 'post-1',
        authorId: 'user-2',
        author: { id: 'user-2', name: 'Bob' },
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Friends' },
        caption: 'hi',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
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
        _count: { responses: 3, reactions: 5, comments: 1 },
      },
    ]);
    mockPrisma.response.findMany.mockResolvedValue([{ postId: 'post-1' }]);
    mockPrisma.reaction.findMany.mockResolvedValue([
      { postId: 'post-1', type: 'like' },
    ]);

    const result = await listPosts({ viewerId: 'user-1', limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    const post = result.posts[0]!;
    expect(post.id).toBe('post-1');
    expect(post.author.name).toBe('Bob');
    expect(post.groupName).toBe('Friends');
    expect(post.reactionCount).toBe(5);
    expect(post.responseCount).toBe(3);
    expect(post.commentCount).toBe(1);
    expect(post.hasReplied).toBe(true);
    expect(post.viewerReaction).toBe('like');
    // No bodies on the feed type — only counts.
    expect('body' in post).toBe(false);
    expect('responses' in post).toBe(false);
    expect('comments' in post).toBe(false);
  });

  it('emits a nextCursor when more pages exist (limit+1 fetch trick)', async () => {
    mockPrisma.groupMember.findMany.mockResolvedValue(viewerMembership(['group-1']));
    // Limit=1, but we hand back 2 rows so the service knows there's another page.
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: 'post-A',
        authorId: 'user-2',
        author: { id: 'user-2', name: 'B' },
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Friends' },
        caption: 'a',
        status: 'active',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        media: [],
        discussionMeta: null,
        _count: { responses: 0, reactions: 0, comments: 0 },
      },
      {
        id: 'post-B',
        authorId: 'user-3',
        author: { id: 'user-3', name: 'C' },
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Friends' },
        caption: 'b',
        status: 'active',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        media: [],
        discussionMeta: null,
        _count: { responses: 0, reactions: 0, comments: 0 },
      },
    ]);
    mockPrisma.response.findMany.mockResolvedValue([]);
    mockPrisma.reaction.findMany.mockResolvedValue([]);

    const result = await listPosts({ viewerId: 'user-1', limit: 1 });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]!.id).toBe('post-A');
    expect(result.nextCursor).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('listComments', () => {
  it('throws NOT_FOUND when the post does not exist', async () => {
    mockPrisma.post.findUnique.mockResolvedValue(null);

    await expect(listComments('user-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);
  });

  it('throws 403 when the viewer is not a group member', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(listComments('user-1', 'post-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('blocks comments during the active phase for everyone (no author exemption)', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });

    await expect(listComments('user-1', 'post-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Comments are hidden until reveal',
    } satisfies Partial<AppError>);

    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('returns comments after reveal', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'revealed',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.comment.findMany.mockResolvedValue([
      {
        id: 'c-1',
        postId: 'post-1',
        authorId: 'user-2',
        body: 'thoughts',
        createdAt: new Date(),
        updatedAt: new Date(),
        author: { name: 'B' },
      },
    ]);

    const result = await listComments('user-1', 'post-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.body).toBe('thoughts');
  });
});

describe('createComment', () => {
  it('throws 403 when the viewer is not a group member', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      createComment({ viewerId: 'user-1', postId: 'post-1', body: 'hi' }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('allows comments during both active and revealed phases (visibility is gated on list, not write)', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.comment.create.mockResolvedValue({
      id: 'c-1',
      postId: 'post-1',
      authorId: 'user-1',
      body: 'my comment',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      author: { name: 'A' },
      replyTo: null,
    });

    const result = await createComment({
      viewerId: 'user-1',
      postId: 'post-1',
      body: 'my comment',
    });

    expect(mockPrisma.comment.create).toHaveBeenCalledWith({
      data: { postId: 'post-1', authorId: 'user-1', body: 'my comment', replyToId: null },
      include: {
        author: { select: { name: true } },
        replyTo: {
          select: {
            id: true,
            body: true,
            authorId: true,
            author: { select: { name: true } },
          },
        },
      },
    });
    expect(result.body).toBe('my comment');
    expect(result.replyTo).toBeNull();
  });

  it('rejects a reply whose quoted comment belongs to a different post', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'active',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    // The quoted id exists somewhere, but not on this post — the lookup is
    // scoped by postId, so it comes back empty.
    mockPrisma.comment.findFirst.mockResolvedValue(null);

    await expect(
      createComment({
        viewerId: 'user-1',
        postId: 'post-1',
        body: 'sneaky reply',
        replyToId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('attaches the quoted comment when replying within the same post', async () => {
    mockPrisma.post.findUnique.mockResolvedValue({
      id: 'post-1',
      groupId: 'group-1',
      status: 'revealed',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1' });
    mockPrisma.comment.findFirst.mockResolvedValue({ id: 'c-parent' });
    mockPrisma.comment.create.mockResolvedValue({
      id: 'c-2',
      postId: 'post-1',
      authorId: 'user-1',
      body: 'my reply',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      author: { name: 'A' },
      replyTo: { id: 'c-parent', body: 'original', authorId: 'user-2', author: { name: 'B' } },
    });

    const result = await createComment({
      viewerId: 'user-1',
      postId: 'post-1',
      body: 'my reply',
      replyToId: 'c-parent',
    });

    expect(result.replyTo).toEqual({
      id: 'c-parent',
      authorId: 'user-2',
      authorName: 'B',
      body: 'original',
    });
  });
});

// ---------------------------------------------------------------------------
// revealDuePosts (worker sweep)
// ---------------------------------------------------------------------------

describe('revealDuePosts', () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) =>
        cb(prisma as unknown as typeof prisma),
    );
  });

  it('flips every candidate post to revealed and sets revealedAt', async () => {
    mockPrisma.post.findMany.mockResolvedValue([
      { id: 'post-1', groupId: 'group-1', caption: 'Caption 1' },
      { id: 'post-2', groupId: 'group-1', caption: 'Caption 2' },
    ]);
    mockPrisma.post.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.groupMember.findMany.mockResolvedValue([
      { groupId: 'group-1', userId: 'user-1' },
    ]);

    const now = new Date('2026-01-01T01:00:00Z');
    const revealed = await revealDuePosts(now);

    expect(revealed).toEqual(['post-1', 'post-2']);
    expect(mockPrisma.post.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.discussionMeta.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.discussionMeta.update).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
      data: { revealedAt: now },
    });
  });

  it('skips posts that were already revealed by a concurrent sweep (idempotent)', async () => {
    mockPrisma.post.findMany.mockResolvedValue([
      { id: 'post-1', groupId: 'group-1', caption: 'Caption 1' },
    ]);
    // updateMany returns count:0 — the row was flipped by a concurrent
    // sweeper. We must NOT update revealedAt in that case.
    mockPrisma.post.updateMany.mockResolvedValue({ count: 0 });

    const revealed = await revealDuePosts();

    expect(revealed).toEqual([]);
    expect(mockPrisma.discussionMeta.update).not.toHaveBeenCalled();
  });

  it('returns an empty array when there are no candidates', async () => {
    mockPrisma.post.findMany.mockResolvedValue([]);

    const revealed = await revealDuePosts();

    expect(revealed).toEqual([]);
    expect(mockPrisma.post.updateMany).not.toHaveBeenCalled();
  });
});
