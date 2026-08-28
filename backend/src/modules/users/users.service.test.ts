import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      update: vi.fn(),
    },
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
import { updateProfile } from './users.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: { update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateProfile', () => {
  it('updates the user name and returns the trimmed AuthUser shape', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'New Name',
    });

    const result = await updateProfile({ userId: 'user-1', name: 'New Name' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name' },
      select: { id: true, phone: true, name: true },
    });
    expect(result).toEqual({
      id: 'user-1',
      phone: '+919999999999',
      name: 'New Name',
    });
  });

  it('throws NOT_FOUND when the user row is missing (Prisma P2025)', async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError(
      'Record to update not found.',
      { code: 'P2025', clientVersion: 'test' },
    );
    mockPrisma.user.update.mockRejectedValue(p2025);

    await expect(
      updateProfile({ userId: 'missing', name: 'x' }),
    ).rejects.toMatchObject({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: 'User not found',
    } satisfies Partial<AppError>);
  });

  it('re-throws non-P2025 prisma errors untouched', async () => {
    const other = new Error('boom');
    mockPrisma.user.update.mockRejectedValue(other);

    await expect(
      updateProfile({ userId: 'user-1', name: 'x' }),
    ).rejects.toBe(other);
  });

  it('exposes the immutable-fields set so callers can validate payloads', async () => {
    // Importing the test-only export — gives us a stable handle for the
    // "what keys are mutable" contract without coupling to internals.
    const { __testing } = await import('./users.service.js');
    expect(__testing.IMMUTABLE_FIELDS.has('phone')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('id')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('createdAt')).toBe(true);
    expect(__testing.IMMUTABLE_FIELDS.has('name')).toBe(false);
  });
});
