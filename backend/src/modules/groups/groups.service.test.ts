import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    group: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
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

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import {
  buildMemberSignature,
  findOrCreateGroupByMembers,
  getGroup,
  leaveGroup,
  listMyGroups,
} from './groups.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  group: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  groupMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: $transaction just runs the callback with the global prisma mock.
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma as unknown as typeof prisma),
  );
});

describe('listMyGroups', () => {
  it('returns groups the user is a member of, ordered by lastActivityAt DESC', async () => {
    const t1 = new Date('2026-01-03T00:00:00Z');
    const t2 = new Date('2026-01-02T00:00:00Z');
    const t3 = new Date('2026-01-01T00:00:00Z');
    mockPrisma.group.findMany.mockResolvedValue([
      {
        id: 'g-1',
        name: 'Newest',
        lastActivityAt: t1,
        createdAt: t1,
        _count: { members: 3 },
      },
      {
        id: 'g-2',
        name: 'Middle',
        lastActivityAt: t2,
        createdAt: t2,
        _count: { members: 2 },
      },
      {
        id: 'g-3',
        name: 'Oldest',
        lastActivityAt: t3,
        createdAt: t3,
        _count: { members: 5 },
      },
    ]);

    const result = await listMyGroups({ userId: 'user-1', limit: 10 });

    expect(mockPrisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 'user-1' } } },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
        take: 11, // limit + 1
        include: { _count: { select: { members: true } } },
      }),
    );

    expect(result.groups.map((g) => g.id)).toEqual(['g-1', 'g-2', 'g-3']);
    expect(result.nextCursor).toBeNull();
    expect(result.groups[0]!.memberCount).toBe(3);
    expect(result.groups[0]!.latestPost).toBeNull();
  });

  it('returns a nextCursor when there are more rows than the limit', async () => {
    const t = new Date('2026-01-01T00:00:00Z');
    // limit=2, returns 3 rows => 2 in the page, nextCursor set.
    mockPrisma.group.findMany.mockResolvedValue([
      {
        id: 'g-1',
        name: 'A',
        lastActivityAt: t,
        createdAt: t,
        _count: { members: 1 },
      },
      {
        id: 'g-2',
        name: 'B',
        lastActivityAt: t,
        createdAt: t,
        _count: { members: 1 },
      },
      {
        id: 'g-3',
        name: 'C',
        lastActivityAt: t,
        createdAt: t,
        _count: { members: 1 },
      },
    ]);

    const result = await listMyGroups({ userId: 'u-1', limit: 2 });

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.id)).toEqual(['g-1', 'g-2']);
    expect(result.nextCursor).not.toBeNull();

    // The cursor is base64-encoded JSON of { t, i } for the LAST row of the
    // page (g-2), not the dropped row (g-3).
    const decoded = JSON.parse(
      Buffer.from(result.nextCursor!, 'base64').toString('utf8'),
    ) as { t: string; i: string };
    expect(decoded.i).toBe('g-2');
    expect(decoded.t).toBe(t.toISOString());
  });

  it('decodes a cursor into the (lastActivityAt, id) composite filter', async () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const cursor = Buffer.from(
      JSON.stringify({ t: t.toISOString(), i: 'g-cursor' }),
    ).toString('base64');

    mockPrisma.group.findMany.mockResolvedValue([]);

    await listMyGroups({ userId: 'u-1', cursor, limit: 5 });

    const call = mockPrisma.group.findMany.mock.calls[0]![0] as {
      where: {
        OR?: Array<Record<string, unknown>>;
      };
    };
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(2);
  });

  it('ignores a malformed cursor and starts from the top', async () => {
    mockPrisma.group.findMany.mockResolvedValue([]);

    await listMyGroups({
      userId: 'u-1',
      cursor: 'not-base64-or-json-at-all',
      limit: 5,
    });

    const call = mockPrisma.group.findMany.mock.calls[0]![0] as {
      where: { OR?: unknown };
    };
    expect(call.where.OR).toBeUndefined();
  });
});

describe('getGroup', () => {
  it('returns the group with members when the caller is a member', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      name: 'A, B',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [
        {
          userId: 'user-1',
          joinedAt: new Date(),
          user: { id: 'user-1', name: 'A', phone: '+911111111111' },
        },
        {
          userId: 'user-2',
          joinedAt: new Date(),
          user: { id: 'user-2', name: 'B', phone: '+912222222222' },
        },
      ],
    });

    const result = await getGroup('user-1', 'group-1');

    expect(result.id).toBe('group-1');
    expect(result.members).toHaveLength(2);
    expect(result.members[0]!.userId).toBe('user-1');
    expect(result.members[1]!.userId).toBe('user-2');
  });

  it('throws NOT_FOUND when the group does not exist', async () => {
    mockPrisma.group.findUnique.mockResolvedValue(null);

    await expect(getGroup('user-1', 'missing')).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Group not found',
    } satisfies Partial<AppError>);
  });

  it('throws FORBIDDEN when the caller is not a member', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      name: 'A, B',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [
        {
          userId: 'user-2',
          joinedAt: new Date(),
          user: { id: 'user-2', name: 'B', phone: '+912222222222' },
        },
      ],
    });

    await expect(getGroup('user-1', 'group-1')).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'Not a member of this group',
    } satisfies Partial<AppError>);
  });
});

// ---------------------------------------------------------------------------
// Leave group
// ---------------------------------------------------------------------------

describe('leaveGroup', () => {
  it('deletes the membership row for any member (no creator exemption)', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.groupMember.delete.mockResolvedValue({});

    await leaveGroup({ userId: 'user-1', groupId: 'group-1' });

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-1' } },
    });
  });

  it('rejects when the group does not exist', async () => {
    mockPrisma.group.findUnique.mockResolvedValue(null);

    await expect(
      leaveGroup({ userId: 'user-1', groupId: 'missing' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
    } satisfies Partial<AppError>);
  });

  it('rejects when the caller is not a member', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      leaveGroup({ userId: 'user-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
    } satisfies Partial<AppError>);

    expect(mockPrisma.groupMember.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Find-or-create by member set
// ---------------------------------------------------------------------------

describe('buildMemberSignature', () => {
  it('folds the creator into the set before sorting', () => {
    expect(buildMemberSignature('user-1', ['user-3', 'user-2'])).toBe(
      'user-1,user-2,user-3',
    );
  });

  it('is order-independent across the invitee list', () => {
    expect(buildMemberSignature('user-1', ['user-2', 'user-3'])).toBe(
      buildMemberSignature('user-1', ['user-3', 'user-2']),
    );
  });

  it('dedupes when the creator is also in memberIds', () => {
    expect(buildMemberSignature('user-1', ['user-1', 'user-2'])).toBe(
      'user-1,user-2',
    );
  });
});

describe('findOrCreateGroupByMembers', () => {
  it('returns the existing group on the fast path (created=false)', async () => {
    mockPrisma.group.findFirst.mockResolvedValue({
      id: 'group-1',
      name: 'A, B, C',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      _count: { members: 3 },
    });

    const result = await findOrCreateGroupByMembers({
      creatorId: 'user-1',
      memberIds: ['user-2', 'user-3'],
    });

    expect(result.created).toBe(false);
    expect(result.group.id).toBe('group-1');
    expect(mockPrisma.group.create).not.toHaveBeenCalled();
  });

  it('derives a name from member names and creates with no role/creator', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
    ]);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-1',
      name: 'Alice, Bob',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      _count: { members: 2 },
    });

    const result = await findOrCreateGroupByMembers({
      creatorId: 'user-1',
      memberIds: ['user-2'],
    });

    expect(result.created).toBe(true);
    expect(result.group.name).toBe('Alice, Bob');

    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: {
        name: string;
        memberSignature: string;
        members: { create: { userId: string }[] };
      };
    };
    expect(createCall.data.name).toBe('Alice, Bob');
    expect(createCall.data.memberSignature).toBe('user-1,user-2');
    expect(createCall.data.members.create).toHaveLength(2);
    expect(createCall.data.members.create[0]).toEqual({ userId: 'user-1' });
    expect(createCall.data.members.create[1]).toEqual({ userId: 'user-2' });
  });

  it('falls back to "Untitled" when no member has a name', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: null },
      { id: 'user-2', name: null },
    ]);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-1',
      name: 'Untitled',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      _count: { members: 2 },
    });

    await findOrCreateGroupByMembers({
      creatorId: 'user-1',
      memberIds: ['user-2'],
    });

    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: { name: string };
    };
    expect(createCall.data.name).toBe('Untitled');
  });

  it('rejects when an invitee id does not resolve to a user', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany
      .mockResolvedValueOnce([{ id: 'user-1', name: 'A' }]) // name lookup
      .mockResolvedValueOnce([{ id: 'user-2' }]); // invitee existence check

    await expect(
      findOrCreateGroupByMembers({
        creatorId: 'user-1',
        memberIds: ['user-2', 'user-missing'],
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
    } satisfies Partial<AppError>);

    expect(mockPrisma.group.create).not.toHaveBeenCalled();
  });

  it('handles a P2002 race by re-reading the now-existing row', async () => {
    mockPrisma.group.findFirst
      .mockResolvedValueOnce(null) // fast-path miss
      .mockResolvedValueOnce({
        // post-race re-read succeeds
        id: 'group-raced',
        name: 'A, B',
        lastActivityAt: new Date(),
        createdAt: new Date(),
        _count: { members: 2 },
      });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-1', name: 'A' },
      { id: 'user-2', name: 'B' },
    ]);
    // Simulate the unique-constraint violation on the partial index. Must
    // be a real Prisma.PrismaClientKnownRequestError so the service's
    // `instanceof` check matches.
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    mockPrisma.group.create.mockRejectedValue(p2002);

    const result = await findOrCreateGroupByMembers({
      creatorId: 'user-1',
      memberIds: ['user-2'],
    });

    expect(result.created).toBe(false);
    expect(result.group.id).toBe('group-raced');
  });
});
