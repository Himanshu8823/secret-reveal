import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    post: {
      count: vi.fn(),
    },
    groupMember: {
      count: vi.fn(),
    },
  },
}));
vi.mock('../../config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
  },
}));
vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
    OTP_TTL_SECONDS: 300,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    OTP_PROVIDER: 'mock',
    BLOOM_CAPACITY: 1_000_000,
    BLOOM_ERROR_RATE: 0.01,
  },
}));

// Mock the bloom filter module so tests don't depend on Redis state and
// we can control has()/add() deterministically. The service depends on
// `usernameProbablyExists` and `addUsernameToBloom`; both are mocked.
vi.mock('../../lib/usernameBloom.js', () => ({
  usernameProbablyExists: vi.fn(),
  addUsernameToBloom: vi.fn(),
  ensureBloomLoaded: vi.fn(),
  rebuildBloomFromDb: vi.fn(),
}));

import { prisma } from '../../config/db.js';
import {
  getMyProfile,
  getMyStats,
  updateProfile,
} from './users.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import {
  usernameProbablyExists,
  addUsernameToBloom,
} from '../../lib/usernameBloom.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  post: { count: ReturnType<typeof vi.fn> };
  groupMember: { count: ReturnType<typeof vi.fn> };
};

const mockBloomExists = usernameProbablyExists as ReturnType<typeof vi.fn>;
const mockBloomAdd = addUsernameToBloom as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: bloom says "free" — most tests want to exercise the happy
  // path through to Postgres.
  mockBloomExists.mockResolvedValue(false);
  mockBloomAdd.mockResolvedValue(undefined);
});

describe('getMyProfile', () => {
  it('returns the full profile shape when the user exists', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'alice_99',
      avatarUrl: 'https://cdn.example.com/avatars/alice.jpg',
      bio: 'Hello, world.',
      createdAt,
    });

    const result = await getMyProfile('user-1');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        id: true,
        phone: true,
        name: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'alice_99',
      avatarUrl: 'https://cdn.example.com/avatars/alice.jpg',
      bio: 'Hello, world.',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('throws NOT_FOUND when the user row is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(getMyProfile('missing')).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'User not found',
    } satisfies Partial<AppError>);
  });
});

describe('getMyStats', () => {
  it('returns zero counts when the user has no posts or memberships', async () => {
    mockPrisma.post.count.mockResolvedValue(0);
    mockPrisma.groupMember.count.mockResolvedValue(0);

    const stats = await getMyStats('user-1');

    expect(mockPrisma.post.count).toHaveBeenCalledWith({
      where: { authorId: 'user-1', deletedAt: null },
    });
    expect(mockPrisma.groupMember.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(stats).toEqual({ posts: 0, activeGroups: 0 });
  });

  it('returns the real counts when the user has posts and memberships', async () => {
    mockPrisma.post.count.mockResolvedValue(12);
    mockPrisma.groupMember.count.mockResolvedValue(3);

    const stats = await getMyStats('user-1');

    expect(stats).toEqual({ posts: 12, activeGroups: 3 });
  });
});

describe('updateProfile', () => {
  it('updates the user name and returns the full UserProfile shape', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      username: null,
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'New Name',
      username: null,
      avatarUrl: null,
      bio: null,
      createdAt,
    });

    const result = await updateProfile({ userId: 'user-1', name: 'New Name' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name' },
      select: {
        id: true,
        phone: true,
        name: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      id: 'user-1',
      phone: '+919999999999',
      name: 'New Name',
      username: null,
      avatarUrl: null,
      bio: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    // No username in input → no bloom interaction.
    expect(mockBloomExists).not.toHaveBeenCalled();
    expect(mockBloomAdd).not.toHaveBeenCalled();
  });

  it('persists username on first set (current username is null)', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      username: null,
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'alice_99',
      avatarUrl: null,
      bio: null,
      createdAt,
    });

    await updateProfile({ userId: 'user-1', username: 'alice_99' });

    // Bloom says free → no DB lookup, DB write proceeds, bloom is taught.
    expect(mockBloomExists).toHaveBeenCalledWith('alice_99');
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { username: 'alice_99' },
      select: {
        id: true,
        phone: true,
        name: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });
    expect(mockBloomAdd).toHaveBeenCalledWith('alice_99');
  });

  it('rejects username change when one is already set (immutability)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      username: 'alice_99',
    });

    await expect(
      updateProfile({ userId: 'user-1', username: 'alice_new' }),
    ).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Username cannot be changed',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockBloomExists).not.toHaveBeenCalled();
  });

  it('rejects same-value username change when one is already set', async () => {
    // Even setting the same username counts as "trying to change" — the
    // contract is that the field is frozen once set, not idempotent.
    mockPrisma.user.findUnique.mockResolvedValue({
      username: 'alice_99',
    });

    await expect(
      updateProfile({ userId: 'user-1', username: 'alice_99' }),
    ).rejects.toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('allows updates to other fields even when username is frozen', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      username: 'alice_99',
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice 2.0',
      username: 'alice_99',
      avatarUrl: null,
      bio: null,
      createdAt,
    });

    await updateProfile({ userId: 'user-1', name: 'Alice 2.0' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Alice 2.0' },
      select: {
        id: true,
        phone: true,
        name: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });
  });

  it('treats bloom "free" as authoritative — no extra DB lookup', async () => {
    // Bloom is the fast path: when it says "free", we trust it and let
    // Postgres UNIQUE be the rare second-line of defense.
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'fresh_name',
      avatarUrl: null,
      bio: null,
      createdAt,
    });
    mockBloomExists.mockResolvedValue(false); // bloom says free

    await updateProfile({ userId: 'user-1', username: 'fresh_name' });

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockBloomAdd).toHaveBeenCalledWith('fresh_name');
  });

  it('falls through to DB lookup when bloom says "probably taken"', async () => {
    // Bloom false positive: filter says "probably taken" but no user
    // actually has that username. Service must check the DB and accept.
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.findFirst.mockResolvedValue(null); // actually free
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'false_positive',
      avatarUrl: null,
      bio: null,
      createdAt,
    });
    mockBloomExists.mockResolvedValue(true); // bloom false positive

    await updateProfile({ userId: 'user-1', username: 'false_positive' });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { username: 'false_positive', NOT: { id: 'user-1' } },
      select: { id: true },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockBloomAdd).toHaveBeenCalledWith('false_positive');
  });

  it('rejects with USERNAME_TAKEN when bloom says taken and DB confirms', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'other-user' });
    mockBloomExists.mockResolvedValue(true);

    await expect(
      updateProfile({ userId: 'user-1', username: 'taken_name' }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.USERNAME_TAKEN,
      message: 'Username is already taken',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockBloomAdd).not.toHaveBeenCalled();
  });

  it('translates Prisma P2002 (UNIQUE race) to USERNAME_TAKEN 409', async () => {
    // Bloom said "free" but two concurrent writers raced; the loser
    // hits UNIQUE. Surface as USERNAME_TAKEN (409), not generic
    // validation (400) — mobile can show a specific "username taken"
    // UX.
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`username`)',
      { code: 'P2002', clientVersion: 'test', meta: { target: ['username'] } },
    );
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockBloomExists.mockResolvedValue(false); // bloom said free
    mockPrisma.user.update.mockRejectedValue(p2002);

    await expect(
      updateProfile({ userId: 'user-1', username: 'raced_name' }),
    ).rejects.toMatchObject({
      status: 409,
      code: ErrorCode.USERNAME_TAKEN,
      message: 'Username is already taken',
    } satisfies Partial<AppError>);

    expect(mockBloomAdd).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the user row is missing (Prisma P2025)', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError(
      'Record to update not found.',
      { code: 'P2025', clientVersion: 'test' },
    );
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.update.mockRejectedValue(p2025);

    await expect(
      updateProfile({ userId: 'missing', name: 'x' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'User not found',
    } satisfies Partial<AppError>);
  });

  it('throws NOT_FOUND when the user row is gone between read and write', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      updateProfile({ userId: 'missing', name: 'x' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'User not found',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('re-throws non-Prisma errors untouched', async () => {
    const other = new Error('boom');
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.update.mockRejectedValue(other);

    await expect(
      updateProfile({ userId: 'user-1', name: 'x' }),
    ).rejects.toBe(other);
  });

  it('swallows bloom add failures so the DB write still succeeds', async () => {
    // A Redis hiccup on addUsernameToBloom must not poison the
    // successful profile update — Postgres UNIQUE is the real authority
    // and the next rebuild will fix any drift.
    const createdAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({ username: null });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Alice',
      username: 'alice_99',
      avatarUrl: null,
      bio: null,
      createdAt,
    });
    mockBloomExists.mockResolvedValue(false);
    mockBloomAdd.mockRejectedValue(new Error('redis down'));

    const result = await updateProfile({ userId: 'user-1', username: 'alice_99' });

    expect(result.username).toBe('alice_99');
    expect(mockBloomAdd).toHaveBeenCalledWith('alice_99');
  });

  it('exposes the immutable-fields set so callers can validate payloads', async () => {
    // Importing the test-only export — gives us a stable handle for the
    // "what keys are mutable" contract without coupling to internals.
    const { __testing } = await import('./users.service.js');
    expect(__testing.IMMUTABLE_FIELDS.has('phone')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('id')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('createdAt')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('name')).toBe(false);
    expect(__testing.IMMUTABLE_FIELDS.has('username')).toBe(false);
    expect(__testing.IMMUTABLE_FIELDS.has('bio')).toBe(false);
    expect(__testing.IMMUTABLE_FIELDS.has('avatarUrl')).toBe(false);
  });
});
