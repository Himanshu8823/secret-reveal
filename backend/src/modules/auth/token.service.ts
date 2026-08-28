import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import type { AuthUser } from './auth.types.js';

/**
 * Refresh-token service: rotation + reuse detection.
 *
 * The `refresh_tokens` table stores one row per issued jti. Every refresh
 * creates a new row linked to the same `familyId`; the previous row is
 * marked `isUsed`. If a request arrives carrying a row whose `isUsed` is
 * already true, we treat it as token theft and revoke the whole family.
 *
 * All read-and-mutate work for a single refresh runs inside one Prisma
 * transaction so two concurrent calls carrying the same old token cannot
 * both pass the "is used?" check.
 */

export type IssueRefreshOptions = {
  familyId?: string;
  userAgent?: string;
  ipAddress?: string;
};

export type RotateRefreshOptions = {
  userAgent?: string;
  ipAddress?: string;
};

export type RotateRefreshResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

/**
 * Convert a JWT TTL string (e.g. '30d', '15m', '1h') to whole seconds.
 * Anything unrecognised falls back to 30 days — the documented default —
 * rather than throwing, because an invalid env var would already have been
 * caught at boot if a stricter check existed.
 */
function ttlStringToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 86400;
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 30 * 86400;
  }
}

/**
 * Mint a new refresh token and persist its row.
 *
 * When `opts.familyId` is provided (the rotation path) the new row joins
 * the existing family; otherwise we start a brand-new family with a fresh
 * uuid. `userAgent` and `ipAddress` are recorded for audit / reuse
 * forensics.
 */
export async function issueRefresh(
  userId: string,
  opts: IssueRefreshOptions = {},
): Promise<{ token: string; jti: string }> {
  const { token, jti } = signRefreshToken({ sub: userId });
  const familyId = opts.familyId ?? randomUUID();
  const ttlSeconds = ttlStringToSeconds(env.JWT_REFRESH_TTL);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await prisma.refreshToken.create({
    data: {
      jti,
      userId,
      familyId,
      expiresAt,
      userAgent: opts.userAgent ?? null,
      ipAddress: opts.ipAddress ?? null,
    },
  });

  return { token, jti };
}

/**
 * Rotate a refresh token. Implements the reuse-detection algorithm from
 * 03-BACKEND-ARCHITECTURE.md §5.2.2:
 *
 *   1. Verify the JWT (signature + exp). Bad signature → TOKEN_INVALID.
 *   2. Look up jti inside a transaction.
 *   3. Missing row, already-used row, or revoked row → reject; on reuse
 *      we also revoke every sibling in the family.
 *   4. Expired row → TOKEN_EXPIRED.
 *   5. Happy path: mark old used, mint a new pair in the same family,
 *      and return it. The new row's insert and the old row's update
 *      commit together so a concurrent rotate with the same old token
 *      can never both pass.
 *
 * The transaction client (`tx`) is used for the read, the mark-used, and
 * the family-revoke sweep. The new-row insert runs inside the same
 * transaction via `prisma.refreshToken.create({ data })` against the
 * transactional client — using `prisma.refreshToken.create` (the global
 * client) here would defeat the atomicity guarantee.
 */
export async function rotateRefresh(
  oldToken: string,
  opts: RotateRefreshOptions = {},
): Promise<RotateRefreshResult> {
  // Step 1: JWT-level verification lives outside the transaction — there's
  // no point taking a row lock on a token we can't even decode.
  let payload: { sub: string; type: 'refresh'; jti: string };
  try {
    payload = verifyRefreshToken(oldToken);
  } catch (err) {
    // jwt throws by `name: 'TokenExpiredError'` and `name: 'JsonWebTokenError'`.
    // We check by name rather than instanceof so the test mocks (which
    // construct plain Errors) work the same as the real library.
    const errorName = err instanceof Error ? err.name : '';
    if (errorName === 'TokenExpiredError') {
      throw new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Refresh token expired');
    }
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Refresh token invalid');
  }

  const oldJti = payload.jti;

  return prisma.$transaction(async (tx) => {
    const row = await tx.refreshToken.findUnique({ where: { jti: oldJti } });

    // Case 1: never seen this jti — straight reject.
    if (!row) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Unknown refresh token');
    }

    // Case 2: this jti was already used. Reuse! Revoke the entire family.
    if (row.isUsed) {
      await tx.refreshToken.updateMany({
        where: { familyId: row.familyId, isRevoked: false },
        data: { isRevoked: true },
      });
      // Security event — log for incident triage. Do NOT include the token.
      logger.warn(
        { userId: row.userId, familyId: row.familyId, jti: row.jti },
        'refresh token reuse detected; family revoked',
      );
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Token reuse detected');
    }

    // Case 3: revoked by logout or another flow.
    if (row.isRevoked) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Refresh token revoked');
    }

    // Case 4: expired by time.
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Refresh token expired');
    }

    // Happy path: mark old used, mint a new pair in the same family.
    // The new row insert runs against the transactional client so the
    // mark-used and the insert commit atomically.
    await tx.refreshToken.update({
      where: { jti: oldJti },
      data: { isUsed: true },
    });

    const { token: newRefreshToken, jti: newJti } = signRefreshToken({ sub: row.userId });

    // We need the new jti to persist it; signRefreshToken mints one
    // internally and returns it alongside the encoded token. To keep the
    // helper single-purpose, we inline the row creation here.
    if (!newJti) {
      throw new AppError(500, ErrorCode.INTERNAL, 'Failed to mint refresh jti');
    }

    const ttlSeconds = ttlStringToSeconds(env.JWT_REFRESH_TTL);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await tx.refreshToken.create({
      data: {
        jti: newJti,
        userId: row.userId,
        familyId: row.familyId,
        expiresAt,
        userAgent: opts.userAgent ?? null,
        ipAddress: opts.ipAddress ?? null,
      },
    });

    const user = await tx.user.findUnique({ where: { id: row.userId } });
    if (!user) {
      throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Refresh token user not found');
    }

    const accessToken = signAccessToken({ sub: user.id, phone: user.phone });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { id: user.id, phone: user.phone, name: user.name },
    };
  });
}

/**
 * Revoke every row in a family. Used by logout — a single call kills the
 * user's entire refresh-token lineage.
 */
export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, isRevoked: false },
    data: { isRevoked: true },
  });
}

/**
 * Revoke a single row by jti. Used by logout when only the current token
 * is known and we don't have the family id handy.
 */
export async function revokeToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { jti, isRevoked: false },
    data: { isRevoked: true },
  });
}