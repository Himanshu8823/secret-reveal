import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { maskPhone } from '../../lib/phone.js';

/**
 * OTP delivery abstraction. We only ship a MockOtpProvider for now; adding
 * Twilio later is a one-file change (per the kickoff). Selection is by env
 * var so swapping is config, not a code edit.
 *
 * Per CLAUDE.md, mock provider must not log the OTP itself; log only that a
 * code was sent, with the phone masked.
 */
export interface OtpProvider {
  generateOtp(): string;
  sendOtp(phone: string, otp: string): Promise<void>;
}

export class MockOtpProvider implements OtpProvider {
  private static readonly FIXED_OTP = '123456';

  generateOtp(): string {
    return MockOtpProvider.FIXED_OTP;
  }

  async sendOtp(phone: string, _otp: string): Promise<void> {
    // Mask the phone and never log the OTP, even in dev.
    logger.info({ phone: maskPhone(phone), otpSent: true, provider: 'mock' }, 'OTP dispatched');
  }
}

export function getOtpProvider(): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case 'mock':
      return new MockOtpProvider();
    default: {
      // Exhaustiveness — adding a new provider is a compile error here.
      const _exhaustive: never = env.OTP_PROVIDER;
      throw new Error(`Unknown OTP_PROVIDER: ${String(_exhaustive)}`);
    }
  }
}
