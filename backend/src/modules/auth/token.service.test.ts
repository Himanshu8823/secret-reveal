import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the infra modules so the service runs in pure unit-test mode.
vi.mock('../../config/db.js', () => ({
  prisma: {
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
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
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  },
}));
// Mock jwt.js so we don't need a real secret and can drive verifyRefreshToken
// deterministically. signRefreshToken returns a token whose `jti` is taken
// from randomUUID(); the token format is opaque to these tests because the
// service decodes it via jwt.decode, so we make jwt.decode return whatever
// jti the test wants.
vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: vi.fn(() => 'access.mock'),
  signRefreshToken: vi.fn(() => ({ token: 'refresh.mock', jti: 'jti-new' })),
  verifyRefreshToken: vi.fn(),
}));
// Mock jsonwebtoken so the service's `jwt.decode(refreshToken)` call is
// deterministic per test. We override only `decode` here — sign/verify are
// exercised via the jwt.js wrapper above.
vi.mock('jsonwebtoken', async () => {
  const actual = await vi.importActual<typeof import('jsonwebtoken')>('jsonwebtoken');
  return {
    ...actual,
    decode: vi.fn(),
  };
});

import { prisma } from '../../config/db.js';
import * as jwtLib from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt.js';
import { issueRefresh, rotateRefresh, revokeFamily, revokeToken } from './token.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  refreshToken: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  user: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockSignAccess = signAccessToken as unknown as ReturnType<typeof vi.fn>;
const mockSignRefresh = signRefreshToken as unknown as ReturnType<typeof vi.fn>;
const mockVerifyRefresh = verifyRefreshToken as unknown as ReturnType<typeof vi.fn>;
const mockJwtDecode = jwtLib.decode as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: decode returns the same jti that signRefreshToken produced.
  mockJwtDecode.mockImplementation(() => ({ jti: 'jti-new' }) as never);
  mockSignAccess.mockReturnValue('access.mock');
  mockSignRefresh.mockReturnValue({ token: 'refresh.mock', jti: 'jti-new' });
});

describe('issueRefresh', () => {
  it('returns the token + jti and inserts a row in a new family with the correct TTL', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await issueRefresh('user-1', {
      userAgent: 'agent',
      ipAddress: '127.0.0.1',
    });

    expect(result.token).toBe('refresh.mock');
    expect(result.jti).toBe('jti-new');

    expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const call = mockPrisma.refreshToken.create.mock.calls[0]![0] as {
      data: {
        jti: string;
        userId: string;
        familyId: string;
        expiresAt: Date;
        userAgent: string | null;
        ipAddress: string | null;
      };
    };
    expect(call.data.jti).toBe('jti-new');
    expect(call.data.userId).toBe('user-1');
    expect(call.data.userAgent).toBe('agent');
    expect(call.data.ipAddress).toBe('127.0.0.1');
    // familyId is a uuid; assert it's a 36-char string with dashes.
    expect(call.data.familyId).toMatch(/^[0-9a-f-]{36}$/);
    // 30d => ~30 days from now. Allow a wide window for clock drift in CI.
    const ttlMs = call.data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 86400 * 1000);
    expect(ttlMs).toBeLessThan(31 * 86400 * 1000);
  });

  it('reuses the provided familyId when given', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({});

    await issueRefresh('user-1', { familyId: 'family-existing' });

    const call = mockPrisma.refreshToken.create.mock.calls[0]![0] as {
      data: { familyId: string };
    };
    expect(call.data.familyId).toBe('family-existing');
  });
});

describe('rotateRefresh', () => {
  beforeEach(() => {
    // By default, $transaction just runs the callback with the global
    // prisma mock. Tests that need a transactional client can override.
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma as unknown as typeof prisma),
    );
  });

  it('marks the old token used, issues a new token in the same family, and returns access + refresh + user', async () => {
    mockVerifyRefresh.mockReturnValue({ sub: 'user-1', type: 'refresh', jti: 'jti-old' });
    const future = new Date(Date.now() + 10 * 86400 * 1000);
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: false,
      isRevoked: false,
      expiresAt: future,
    });
    mockPrisma.refreshToken.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Test',
    });

    const result = await rotateRefresh('refresh.old');

    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { jti: 'jti-old' },
      data: { isUsed: true },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jti: 'jti-new',
          userId: 'user-1',
          familyId: 'family-1',
        }),
      }),
    );
    expect(result.accessToken).toBe('access.mock');
    // signRefreshToken now returns { token, jti }; the service passes
    // through the .token field on the result envelope.
    expect(result.refreshToken).toBe('refresh.mock');
    expect(result.user).toEqual({
      id: 'user-1',
      phone: '+919999999999',
      name: 'Test',
    });
  });

  it('on an already-used token: revokes the entire family and throws TOKEN_INVALID', async () => {
    mockVerifyRefresh.mockReturnValue({ sub: 'user-1', type: 'refresh', jti: 'jti-old' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await expect(rotateRefresh('refresh.old')).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_INVALID,
      message: 'Token reuse detected',
    } satisfies Partial<AppError>);

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', isRevoked: false },
      data: { isRevoked: true },
    });
    // Must NOT issue a new token on the reuse path.
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('on a revoked token: throws TOKEN_INVALID and does not touch other rows', async () => {
    mockVerifyRefresh.mockReturnValue({ sub: 'user-1', type: 'refresh', jti: 'jti-old' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: false,
      isRevoked: true,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });

    await expect(rotateRefresh('refresh.old')).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_INVALID,
    } satisfies Partial<AppError>);

    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('on an expired token: throws TOKEN_EXPIRED', async () => {
    mockVerifyRefresh.mockReturnValue({ sub: 'user-1', type: 'refresh', jti: 'jti-old' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: false,
      isRevoked: false,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(rotateRefresh('refresh.old')).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_EXPIRED,
    } satisfies Partial<AppError>);

    expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('on a JWT that fails to verify: throws TOKEN_INVALID (or TOKEN_EXPIRED if expired)', async () => {
    // Simulate jsonwebtoken's TokenExpiredError shape.
    const expiredErr = new Error('jwt expired');
    (expiredErr as Error & { name: string }).name = 'TokenExpiredError';
    mockVerifyRefresh.mockImplementation(() => {
      throw expiredErr;
    });

    await expect(rotateRefresh('refresh.bad')).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_EXPIRED,
    } satisfies Partial<AppError>);
    // We must not have looked anything up.
    expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('on an unknown jti: throws TOKEN_INVALID without revoking anything', async () => {
    mockVerifyRefresh.mockReturnValue({ sub: 'user-1', type: 'refresh', jti: 'jti-unknown' });
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(rotateRefresh('refresh.unknown')).rejects.toMatchObject({
      status: 401,
      code: ErrorCode.TOKEN_INVALID,
    } satisfies Partial<AppError>);

    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('revokeFamily', () => {
  it('marks every non-revoked row in the family as revoked', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 4 });

    await revokeFamily('family-1');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', isRevoked: false },
      data: { isRevoked: true },
    });
  });
});

describe('revokeToken', () => {
  it('marks only the single matching row as revoked', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await revokeToken('jti-1');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { jti: 'jti-1', isRevoked: false },
      data: { isRevoked: true },
    });
  });
});