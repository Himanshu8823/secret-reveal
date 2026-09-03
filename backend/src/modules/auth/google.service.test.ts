import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock('../../config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(() => ({})),
    },
  },
}));
vi.mock('../../config/env.js', () => ({
  env: {
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    GOOGLE_IOS_CLIENT_ID: 'ios-client-id',
    GOOGLE_ANDROID_CLIENT_ID: '',
    GOOGLE_WEB_CLIENT_ID: 'web-client-id',
  },
}));
vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: vi.fn(() => 'access.mock'),
  signRefreshToken: vi.fn(() => ({ token: 'refresh.mock', jti: 'jti-new' })),
}));

import { prisma } from '../../config/db.js';
import { signInWithGoogle } from './google.service.js';
import { AppError } from '../../lib/AppError.js';

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const validPayload = {
  sub: 'google-sub-123',
  email: 'user@example.com',
  email_verified: true,
  name: 'Jane Doe',
  picture: 'https://example.com/photo.jpg',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('signInWithGoogle', () => {
  it('rejects a token that fails signature/audience verification', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Wrong recipient'));

    await expect(signInWithGoogle('bad-token')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID',
    } satisfies Partial<AppError>);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token with an unverified email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...validPayload, email_verified: false }),
    });

    await expect(signInWithGoogle('token')).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID',
    } satisfies Partial<AppError>);
  });

  it('creates a new user with phone=null on first Google sign-in', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => validPayload });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // by googleId
      .mockResolvedValueOnce(null); // by email (only reached if googleId miss)
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      phone: null,
      email: 'user@example.com',
      googleId: 'google-sub-123',
      name: 'Jane Doe',
      username: null,
      avatarUrl: 'https://example.com/photo.jpg',
      bio: null,
    });

    const result = await signInWithGoogle('good-token');

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        googleId: 'google-sub-123',
        email: 'user@example.com',
        name: 'Jane Doe',
        avatarUrl: 'https://example.com/photo.jpg',
      },
    });
    expect(result.isNewUser).toBe(true);
    expect(result.needsPhone).toBe(true);
    expect(result.user.phone).toBeNull();
    expect(result.accessToken).toBe('access.mock');
  });

  it('signs in an existing googleId user without creating a row', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => validPayload });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      phone: '+919999999999',
      email: 'user@example.com',
      googleId: 'google-sub-123',
      name: 'Jane Doe',
      username: 'jane',
      avatarUrl: null,
      bio: null,
    });

    const result = await signInWithGoogle('good-token');

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.needsPhone).toBe(false);
    expect(result.user.phone).toBe('+919999999999');
  });

  it('links Google to an existing email match with no googleId yet', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => validPayload });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // by googleId — no match
      .mockResolvedValueOnce({
        id: 'user-2',
        phone: null,
        email: 'user@example.com',
        googleId: null,
        name: null,
        username: null,
        avatarUrl: null,
        bio: null,
      }); // by email — match, unlinked
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-2',
      phone: null,
      email: 'user@example.com',
      googleId: 'google-sub-123',
      name: null,
      username: null,
      avatarUrl: null,
      bio: null,
    });

    const result = await signInWithGoogle('good-token');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      data: { googleId: 'google-sub-123' },
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe('user-2');
  });
});
