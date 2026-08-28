import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    group: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
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
import { createGroup, listMyGroups, getGroup } from './groups.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  group: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  user: { findMany: ReturnType<typeof vi.fn> };
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

describe('createGroup', () => {
  it('creates the group + members in a transaction, with creator as owner', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2' },
      { id: 'user-3' },
    ]);
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const updatedAt = new Date('2026-01-01T00:00:00Z');
    const joinedAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-1',
      name: 'Friends',
      createdById: 'user-1',
      lastActivityAt: createdAt,
      createdAt,
      updatedAt,
      members: [
        {
          userId: 'user-1',
          role: 'owner',
          joinedAt,
          user: { id: 'user-1', name: 'A', phone: '+911111111111' },
        },
        {
          userId: 'user-2',
          role: 'member',
          joinedAt,
          user: { id: 'user-2', name: 'B', phone: '+912222222222' },
        },
      ],
    });

    const result = await createGroup({
      creatorId: 'user-1',
      name: 'Friends',
      memberIds: ['user-2', 'user-3'],
    });

    expect(mockPrisma.group.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: {
        name: string;
        createdById: string;
        members: { create: { userId: string; role: string }[] };
      };
    };
    expect(createCall.data.name).toBe('Friends');
    expect(createCall.data.createdById).toBe('user-1');
    // Three members: creator (owner) + 2 invited (member).
    expect(createCall.data.members.create).toHaveLength(3);
    expect(createCall.data.members.create.find((m) => m.userId === 'user-1')?.role).toBe(
      'owner',
    );
    expect(createCall.data.members.create.find((m) => m.userId === 'user-2')?.role).toBe(
      'member',
    );

    expect(result).toMatchObject({
      id: 'group-1',
      name: 'Friends',
      createdById: 'user-1',
    });
    expect(result.members).toHaveLength(2);
  });

  it('trims whitespace before checking for duplicates and creating the row', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-2',
      name: 'Trimmed',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
    });

    await createGroup({ creatorId: 'user-1', name: '   Trimmed   ', memberIds: [] });

    // findFirst must use the trimmed name, not the raw input.
    expect(mockPrisma.group.findFirst).toHaveBeenCalledWith({
      where: { createdById: 'user-1', name: 'Trimmed' },
      select: { id: true },
    });

    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: { name: string };
    };
    expect(createCall.data.name).toBe('Trimmed');
  });

  it('rejects when the trimmed name is empty', async () => {
    await expect(
      createGroup({ creatorId: 'user-1', name: '     ', memberIds: [] }),
    ).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Name is required',
    } satisfies Partial<AppError>);

    expect(mockPrisma.group.create).not.toHaveBeenCalled();
  });

  it('rejects when the creator already has a group with the same name', async () => {
    mockPrisma.group.findFirst.mockResolvedValue({ id: 'existing-group' });

    await expect(
      createGroup({ creatorId: 'user-1', name: 'Friends', memberIds: [] }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.group.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects when an invited member id does not exist', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-2' }]); // user-3 missing

    await expect(
      createGroup({
        creatorId: 'user-1',
        name: 'Friends',
        memberIds: ['user-2', 'user-3'],
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'User not found: user-3',
    } satisfies Partial<AppError>);

    expect(mockPrisma.group.create).not.toHaveBeenCalled();
  });

  it('does not duplicate the creator when the client also lists them in memberIds', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-3',
      name: 'Solo',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
    });

    await createGroup({
      creatorId: 'user-1',
      name: 'Solo',
      memberIds: ['user-1'],
    });

    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: { members: { create: { userId: string }[] } };
    };
    // Exactly one member row, even though the client listed the creator twice.
    expect(createCall.data.members.create).toHaveLength(1);
    expect(createCall.data.members.create[0]!.userId).toBe('user-1');
  });
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
        createdById: 'user-1',
        lastActivityAt: t1,
        createdAt: t1,
        _count: { members: 3 },
      },
      {
        id: 'g-2',
        name: 'Middle',
        createdById: 'user-2',
        lastActivityAt: t2,
        createdAt: t2,
        _count: { members: 2 },
      },
      {
        id: 'g-3',
        name: 'Oldest',
        createdById: 'user-3',
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
        createdById: 'u-1',
        lastActivityAt: t,
        createdAt: t,
        _count: { members: 1 },
      },
      {
        id: 'g-2',
        name: 'B',
        createdById: 'u-2',
        lastActivityAt: t,
        createdAt: t,
        _count: { members: 1 },
      },
      {
        id: 'g-3',
        name: 'C',
        createdById: 'u-3',
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
      name: 'Friends',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [
        {
          userId: 'user-1',
          role: 'owner',
          joinedAt: new Date(),
          user: { id: 'user-1', name: 'A', phone: '+911111111111' },
        },
        {
          userId: 'user-2',
          role: 'member',
          joinedAt: new Date(),
          user: { id: 'user-2', name: 'B', phone: '+912222222222' },
        },
      ],
    });

    const result = await getGroup('user-1', 'group-1');

    expect(result.id).toBe('group-1');
    expect(result.members).toHaveLength(2);
    expect(result.members[0]!.role).toBe('owner');
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
      name: 'Friends',
      createdById: 'user-2',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [
        {
          userId: 'user-2',
          role: 'owner',
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
