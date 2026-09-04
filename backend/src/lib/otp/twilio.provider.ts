import twilio, { type Twilio } from 'twilio';

import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../AppError.js';
import { logger } from '../logger.js';
import { maskPhone } from '../phone.js';
import type { OtpCheckResult, OtpProvider } from './provider.js';

/**
 * Twilio Verify (v2) OTP provider.
 *
 * Verify owns the code end-to-end: Twilio generates it, delivers it, expires
 * it after ~10 minutes, caps check attempts, and validates it. We never see
 * or store the code — which is why this provider has no `generateOtp` and
 * why the auth service keeps nothing in Redis on this path.
 *
 * Why Verify rather than Programmable Messaging: for Indian destinations
 * Verify carries Twilio's own DLT registration, so we don't have to register
 * an Entity ID / template per operator ourselves. It costs more per check;
 * that trade was made deliberately.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID.
 * All three are required whenever OTP_PROVIDER=twilio — enforced at boot in
 * config/env.ts so a misconfigured deploy fails loudly instead of at the
 * first login attempt.
 */

// Verify deletes a verification once it expires (~10 min), is approved, or
// hits the max check attempts. A check against any of those returns 404 —
// all of which mean the same thing to us: no live code, ask for a new one.
const NOT_FOUND = 20404;
// "Max check attempts reached" (429). Same user-facing outcome as expiry:
// the verification is spent, request a fresh one.
const MAX_CHECK_ATTEMPTS = 60202;
// "Max send attempts reached" (429) — too many sends without completing a
// check. Surfaced as a rate-limit so the client shows a retry hint.
const MAX_SEND_ATTEMPTS = 60203;

type TwilioRestError = { status?: number; code?: number; message?: string };

function asTwilioError(err: unknown): TwilioRestError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as TwilioRestError;
  return typeof e.code === 'number' || typeof e.status === 'number' ? e : null;
}

export class TwilioOtpProvider implements OtpProvider {
  // Lazily constructed and reused: the client holds an HTTP agent, so
  // building one per request would leak sockets under load.
  private static client: Twilio | null = null;

  private get client(): Twilio {
    if (!TwilioOtpProvider.client) {
      TwilioOtpProvider.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    }
    return TwilioOtpProvider.client;
  }

  private get verifyService() {
    return this.client.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID!);
  }

  async sendOtp(phone: string): Promise<void> {
    try {
      const verification = await this.verifyService.verifications.create({
        to: phone,
        channel: 'sms',
      });
      // 'pending' is the only success state for a send. Anything else means
      // Twilio accepted the call but isn't going to deliver a usable code,
      // so treat it as a failure rather than reporting success to the user.
      if (verification.status !== 'pending') {
        logger.error(
          { phone: maskPhone(phone), status: verification.status },
          'twilio verify returned an unexpected send status',
        );
        throw new AppError(502, ErrorCode.INTERNAL, 'Could not send OTP, try again');
      }
      logger.info({ phone: maskPhone(phone), provider: 'twilio' }, 'OTP dispatched');
    } catch (err) {
      if (err instanceof AppError) throw err;
      const e = asTwilioError(err);

      if (e?.code === MAX_SEND_ATTEMPTS) {
        throw new AppError(
          429,
          ErrorCode.RATE_LIMITED,
          'Too many OTP requests for this number. Try again in a few minutes.',
        );
      }

      // Never log the Twilio message verbatim at error level with the phone
      // attached — mask, and keep the code for triage.
      logger.error(
        { phone: maskPhone(phone), twilioCode: e?.code, twilioStatus: e?.status },
        'twilio verify send failed',
      );
      throw new AppError(502, ErrorCode.INTERNAL, 'Could not send OTP, try again');
    }
  }

  async checkOtp(phone: string, code: string): Promise<OtpCheckResult> {
    try {
      const check = await this.verifyService.verificationChecks.create({ to: phone, code });

      // Per the Verify docs the status is one of: pending, approved,
      // canceled, max_attempts_reached, deleted, failed, expired.
      switch (check.status) {
        case 'approved':
          return 'approved';
        case 'pending':
          // Verification is still live but this code was wrong — the user
          // can retry until Twilio's own attempt cap or our rate limiter.
          return 'incorrect';
        default:
          // canceled / max_attempts_reached / deleted / failed / expired —
          // the verification is spent, a new one must be requested.
          return 'expired';
      }
    } catch (err) {
      const e = asTwilioError(err);

      // Twilio deletes the verification on expiry, approval, or max attempts,
      // and a check against a deleted verification 404s. Max-check-attempts
      // can also surface as an explicit 429. Both mean "no live code".
      if (e?.code === NOT_FOUND || e?.status === 404 || e?.code === MAX_CHECK_ATTEMPTS) {
        return 'expired';
      }

      logger.error(
        { phone: maskPhone(phone), twilioCode: e?.code, twilioStatus: e?.status },
        'twilio verify check failed',
      );
      throw new AppError(502, ErrorCode.INTERNAL, 'Could not verify OTP, try again');
    }
  }
}
