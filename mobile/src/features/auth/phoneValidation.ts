import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from 'libphonenumber-js/min';

/**
 * Mobile-side phone validation.
 *
 * Why `metadata/min` (not `/max`):
 *  - `min` is ~80 kB raw, ~25-35 kB after minification on Hermes.
 *  - `max` is ~145 kB raw and would noticeably bloat the JS bundle.
 *  - `min` only checks length/format — no type detection (mobile vs landline).
 *  - That's fine: the **backend** is the source of truth for "is this a
 *    mobile number that can receive OTP?". Client-side validation is UX
 *    feedback only — show inline errors so the user fixes them before
 *    submitting, but never trust it for security (per CLAUDE.md).
 *
 * Why this mirrors the backend schema:
 *  - Same library, same allow-list. The user sees the same validation
 *    rules on both sides of the wire — no surprises.
 *  - Mobile errors here mean the backend would reject anyway. We save
 *    the round-trip.
 *
 * Why we accept FIXED_LINE_OR_MOBILE here too:
 *  - libphonenumber-js `metadata/min` doesn't report the type at all.
 *  - Even if it did, North American numbers are reported as
 *    FIXED_LINE_OR_MOBILE because NANP has no mobile split. Rejecting
 *    them would block US users.
 */

const ALLOWED_COUNTRIES: readonly CountryCode[] = ['IN', 'US', 'GB'] as const;

export type PhoneValidationResult =
  | { ok: true; e164: `+${string}` }
  | { ok: false; reason: string };

export function validatePhone(
  rawPhoneNumber: string,
  countryCode: string,
): PhoneValidationResult {
  // Mirror the backend's allow-list check first so the error message is
  // specific to "country not supported" rather than the generic
  // libphonenumber failure.
  if (!ALLOWED_COUNTRIES.includes(countryCode as CountryCode)) {
    return {
      ok: false,
      reason: `Country not supported. Allowed: ${ALLOWED_COUNTRIES.join(', ')}`,
    };
  }

  // Strip everything that isn't a digit. The picker gives us a clean
  // national number, but the user might paste with spaces or dashes.
  const digits = rawPhoneNumber.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 16) {
    return { ok: false, reason: 'Phone number is the wrong length' };
  }

  // `parsePhoneNumberFromString` returns null if the number can't be
  // parsed at all given the default country.
  const parsed = parsePhoneNumberFromString(digits, countryCode as CountryCode);
  if (!parsed) {
    return { ok: false, reason: 'Unparseable phone number' };
  }

  if (!isValidPhoneNumber(parsed.number as string)) {
    return { ok: false, reason: 'Invalid phone number for the selected country' };
  }

  // `metadata/min` returns a value here too. Same as backend:
  // accept MOBILE or FIXED_LINE_OR_MOBILE; reject FIXED_LINE / VOIP etc.
  const type = parsed.getType();
  if (type && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
    return { ok: false, reason: 'Only mobile numbers can receive OTP' };
  }

  return { ok: true, e164: parsed.number as `+${string}` };
}