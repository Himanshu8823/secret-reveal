import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { signAccessToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { maskPhone } from '../../lib/phone.js';
import { issueRefresh } from './token.service.js';
import type { AuthUser, VerifyOtpResult } from './auth.types.js';
import { getOtpProvider } from './otp.provider.js';

/**
 * Request an OTP for a phone. Rate limits are applied at the route layer;
 * this function assumes it is being called within an allowed window.
 *
 * The code itself is the provider's concern: on Twilio Verify it is minted,
 * delivered, expired and validated entirely on Twilio's side and never
 * enters this process. It is never returned to the client on any provider.
 */
export async function requestOtp(phone: string): Promise<void> {
  await getOtpProvider().sendOtp(phone);
  // Lifecycle event — useful for ops dashboards ("are OTPs being requested?")
  // and incident triage. Phone is masked; the code is never logged.
  logger.info({ phone: maskPhone(phone) }, 'OTP requested');
}

/**
 * Verify an OTP, upsert the user, and issue tokens.
 *
 * Single-use is the provider's guarantee, not ours: Twilio Verify deletes a
 * verification the moment it is approved (and on expiry or max attempts), so
 * a second verify with the same code lands on 'expired'. The mock provider
 * consumes its own key for the same reason. That means two near-simultaneous
 * verifies can't both reach the user-creation branch below.
 *
 * The findUnique + create pair is the new-vs-existing branch: from the
 * client's perspective both paths return the same response shape; only
 * `isNewUser` differs.
 *
 * Attempt limiting is enforced at the route layer (and again by Twilio's own
 * per-verification cap on the twilio provider).
 */
export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  const result = await getOtpProvider().checkOtp(phone, otp);

  if (result === 'expired') {
    throw new AppError(400, ErrorCode.OTP_EXPIRED, 'OTP expired, request again');
  }
  if (result === 'incorrect') {
    // The verification is still live — the user may retry until the
    // provider's attempt cap or our own verify limiter locks them out.
    throw new AppError(401, ErrorCode.OTP_INCORRECT, 'Incorrect OTP');
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  const isNewUser = existing === null;

  const user: AuthUser = isNewUser
    ? (await prisma.user.create({ data: { phone } })) satisfies AuthUser
    : (existing satisfies AuthUser);

  if (isNewUser) {
    // Signup is a meaningful business event — track it.
    logger.info({ userId: user.id }, 'new user created');
  }

  const accessToken = signAccessToken({ sub: user.id, phone: user.phone });
  // Refresh-token issuance is a side effect: token.service writes the jti to
  // refresh_tokens so /auth/refresh and /auth/logout can find/rotate/revoke
  // it. The user is already created above; here we just open a new family.
  const { token: refreshToken } = await issueRefresh(user.id);

  return { isNewUser, accessToken, refreshToken, user };
}
