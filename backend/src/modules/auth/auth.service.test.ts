import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    // verifyOtp now calls issueRefresh() which inserts a refresh_tokens row.
    refreshToken: {
      create: vi.fn(() => ({})),
    },
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
vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: vi.fn(() => 'access.mock'),
  // After Phase 0.4b, signRefreshToken returns { token, jti } not a bare string.
  signRefreshToken: vi.fn(() => ({ token: 'refresh.mock', jti: 'jti-new' })),
}));

// The provider is the seam now: the auth service no longer knows how a code
// is stored or checked, only whether the check approved. Mocking here keeps
// these tests about the auth branching, not about Twilio or Redis.
const sendOtpMock = vi.fn();
const checkOtpMock = vi.fn();
vi.mock('./otp.provider.js', () => ({
  getOtpProvider: () => ({
    sendOtp: (...a: unknown[]) => sendOtpMock(...a),
    checkOtp: (...a: unknown[]) => checkOtpMock(...a),
  }),
}));

import { prisma } from '../../config/db.js';
import { requestOtp, verifyOtp } from './auth.service.js';
import { AppError } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestOtp', () => {
  it('delegates delivery to the provider and never returns a code', async () => {
    sendOtpMock.mockResolvedValue(undefined);

    const result = await requestOtp('+919999999999');

    expect(sendOtpMock).toHaveBeenCalledWith('+919999999999');
    expect(result).toBeUndefined();
  });

  it('propagates a provider send failure instead of reporting success', async () => {
    sendOtpMock.mockRejectedValue(new AppError(502, 'INTERNAL', 'Could not send OTP, try again'));

    await expect(requestOtp('+919999999999')).rejects.toMatchObject({ status: 502 });
  });
});

describe('verifyOtp', () => {
  it('throws OTP_EXPIRED when the provider reports no live verification', async () => {
    checkOtpMock.mockResolvedValue('expired');

    await expect(verifyOtp('+919999999999', '123456')).rejects.toMatchObject({
      status: 400,
      code: 'OTP_EXPIRED',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws OTP_INCORRECT on a wrong code without touching the DB', async () => {
    checkOtpMock.mockResolvedValue('incorrect');

    await expect(verifyOtp('+919999999999', '123456')).rejects.toMatchObject({
      status: 401,
      code: 'OTP_INCORRECT',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates a new user on first login (isNewUser=true)', async () => {
    checkOtpMock.mockResolvedValue('approved');
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await verifyOtp('+919999999999', '123456');

    expect(checkOtpMock).toHaveBeenCalledWith('+919999999999', '123456');
    expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: { phone: '+919999999999' } });
    expect(result.isNewUser).toBe(true);
    expect(result.accessToken).toBe('access.mock');
    expect(result.refreshToken).toBe('refresh.mock');
    expect(result.user.id).toBe('user-1');
    expect(result.user.phone).toBe('+919999999999');
    expect(result.user.name).toBeNull();
  });

  it('logs in an existing user without creating a row (isNewUser=false)', async () => {
    checkOtpMock.mockResolvedValue('approved');
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

  it('checks the code before any DB work, so a spent code never creates a user', async () => {
    const callOrder: string[] = [];
    checkOtpMock.mockImplementation(async () => {
      callOrder.push('checkOtp');
      return 'approved';
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

    expect(callOrder).toEqual(['checkOtp', 'findUnique']);
  });
});
