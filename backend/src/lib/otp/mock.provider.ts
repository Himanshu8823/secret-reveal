import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { logger } from '../logger.js';
import { maskPhone } from '../phone.js';
import type { OtpCheckResult, OtpProvider } from './provider.js';

/**
 * Mock OTP provider — development only.
 *
 * Delivers nothing. It writes the fixed code `123456` to Redis under its own
 * namespace so a developer can log in without an SMS, and validates against
 * that. Because it holds the code itself, it presents the same send/check
 * contract as Twilio Verify, and the auth service stays provider-agnostic.
 *
 * config/env.ts refuses to boot with OTP_PROVIDER=mock outside development,
 * so this cannot become the live authentication path by accident — that
 * guard is what makes a fixed code safe here.
 */

const MOCK_OTP_KEY_PREFIX = 'otp:mock:';
const mockOtpKey = (phone: string) => `${MOCK_OTP_KEY_PREFIX}${phone}`;

export class MockOtpProvider implements OtpProvider {
  private static readonly FIXED_DEV_OTP = '123456';

  async sendOtp(phone: string): Promise<void> {
    // Explicit TTL — mirrors Twilio Verify's ~10 minute window and keeps the
    // "no Redis key lives forever" rule.
    await redis.set(mockOtpKey(phone), MockOtpProvider.FIXED_DEV_OTP, 'EX', env.OTP_TTL_SECONDS);
    // Mask the phone and never log the code, even in dev.
    logger.info({ phone: maskPhone(phone), provider: 'mock' }, 'OTP dispatched');
  }

  async checkOtp(phone: string, code: string): Promise<OtpCheckResult> {
    const stored = await redis.get(mockOtpKey(phone));
    if (stored === null) return 'expired';
    if (stored !== code) return 'incorrect';
    // Single-use: consume before returning so a racing check can't reuse it.
    await redis.del(mockOtpKey(phone));
    return 'approved';
  }
}
