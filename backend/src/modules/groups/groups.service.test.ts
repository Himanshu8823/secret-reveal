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
      create: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    groupInvite: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
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
  acceptInvite,
  createGroup,
  getGroup,
  leaveGroup,
  listMyGroups,
  listPendingInvites,
  rejectInvite,
  sendInvites,
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
    create: ReturnType<typeof vi.fn>;
  };
  groupMember: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  groupInvite: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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

describe('createGroup', () => {
  it('creates the group with the creator as the sole member; sends invites to phones', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null); // no duplicate
    mockPrisma.group.create.mockResolvedValue({
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
      ],
    });

    // sendInvites() side path
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2', phone: '+912222222222' },
    ]);
    mockPrisma.groupMember.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.create.mockResolvedValue({});
    mockPrisma.group.update.mockResolvedValue({});

    const result = await createGroup({
      creatorId: 'user-1',
      name: 'Friends',
      phoneNumbers: ['+912222222222'],
    });

    // Only the creator is added as a member at creation time.
    const createCall = mockPrisma.group.create.mock.calls[0]![0] as {
      data: {
        name: string;
        createdById: string;
        members: { create: { userId: string; role: string }[] };
      };
    };
    expect(createCall.data.name).toBe('Friends');
    expect(createCall.data.createdById).toBe('user-1');
    expect(createCall.data.members.create).toHaveLength(1);
    expect(createCall.data.members.create[0]).toEqual({
      userId: 'user-1',
      role: 'owner',
    });

    // An invite row was created for the invitee's phone.
    expect(mockPrisma.groupInvite.create).toHaveBeenCalledTimes(1);
    const inviteCall = mockPrisma.groupInvite.create.mock.calls[0]![0] as {
      data: { groupId: string; inviterId: string; inviteeId: string };
    };
    expect(inviteCall.data.groupId).toBe('group-1');
    expect(inviteCall.data.inviterId).toBe('user-1');
    expect(inviteCall.data.inviteeId).toBe('user-2');

    expect(result.id).toBe('group-1');
    expect(result.name).toBe('Friends');
    expect(result.createdById).toBe('user-1');
    expect(result.members).toHaveLength(1);
  });

  it('trims whitespace before checking for duplicates and creating the row', async () => {
    mockPrisma.group.findFirst.mockResolvedValue(null);
    mockPrisma.group.create.mockResolvedValue({
      id: 'group-2',
      name: 'Trimmed',
      createdById: 'user-1',
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
    });
    // No invites sent, so sendInvites isn't entered.
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });

    await createGroup({
      creatorId: 'user-1',
      name: '   Trimmed   ',
      phoneNumbers: [],
    });

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
      createGroup({
        creatorId: 'user-1',
        name: '     ',
        phoneNumbers: [],
      }),
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
      createGroup({
        creatorId: 'user-1',
        name: 'Friends',
        phoneNumbers: [],
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.group.create).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

describe('sendInvites', () => {
  it('rejects when the inviter is not a member of the group', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      sendInvites({
        inviterId: 'user-1',
        groupId: 'group-1',
        phoneNumbers: ['+912222222222'],
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
    } satisfies Partial<AppError>);

    expect(mockPrisma.groupInvite.create).not.toHaveBeenCalled();
  });

  it('rejects when the group does not exist (clean 404 vs implicit)', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue(null);

    await expect(
      sendInvites({
        inviterId: 'user-1',
        groupId: 'missing',
        phoneNumbers: ['+912222222222'],
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'Group not found',
    } satisfies Partial<AppError>);
  });

  it('skips the inviter\'s own phone (no self-invite)', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    // ensureUsersByPhone: only one phone left, the other is the inviter's.
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2', phone: '+912222222222' },
    ]);
    mockPrisma.groupMember.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.create.mockResolvedValue({});
    mockPrisma.group.update.mockResolvedValue({});

    const result = await sendInvites({
      inviterId: 'user-1',
      groupId: 'group-1',
      phoneNumbers: ['+911111111111', '+912222222222'], // includes self
    });

    expect(result.created).toBe(1);
    expect(mockPrisma.groupInvite.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.groupInvite.create.mock.calls[0]![0]).toMatchObject({
      data: { inviteeId: 'user-2' },
    });
  });

  it('creates placeholder users for unknown phones (so future signups can claim)', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    // No existing user for the second phone — service should create one.
    mockPrisma.user.findMany.mockResolvedValue([]); // no existing rows
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-user-uuid',
      phone: '+913333333333',
    });
    mockPrisma.groupMember.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.create.mockResolvedValue({});
    mockPrisma.group.update.mockResolvedValue({});

    const result = await sendInvites({
      inviterId: 'user-1',
      groupId: 'group-1',
      phoneNumbers: ['+913333333333'],
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { phone: '+913333333333' },
      select: { id: true, phone: true },
    });
    expect(result.created).toBe(1);
    expect(mockPrisma.groupInvite.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        inviterId: 'user-1',
        inviteeId: 'new-user-uuid',
        status: 'pending',
      },
    });
  });

  it('skips phones whose owner is already a member of the group', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2', phone: '+912222222222' },
    ]);
    // user-2 is already a member of this group.
    mockPrisma.groupMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([]);
    mockPrisma.group.update.mockResolvedValue({});

    const result = await sendInvites({
      inviterId: 'user-1',
      groupId: 'group-1',
      phoneNumbers: ['+912222222222'],
    });

    expect(result.created).toBe(0);
    expect(mockPrisma.groupInvite.create).not.toHaveBeenCalled();
    // No invites created -> no activity bump.
    expect(mockPrisma.group.update).not.toHaveBeenCalled();
  });

  it('skips phones whose owner already has any invite to this group', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2', phone: '+912222222222' },
    ]);
    mockPrisma.groupMember.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([
      { inviteeId: 'user-2', status: 'rejected' }, // any prior status blocks re-send
    ]);
    mockPrisma.group.update.mockResolvedValue({});

    const result = await sendInvites({
      inviterId: 'user-1',
      groupId: 'group-1',
      phoneNumbers: ['+912222222222'],
    });

    expect(result.created).toBe(0);
    expect(mockPrisma.groupInvite.create).not.toHaveBeenCalled();
    expect(mockPrisma.group.update).not.toHaveBeenCalled();
  });

  it('bumps lastActivityAt only when at least one invite lands', async () => {
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.group.findUnique.mockResolvedValue({ id: 'group-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ phone: '+911111111111' });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-2', phone: '+912222222222' },
    ]);
    mockPrisma.groupMember.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.findMany.mockResolvedValue([]);
    mockPrisma.groupInvite.create.mockResolvedValue({});
    mockPrisma.group.update.mockResolvedValue({});

    await sendInvites({
      inviterId: 'user-1',
      groupId: 'group-1',
      phoneNumbers: ['+912222222222'],
    });

    expect(mockPrisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { lastActivityAt: expect.any(Date) as Date },
    });
  });
});

describe('listPendingInvites', () => {
  it('returns only pending invites addressed to the caller', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.groupInvite.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        groupId: 'group-1',
        inviterId: 'user-2',
        inviteeId: 'user-1',
        status: 'pending',
        createdAt,
        group: { id: 'group-1', name: 'Friends' },
        inviter: { id: 'user-2', name: 'B' },
      },
    ]);

    const result = await listPendingInvites('user-1');

    expect(mockPrisma.groupInvite.findMany).toHaveBeenCalledWith({
      where: { inviteeId: 'user-1', status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        group: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true } },
      },
    });

    expect(result.invites).toHaveLength(1);
    expect(result.invites[0]!.id).toBe('inv-1');
    expect(result.invites[0]!.groupName).toBe('Friends');
    expect(result.invites[0]!.inviterName).toBe('B');
  });
});

describe('acceptInvite', () => {
  it('flips status, creates GroupMember, bumps activity — all in one tx', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.groupInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-1',
      status: 'pending',
      createdAt,
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });
    mockPrisma.groupInvite.update.mockResolvedValue({});
    mockPrisma.groupMember.create.mockResolvedValue({});
    mockPrisma.group.update.mockResolvedValue({});

    const result = await acceptInvite({ inviteId: 'inv-1', userId: 'user-1' });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.groupInvite.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'accepted', respondedAt: expect.any(Date) as Date },
    });
    expect(mockPrisma.groupMember.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', userId: 'user-1', role: 'member' },
    });
    expect(mockPrisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { lastActivityAt: expect.any(Date) as Date },
    });
    expect(result.status).toBe('accepted');
    expect(result.groupName).toBe('Friends');
  });

  it('throws NOT_FOUND when the invite does not exist', async () => {
    mockPrisma.groupInvite.findUnique.mockResolvedValue(null);

    await expect(
      acceptInvite({ inviteId: 'missing', userId: 'user-1' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
    } satisfies Partial<AppError>);
  });

  it('throws FORBIDDEN when the caller is not the invitee', async () => {
    mockPrisma.groupInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-3', // not user-1
      status: 'pending',
      createdAt: new Date(),
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });

    await expect(
      acceptInvite({ inviteId: 'inv-1', userId: 'user-1' }),
    ).rejects.toMatchObject({
      status: 403,
      code: ErrorCode.FORBIDDEN,
    } satisfies Partial<AppError>);

    expect(mockPrisma.groupInvite.update).not.toHaveBeenCalled();
  });

  it('rejects a double-accept (status no longer pending)', async () => {
    mockPrisma.groupInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-1',
      status: 'accepted',
      createdAt: new Date(),
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });

    await expect(
      acceptInvite({ inviteId: 'inv-1', userId: 'user-1' }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Invite is already accepted',
    } satisfies Partial<AppError>);
  });
});

describe('rejectInvite', () => {
  it('flips the invite to rejected; does not create a membership', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.groupInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-1',
      status: 'pending',
      createdAt,
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });
    mockPrisma.groupInvite.update.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-1',
      status: 'rejected',
      createdAt,
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });

    await rejectInvite({ inviteId: 'inv-1', userId: 'user-1' });

    expect(mockPrisma.groupInvite.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'rejected', respondedAt: expect.any(Date) as Date },
      include: {
        group: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true } },
      },
    });
    expect(mockPrisma.groupMember.create).not.toHaveBeenCalled();
    expect(mockPrisma.group.update).not.toHaveBeenCalled();
  });

  it('rejects a double-reject', async () => {
    mockPrisma.groupInvite.findUnique.mockResolvedValue({
      id: 'inv-1',
      groupId: 'group-1',
      inviterId: 'user-2',
      inviteeId: 'user-1',
      status: 'rejected',
      createdAt: new Date(),
      group: { id: 'group-1', name: 'Friends' },
      inviter: { id: 'user-2', name: 'B' },
    });

    await expect(
      rejectInvite({ inviteId: 'inv-1', userId: 'user-1' }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Invite is already rejected',
    } satisfies Partial<AppError>);
  });
});

// ---------------------------------------------------------------------------
// Leave group
// ---------------------------------------------------------------------------

describe('leaveGroup', () => {
  it('deletes the membership row for a non-creator member', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      createdById: 'user-2',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });
    mockPrisma.groupMember.delete.mockResolvedValue({});

    await leaveGroup({ userId: 'user-1', groupId: 'group-1' });

    expect(mockPrisma.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-1' } },
    });
  });

  it('rejects when the caller is the group creator', async () => {
    mockPrisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      createdById: 'user-1',
    });
    mockPrisma.groupMember.findUnique.mockResolvedValue({ userId: 'user-1' });

    await expect(
      leaveGroup({ userId: 'user-1', groupId: 'group-1' }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.VALIDATION_FAILED,
      message: expect.stringContaining('creator') as string,
    } satisfies Partial<AppError>);

    expect(mockPrisma.groupMember.delete).not.toHaveBeenCalled();
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
    mockPrisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      createdById: 'user-2',
    });
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