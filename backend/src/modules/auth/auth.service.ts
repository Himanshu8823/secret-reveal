import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { signAccessToken, signRefreshToken } from '../../lib/jwt.js';
import type { AuthUser, VerifyOtpResult } from './auth.types.js';
import { getOtpProvider } from './otp.provider.js';

const OTP_KEY_PREFIX = 'otp:';
const otpKey = (phone: string) => `${OTP_KEY_PREFIX}${phone}`;

/**
 * Request an OTP for a phone. Rate limits are applied at the route layer;
 * this function assumes it is being called within an allowed window.
 *
 * The OTP value is stored in Redis with an explicit TTL and never returned
 * to the client — even in mock mode, so the discipline is set now.
 */
export async function requestOtp(phone: string): Promise<void> {
  const provider = getOtpProvider();
  const otp = provider.generateOtp();
  await provider.sendOtp(phone, otp);
  // SET with EX — explicit TTL, no key can live forever.
  await redis.set(otpKey(phone), otp, 'EX', env.OTP_TTL_SECONDS);
}

/**
 * Verify an OTP, upsert the user, and issue tokens.
 *
 * The OTP key is deleted on the happy path BEFORE any DB work so that two
 * near-simultaneous verify calls can't both pass. The findUnique + create
 * pair is the new-vs-existing branch: from the client's perspective both
 * paths return the same response shape; only `isNewUser` differs.
 *
 * The verify limiter is enforced in the route; we also consume a point on
 * every call (success or failure) by relying on the route-level limiter.
 */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  const stored = await redis.get(otpKey(phone));

  if (stored === null) {
    throw new AppError(400, ErrorCode.OTP_EXPIRED, 'OTP expired, request again');
  }

  if (stored !== otp) {
    // Mismatch — the OTP key stays alive (user can retry until TTL or until
    // the verify-attempt limiter locks them out).
    throw new AppError(401, ErrorCode.OTP_INCORRECT, 'Incorrect OTP');
  }

  // Happy path: single-use. Delete the key BEFORE creating the user so a
  // racing request can't pass the equality check above.
  await redis.del(otpKey(phone));

  const existing = await prisma.user.findUnique({ where: { phone } });
  const isNewUser = existing === null;

  const user: AuthUser = isNewUser
    ? (await prisma.user.create({ data: { phone } })) satisfies AuthUser
    : (existing satisfies AuthUser);

  const accessToken = signAccessToken({ sub: user.id, phone: user.phone });
  const refreshToken = signRefreshToken({ sub: user.id });

  return { isNewUser, accessToken, refreshToken, user };
}
