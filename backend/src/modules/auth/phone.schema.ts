import { z } from 'zod';
import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  type CountryCode,
} from 'libphonenumber-js/max';

/**
 * Phone validation, shared by request-otp and verify-otp endpoints.
 *
 * Why libphonenumber-js and not a regex:
 *  - Regex like `/^\+[1-9]\d{6,14}$/` accepts numbers that don't actually
 *    exist for a given country (e.g. +91 00000 00000 is "valid E.164" by the
 *    regex but no one owns it).
 *  - The library knows country-specific mobile-vs-landline ranges, so we can
 *    reject landlines up front — only mobile numbers receive OTP.
 *  - Same library on backend (metadata.max) and mobile (metadata.min). Same
 *    rules on both sides of the wire, no duplication.
 *
 * Why metadata.max on backend and metadata.min on mobile:
 *  - Backend is the source of truth — it must do the strongest validation.
 *  - Mobile uses metadata.min to keep the Hermes bundle ~25-35 kB smaller.
 *  - `min` only checks length/format; type detection (mobile vs landline) is
 *    a backend responsibility. Mobile validation is UX feedback only; never
 *    trust it for security (per CLAUDE.md).
 *
 * Allow-list: we lock down to a known-good set for v1. Tighten as we expand.
 */

const ALLOWED_COUNTRIES: readonly CountryCode[] = ['IN', 'US', 'GB'] as const;

const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'ISO-3166-1 alpha-2 expected')
  .refine((c) => (ALLOWED_COUNTRIES as readonly string[]).includes(c), {
    message: `Country not supported. Allowed: ${ALLOWED_COUNTRIES.join(', ')}`,
  });

const phoneNumberSchema = z
  .string()
  .min(4)
  .max(16)
  .regex(/^[0-9]+$/, 'Digits only, no spaces or dashes');

/**
 * Raw { countryCode, phoneNumber } shape — exposed so consumers can build
 * schemas on top of it (e.g. request-otp, verify-otp, future profile update).
 * Using `.shape` on the transformed schema doesn't work because zod hides
 * the inner shape once a transform is applied.
 */
export const phoneRawShapeSchema = z.object({
  countryCode: countryCodeSchema,
  phoneNumber: phoneNumberSchema,
});

export const phoneInputSchema = phoneRawShapeSchema
  .transform(({ countryCode, phoneNumber }) => {
    const parsed = parsePhoneNumberFromString(phoneNumber, countryCode as CountryCode);
    if (!parsed) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['phoneNumber'],
          message: 'Unparseable phone number',
        },
      ]);
    }
    if (!isValidPhoneNumber(parsed.number as string)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['phoneNumber'],
          message: 'Invalid phone number for the selected country',
        },
      ]);
    }
    if (parsed.country !== countryCode) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['phoneNumber'],
          message: `Number does not match country ${countryCode}`,
        },
      ]);
    }
    const type = parsed.getType();
    if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['phoneNumber'],
          message: 'Only mobile numbers can receive OTP',
        },
      ]);
    }
    return { e164: parsed.number as `+${string}` };
  });

export type PhoneInput = z.infer<typeof phoneInputSchema>;
export type PhoneRawInput = z.input<typeof phoneInputSchema>;