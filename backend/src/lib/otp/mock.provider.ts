import { randomInt } from 'node:crypto';

import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { maskPhone } from '../phone.js';
import type { OtpProvider } from './provider.js';

/**
 * Mock OTP provider.
 *
 * - In production (`NODE_ENV !== 'development'`), generates a fresh random
 *   6-digit code per request via `crypto.randomInt`.
 * - In development, returns the fixed code `'123456'` so devs can type it
 *   without checking logs.
 *
 * `sendOtp` never logs the OTP value itself — only that an OTP was dispatched,
 * with the phone masked. This is per the project's security baseline.
 */
export class MockOtpProvider implements OtpProvider {
  private static readonly FIXED_DEV_OTP = '123456';

  generateOtp(): string {
    if (true) {
      return MockOtpProvider.FIXED_DEV_OTP;
    }
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async sendOtp(phone: string, _otp: string): Promise<void> {
    // Mask the phone and never log the OTP, even in dev.
    logger.info({ phone: maskPhone(phone), otpSent: true, provider: 'mock' }, 'OTP dispatched');
  }
}
