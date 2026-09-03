import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
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
    OTP_PROVIDER: 'mock',
  },
}));

import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { requestPhoneLinkOtp, verifyPhoneLinkOtp } from './phone-link.service.js';
import { AppError } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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

describe('requestPhoneLinkOtp', () => {
  it('rejects a phone number already used by another account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'other-user' });

    await expect(requestPhoneLinkOtp('+919999999999')).rejects.toMatchObject({
      status: 409,
      code: 'VALIDATION_FAILED',
    } satisfies Partial<AppError>);

    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('stores the OTP under the link-specific namespace, distinct from login OTPs', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');

    await requestPhoneLinkOtp('+919999999999');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:link:+919999999999',
      '123456',
      'EX',
      300,
    );
  });
});

describe('verifyPhoneLinkOtp', () => {
  it('throws OTP_EXPIRED when the key is missing', async () => {
    mockRedis.get.mockResolvedValue(null);

    await expect(
      verifyPhoneLinkOtp('user-1', '+919999999999', '123456'),
    ).rejects.toMatchObject({ status: 400, code: 'OTP_EXPIRED' } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('throws OTP_INCORRECT on mismatch without consuming the key', async () => {
    mockRedis.get.mockResolvedValue('000000');

    await expect(
      verifyPhoneLinkOtp('user-1', '+919999999999', '123456'),
    ).rejects.toMatchObject({ status: 401, code: 'OTP_INCORRECT' } satisfies Partial<AppError>);

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('rejects when the caller already has a phone', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: '+911111111111' });

    await expect(
      verifyPhoneLinkOtp('user-1', '+919999999999', '123456'),
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' } satisfies Partial<AppError>);

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('attaches the phone on success', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: null });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: null,
      username: null,
      avatarUrl: null,
      bio: null,
    });

    const result = await verifyPhoneLinkOtp('user-1', '+919999999999', '123456');

    expect(mockRedis.del).toHaveBeenCalledWith('otp:link:+919999999999');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { phone: '+919999999999' },
    });
    expect(result.phone).toBe('+919999999999');
  });

  it('translates a unique-constraint race into VALIDATION_FAILED', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', phone: null });
    mockPrisma.user.update.mockRejectedValue({ code: 'P2002' });

    await expect(
      verifyPhoneLinkOtp('user-1', '+919999999999', '123456'),
    ).rejects.toMatchObject({ status: 409, code: 'VALIDATION_FAILED' } satisfies Partial<AppError>);
  });
});
