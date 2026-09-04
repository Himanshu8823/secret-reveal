import { env } from '../../config/env.js';
import { MockOtpProvider } from './mock.provider.js';
import { TwilioOtpProvider } from './twilio.provider.js';

/**
 * OTP delivery + verification abstraction.
 *
 * The interface is deliberately "send" and "check" rather than "generate a
 * code and store it": Twilio Verify owns the code's whole lifecycle — it
 * mints, delivers, expires, and validates it server-side — so there is no
 * code for us to hold. The mock provider keeps its own in-memory state to
 * present the same contract in development.
 *
 * That means the OTP value never touches our process or our Redis on the
 * Twilio path, which is also why the auth service no longer stores one.
 */
export interface OtpProvider {
  /** Send a verification code to the phone (E.164). */
  sendOtp(phone: string): Promise<void>;
  /**
   * Check a user-submitted code. Returns the outcome rather than throwing,
   * so the auth service owns the mapping to HTTP/AppError codes and every
   * provider surfaces the same three cases.
   *
   *   'approved'  — correct code, consume the login
   *   'incorrect' — wrong code, the user may retry
   *   'expired'   — no live verification: expired, already used, or the
   *                 provider's own attempt cap was hit
   */
  checkOtp(phone: string, code: string): Promise<OtpCheckResult>;
}

export type OtpCheckResult = 'approved' | 'incorrect' | 'expired';

export function getOtpProvider(): OtpProvider {
  switch (env.OTP_PROVIDER) {
    case 'mock':
      return new MockOtpProvider();
    case 'twilio':
      return new TwilioOtpProvider();
    default: {
      // Exhaustiveness — adding a new provider is a compile error here.
      const _exhaustive: never = env.OTP_PROVIDER;
      throw new Error(`Unknown OTP_PROVIDER: ${String(_exhaustive)}`);
    }
  }
}
