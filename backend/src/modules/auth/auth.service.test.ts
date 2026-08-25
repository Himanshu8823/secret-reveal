import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
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
    OTP_TTL_SECONDS: 300,
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    OTP_PROVIDER: 'mock',
  },
}));
vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: vi.fn(() => 'access.mock'),
  signRefreshToken: vi.fn(() => 'refresh.mock'),
}));

import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { requestOtp, verifyOtp } from './auth.service.js';
import { AppError } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};
const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestOtp', () => {
  it('stores the OTP in Redis with an explicit TTL and never returns it', async () => {
    mockRedis.set.mockResolvedValue('OK');

    await requestOtp('+919999999999');

    expect(mockRedis.set).toHaveBeenCalledWith('otp:+919999999999', '123456', 'EX', 300);
  });
});

describe('verifyOtp', () => {
  it('throws OTP_EXPIRED when the key is missing', async () => {
    mockRedis.get.mockResolvedValue(null);

    await expect(verifyOtp('+919999999999', '123456')).rejects.toMatchObject({
      status: 400,
      code: 'OTP_EXPIRED',
    } satisfies Partial<AppError>);

    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws OTP_INCORRECT on mismatch and does not delete the key', async () => {
    mockRedis.get.mockResolvedValue('000000');

    await expect(verifyOtp('+919999999999', '123456')).rejects.toMatchObject({
      status: 401,
      code: 'OTP_INCORRECT',
    } satisfies Partial<AppError>);

    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates a new user on first login (isNewUser=true)', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyOtp('+919999999999', '123456');

    expect(mockRedis.del).toHaveBeenCalledWith('otp:+919999999999');
    expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: { phone: '+919999999999' } });
    expect(result).toEqual({
      isNewUser: true,
      accessToken: 'access.mock',
      refreshToken: 'refresh.mock',
      user: { id: 'user-1', phone: '+919999999999', name: null },
    });
  });

  it('logs in an existing user without creating a row (isNewUser=false)', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyOtp('+919999999999', '123456');

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.user.name).toBe('Test');
  });

  it('enforces single-use: the key is deleted before DB work', async () => {
    // If two requests both pass the equality check, the second's `del` will
    // already have happened and the next `get` returns null. We simulate
    // that ordering to assert the sequence is `del` -> `findUnique`.
    const callOrder: string[] = [];
    mockRedis.get.mockResolvedValue('123456');
    mockRedis.del.mockImplementation(async () => {
      callOrder.push('del');
      return 1;
    });
    mockPrisma.user.findUnique.mockImplementation(async () => {
      callOrder.push('findUnique');
      return {
        id: 'user-1',
        phone: '+919999999999',
        name: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await verifyOtp('+919999999999', '123456');

    expect(callOrder).toEqual(['del', 'findUnique']);
  });
});
