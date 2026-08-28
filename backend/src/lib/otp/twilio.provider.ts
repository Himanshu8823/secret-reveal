import { randomInt } from 'node:crypto';

import type { OtpProvider } from './provider.js';

/**
 * Twilio OTP provider — PLACEHOLDER, not yet implemented.
 *
 * Two viable Twilio integration paths exist; the choice is deliberately
 * deferred to Phase 8 and will be made when we have actual SMS volume and
 * DLT registration sorted:
 *
 * 1. **Twilio Verify API** — higher-level; Twilio generates the OTP,
 *    stores it, and handles expiry/resend/rate-limit semantics for us.
 *    We'd just call `verification.create({ to, channel: 'sms' })` and
 *    `verification.check(...)` on the verify side. Less code, slightly
 *    higher per-message cost, India DLT compliance still applies for
 *    Indian destinations.
 *
 * 2. **Twilio Programmable Messaging** — lower-level; we generate the OTP
 *    ourselves (already implemented below), then send it via
 *    `client.messages.create({ from, to, body })` using a DLT-registered
 *    template. More moving parts (template registration, entity ID,
 *    sender registration in India) but full control over copy and cost.
 *
 * India DLT considerations (only relevant if we go Programmable Messaging
 * with Indian destination numbers):
 * - Indian telecom regulations require DLT (Distributed Ledger Tech)
 *   registration for all commercial SMS. We must register an Entity ID
 *   and a template ID with a DLT platform (Jio, Airtel, Vi, BSNL each
 *   maintain their own DLT portals — multi-DLT registration is required
 *   for cross-operator delivery).
 * - The template body sent via Twilio must exactly match the registered
 *   DLT template text, including the OTP placeholder syntax Twilio
 *   expects (e.g. `{#OTP#}` or the Twilio Verify default).
 *
 * Required env vars (to be added to the env zod schema when we wire this
 * provider up):
 * - `TWILIO_ACCOUNT_SID`       — Twilio account SID
 * - `TWILIO_AUTH_TOKEN`        — Twilio auth token (never logged)
 * - `TWILIO_VERIFY_SERVICE_SID` — only required if we take the Verify API
 *                                 path; omit for Programmable Messaging
 * - `DLT_ENTITY_ID`            — only required for Indian destinations on
 *                                 the Programmable Messaging path
 * - `DLT_TEMPLATE_ID`          — only required for Indian destinations on
 *                                 the Programmable Messaging path
 *
 * When ready, register this provider in `provider.ts`'s
 * `getOtpProvider()` switch — the exhaustiveness check will surface the
 * missing case as a compile error, which is the desired signal.
 */
export class TwilioOtpProvider implements OtpProvider {
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async sendOtp(_phone: string, _otp: string): Promise<void> {
    throw new Error(
      "TwilioOtpProvider is not yet implemented. Add the @twilio/sdk dependency and implement sendOtp() — see the Twilio Programmable Messaging or Verify API. When ready, register this provider in provider.ts's getOtpProvider() switch.",
    );
  }
}
