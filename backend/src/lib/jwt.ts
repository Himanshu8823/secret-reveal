import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = {
  sub: string; // user id
  // Null until the user completes phone onboarding (Google-only signups
  // start without one). Present so downstream code never needs a DB round
  // trip just to know whether the caller has a verified phone yet.
  phone: string | null;
  type: 'access';
};

export type RefreshTokenPayload = {
  sub: string;
  type: 'refresh';
  jti: string;
};

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Sign a refresh token and return both the encoded JWT and the freshly
 * minted jti. The jti is the row key in the `refresh_tokens` table; the
 * caller persists it so rotation and reuse detection can find the row
 * without decoding the token again.
 */
export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type' | 'jti'>,
): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, type: 'refresh', jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'],
  });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}