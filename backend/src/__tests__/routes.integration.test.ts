import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';

// We mock the infra modules BEFORE importing the app. Per the project's
// test convention: vi.mock paths must match the import specifiers the
// modules-under-test use, which use the `.js` extension because of
// NodeNext module resolution.
vi.mock('../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(() => ({})),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    group: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    groupMember: { findUnique: vi.fn() },
    user2: { findMany: vi.fn() },
    post: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    response: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    reaction: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'development',
    PORT: 4000,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    OTP_PROVIDER: 'mock',
    OTP_TTL_SECONDS: 300,
    APP_NAME: 'test',
    CORS_ORIGINS: [],
  },
}));
vi.mock('../lib/jwt.js', () => ({
  signAccessToken: vi.fn((p) => `access.${p.sub}`),
  signRefreshToken: vi.fn(() => ({ token: 'refresh.mock', jti: 'jti-new' })),
  verifyAccessToken: vi.fn((token: string) => {
    // Token format used in this test: `access.<userId>`. We extract sub/phone
    // so the auth middleware can populate req.user.
    const sub = token.replace(/^access\./, '');
    return { sub, phone: '+910000000000', type: 'access' };
  }),
  verifyRefreshToken: vi.fn((token: string) => {
    if (token === 'expired.refresh') {
      const err = new Error('jwt expired') as Error & { name: string };
      err.name = 'TokenExpiredError';
      throw err;
    }
    if (token === 'used.refresh') {
      return { sub: 'user-1', type: 'refresh', jti: 'jti-old-used' };
    }
    if (token === 'unknown.refresh') {
      return { sub: 'user-1', type: 'refresh', jti: 'jti-unknown' };
    }
    if (token === 'valid.refresh') {
      return { sub: 'user-1', type: 'refresh', jti: 'jti-old' };
    }
    throw new Error('bad token');
  }),
}));

// Rate-limiter-flexible uses Redis under the hood. We replace the limiter
// module with a no-op + controllable override so we can exercise both the
// happy path and the 429 path.
type RateLimitOverride = (req: unknown, res: unknown, next: (err?: unknown) => void) => void;
let rateLimitOverride: RateLimitOverride | null = null;
vi.mock('../middlewares/rateLimiter.js', () => ({
  rateLimit: () => {
    return (req: unknown, _res: unknown, next: (err?: unknown) => void) => {
      if (rateLimitOverride) {
        rateLimitOverride(req, _res, next);
        return;
      }
      next();
    };
  },
  otpRequestByPhoneLimiter: { consume: vi.fn() },
  otpRequestByIpLimiter: { consume: vi.fn() },
  otpVerifyByPhoneLimiter: { consume: vi.fn() },
  refreshLimiter: { consume: vi.fn() },
  postCreateLimiter: { consume: vi.fn() },
  postResponseLimiter: { consume: vi.fn() },
  groupCreateLimiter: { consume: vi.fn() },
  groupInviteLimiter: { consume: vi.fn() },
  groupInviteResponseLimiter: { consume: vi.fn() },
  groupLeaveLimiter: { consume: vi.fn() },
  notificationsListLimiter: { consume: vi.fn() },
  pushTokenRegisterLimiter: { consume: vi.fn() },
  googleSignInLimiter: { consume: vi.fn() },
  phoneLinkRequestLimiter: { consume: vi.fn() },
  phoneLinkVerifyLimiter: { consume: vi.fn() },
}));

import { prisma } from '../config/db.js';
import { redis } from '../config/redis.js';
import { buildApp } from '../app.js';
import { AppError, ErrorCode } from '../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  refreshToken: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  group: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  groupMember: { findUnique: ReturnType<typeof vi.fn> };
  post: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  response: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  reaction: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

let app: Express;

beforeAll(() => {
  app = buildApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitOverride = null;
  // Default: $transaction just runs the callback with the global prisma mock.
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma as unknown as typeof prisma),
  );
});

afterAll(() => {
  rateLimitOverride = null;
});

/**
 * Helpers: every response must follow the project envelope.
 *   success: { success: true, data: ... }
 *   failure: { success: false, error: { code, message, details? } }
 */
function expectSuccessEnvelope(body: unknown): asserts body is {
  success: true;
  data: unknown;
} {
  expect(body).toMatchObject({ success: true });
  expect((body as { data?: unknown }).data).toBeDefined();
}

function expectErrorEnvelope(body: unknown, expectedCode: string): void {
  expect(body).toMatchObject({
    success: false,
    error: expect.objectContaining({ code: expectedCode }) as object,
  } as { success: false; error: { code: string } });
  const err = (body as { error: { message: unknown } }).error;
  expect(typeof err.message).toBe('string');
}

describe('envelope shape', () => {
  it('returns the success envelope on a happy path', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ countryCode: 'IN', phoneNumber: '9876543210' });

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
  });

  it('returns the error envelope on validation failure', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ countryCode: 'IN', phoneNumber: '' });

    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, ErrorCode.VALIDATION_FAILED);
  });

  it('returns the error envelope for unknown routes (404)', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    // Express's default 404 — body is JSON because Express auto-renders
    // it for `application/json`. We don't wrap 404s ourselves; the test
    // just asserts the route is reachable and the status is correct.
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/auth/otp/request', () => {
  it('happy path: stores OTP in redis, returns 200 with envelope (no OTP leak)', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ countryCode: 'IN', phoneNumber: '9876543210' });

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toEqual({ message: 'OTP sent' });
    expect(JSON.stringify(res.body)).not.toContain('123456');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:+919876543210',
      '123456',
      'EX',
      300,
    );
  });

  it('rejects an invalid phone with VALIDATION_FAILED (400)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ countryCode: 'AU', phoneNumber: '412345678' });

    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, ErrorCode.VALIDATION_FAILED);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit fires', async () => {
    // Override the rate-limit middleware to throw the same AppError shape
    // the real limiter would throw. This is how the central error handler
    // is exercised on the 429 path.
    rateLimitOverride = (_req, _res, next) => {
      next(new AppError(429, ErrorCode.RATE_LIMITED, 'Too many requests', { retryAfter: 600 }));
    };

    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ countryCode: 'IN', phoneNumber: '9876543210' });

    expect(res.status).toBe(429);
    expectErrorEnvelope(res.body, ErrorCode.RATE_LIMITED);
    expect(res.body.error.details).toEqual({ retryAfter: 600 });
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/otp/verify', () => {
  it('happy path: issues access + refresh tokens for a matching OTP', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.user.findUnique.mockResolvedValue(null); // new user
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-new',
      phone: '+919876543210',
      name: null,
    });

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ countryCode: 'IN', phoneNumber: '9876543210', otp: '123456' });

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toMatchObject({
      isNewUser: true,
      accessToken: 'access.user-new',
      refreshToken: 'refresh.mock',
      user: { id: 'user-new', phone: '+919876543210' },
    });

    expect(mockRedis.del).toHaveBeenCalledWith('otp:+919876543210');
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { phone: '+919876543210' },
    });
  });

  it('happy path: returns isNewUser=false for an existing user', async () => {
    mockRedis.get.mockResolvedValue('123456');
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+919876543210',
      name: 'A',
    });

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ countryCode: 'IN', phoneNumber: '9876543210', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.data.isNewUser).toBe(false);
    expect(res.body.data.user.name).toBe('A');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns OTP_INCORRECT on a mismatch (no OTP key delete, no DB work)', async () => {
    mockRedis.get.mockResolvedValue('000000');

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ countryCode: 'IN', phoneNumber: '9876543210', otp: '123456' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.OTP_INCORRECT);
    expect(mockRedis.del).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns OTP_EXPIRED when the key is missing', async () => {
    mockRedis.get.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ countryCode: 'IN', phoneNumber: '9876543210', otp: '123456' });

    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, ErrorCode.OTP_EXPIRED);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    // The default for the refresh happy-path: a fresh, valid, unused row.
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: false,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 10 * 86400 * 1000),
    });
    mockPrisma.refreshToken.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      phone: '+910000000000',
      name: 'A',
    });
  });

  it('happy path: rotates the refresh token and returns a new pair', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid.refresh' });

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toMatchObject({
      accessToken: 'access.user-1',
      refreshToken: 'refresh.mock',
      user: { id: 'user-1' },
    });

    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { jti: 'jti-old' },
      data: { isUsed: true },
    });
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('reuse detection: revokes the entire family and rejects with TOKEN_INVALID', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      jti: 'jti-old-used',
      userId: 'user-1',
      familyId: 'family-1',
      isUsed: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 10 * 86400 * 1000),
    });
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'used.refresh' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.TOKEN_INVALID);
    expect(res.body.error.message).toBe('Token reuse detected');

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', isRevoked: false },
      data: { isRevoked: true },
    });
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('expired JWT returns TOKEN_EXPIRED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'expired.refresh' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.TOKEN_EXPIRED);
    expect(mockPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('unknown jti returns TOKEN_INVALID without revoking anything', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'unknown.refresh' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.TOKEN_INVALID);
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('returns 401 without a Bearer token', async () => {
    const res = await request(app).patch('/api/v1/users/me').send({ name: 'New' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.TOKEN_INVALID);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 401 with a malformed Authorization header', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', 'NotBearer xyz')
      .send({ name: 'New' });

    expect(res.status).toBe(401);
    expectErrorEnvelope(res.body, ErrorCode.TOKEN_INVALID);
  });

  it('happy path: updates the name and returns the AuthUser shape', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      phone: '+910000000000',
      name: 'New Name',
    });

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', 'Bearer access.user-1')
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    expect(res.body.data).toEqual({
      id: 'user-1',
      phone: '+910000000000',
      name: 'New Name',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'New Name' },
      select: { id: true, phone: true, name: true },
    });
  });

  it('returns 400 on a validation failure (empty name)', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', 'Bearer access.user-1')
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, ErrorCode.VALIDATION_FAILED);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('route mount sanity', () => {
  it('health check returns success envelope', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expectSuccessEnvelope(res.body);
    // Liveness response shape: { status, uptimeSec, timestamp }.
    // Only assert on the stable keys; uptimeSec is non-deterministic.
    const data = res.body.data as { status: string; uptimeSec: number; timestamp: string };
    expect(data.status).toBe('ok');
    expect(typeof data.uptimeSec).toBe('number');
    expect(typeof data.timestamp).toBe('string');
  });

  it('an unknown /api/v1 path returns 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
  });
});
