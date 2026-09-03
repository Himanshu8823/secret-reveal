import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import { maskPhone } from '../../lib/phone.js';
import { getOtpProvider } from './otp.provider.js';
import type { AuthUser } from './auth.types.js';

/**
 * Phone-link: lets an already-authenticated Google user attach a verified
 * phone number to their account (the onboarding step after Google
 * sign-in when `needsPhone` is true).
 *
 * Deliberately separate from auth.service's requestOtp/verifyOtp rather
 * than reused directly:
 *   - The OTP key is namespaced under `otp:link:` so a link-phone request
 *     can never collide with (or be confused for) a login OTP for the
 *     same number.
 *   - verifyOtp there creates-or-signs-in a user; this one attaches a
 *     phone to a specific already-known userId and must never create a
 *     second account.
 *   - The phone must not already belong to another user — checked here,
 *     not needed on the login path.
 */

const LINK_OTP_KEY_PREFIX = 'otp:link:';
const linkOtpKey = (phone: string) => `${LINK_OTP_KEY_PREFIX}${phone}`;

export async function requestPhoneLinkOtp(phone: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (existing) {
    throw new AppError(409, ErrorCode.VALIDATION_FAILED, 'This phone number is already in use');
  }

  const provider = getOtpProvider();
  const otp = provider.generateOtp();
  await provider.sendOtp(phone, otp);
  await redis.set(linkOtpKey(phone), otp, 'EX', env.OTP_TTL_SECONDS);
  logger.info({ phone: maskPhone(phone) }, 'phone-link OTP requested');
}

export async function verifyPhoneLinkOtp(
  userId: string,
  phone: string,
  otp: string,
): Promise<AuthUser> {
  const stored = await redis.get(linkOtpKey(phone));

  if (stored === null) {
    throw new AppError(400, ErrorCode.OTP_EXPIRED, 'OTP expired, request again');
  }
  if (stored !== otp) {
    throw new AppError(401, ErrorCode.OTP_INCORRECT, 'Incorrect OTP');
  }

  // Single-use: delete before writing so a racing verify can't pass twice.
  await redis.del(linkOtpKey(phone));

  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
  if (current.phone !== null) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Account already has a phone number');
  }

  let updated;
  try {
    updated = await prisma.user.update({ where: { id: userId }, data: { phone } });
  } catch (err) {
    const isUniqueViolation =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002';
    if (isUniqueViolation) {
      // Someone else claimed the number between our check above and this
      // write. Rare (requires the same OTP-verified race), but the unique
      // constraint is the authoritative guard, so surface cleanly.
      throw new AppError(409, ErrorCode.VALIDATION_FAILED, 'This phone number is already in use');
    }
    throw err;
  }

  logger.info({ userId }, 'phone linked to account');

  return {
    id: updated.id,
    phone: updated.phone,
    name: updated.name,
    username: updated.username,
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
  };
}
