import { env } from '../../config/env.js';
import { MockOtpProvider } from './mock.provider.js';

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
