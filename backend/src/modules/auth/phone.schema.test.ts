import { describe, it, expect } from 'vitest';
import { phoneInputSchema } from './phone.schema.js';

/**
 * Phone validation tests. Per CLAUDE.md, auth validation is the one module
 * where silent regressions are genuinely costly — locks users out or lets
 * the wrong number through. These tests are deliberately exhaustive.
 *
 * A note on fixtures: libphonenumber-js does not reliably distinguish mobile
 * from landline for arbitrary North American numbers — North America has no
 * mobile-specific area codes, only ranges that *tend* to be mobile. So for
 * US tests we exercise length/format validity, not type classification.
 * For GB and IN, libphonenumber has clear FIXED_LINE vs MOBILE distinction.
 */

describe('phoneInputSchema — happy path', () => {
  it('accepts a real Indian mobile number and returns E.164', () => {
    const result = phoneInputSchema.parse({
      countryCode: 'IN',
      phoneNumber: '9876543210',
    });
    expect(result.e164).toBe('+919876543210');
  });

  it('accepts a US number of valid length and shape', () => {
    const result = phoneInputSchema.parse({
      countryCode: 'US',
      phoneNumber: '2025550184',
    });
    expect(result.e164).toMatch(/^\+1\d{10}$/);
  });

  it('accepts a GB mobile number', () => {
    const result = phoneInputSchema.parse({
      countryCode: 'GB',
      phoneNumber: '7400123456',
    });
    expect(result.e164).toMatch(/^\+447/);
  });
});

describe('phoneInputSchema — rejects landlines (where detectable)', () => {
  it('rejects an Indian landline', () => {
    // 11-prefix is a Delhi landline. libphonenumber classifies it as FIXED_LINE.
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '1123456789',
      }),
    ).toThrow(/Only mobile numbers/);
  });

  it('rejects a GB landline', () => {
    // 1212-prefix London landline; libphonenumber classifies as FIXED_LINE.
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'GB',
        phoneNumber: '1212345678',
      }),
    ).toThrow(/Only mobile numbers/);
  });

  it('accepts a US number (FIXED_LINE_OR_MOBILE — NANP has no mobile split)', () => {
    // +1 202 555 0184 is reported by libphonenumber as FIXED_LINE_OR_MOBILE.
    // North America has no mobile/landline area-code distinction, so we
    // accept these — the OTP step itself proves reachability. Strict
    // rejection would block US users entirely.
    const result = phoneInputSchema.parse({
      countryCode: 'US',
      phoneNumber: '2025550184',
    });
    expect(result.e164).toMatch(/^\+1\d{10}$/);
  });
});

describe('phoneInputSchema — rejects wrong country', () => {
  it('user picks US but types an Indian-shaped 10-digit number starting with 9', () => {
    // 9876543210 starts with 9 — the standard Indian mobile prefix. With US
    // as the chosen country, the library reports it as not a valid US national
    // number, and our schema rejects with "Invalid phone number for the
    // selected country."
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'US',
        phoneNumber: '9876543210',
      }),
    ).toThrow(/Invalid phone number/);
  });

  it('user picks GB but types a number starting with 9 (not a valid GB prefix)', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'GB',
        phoneNumber: '9876543210',
      }),
    ).toThrow(/Invalid phone number/);
  });

  it('user picks IN but types a number with an Indian mobile prefix in the wrong place', () => {
    // Indian mobile numbers start with 9, 8, 7, or 6. '5' is not a valid first digit.
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '5876543210',
      }),
    ).toThrow();
  });
});

describe('phoneInputSchema — rejects disallowed country', () => {
  it('rejects a country not in the allow-list', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'AU', // Australia — not in v1 allow-list
        phoneNumber: '412345678',
      }),
    ).toThrow(/Country not supported/);
  });

  it('rejects a malformed country code', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IND',
        phoneNumber: '9876543210',
      }),
    ).toThrow();
  });

  it('rejects a lowercase country code', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'in',
        phoneNumber: '9876543210',
      }),
    ).toThrow();
  });
});

describe('phoneInputSchema — rejects malformed input', () => {
  it('rejects empty phoneNumber', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '',
      }),
    ).toThrow();
  });

  it('rejects phoneNumber with letters', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '98765abcde',
      }),
    ).toThrow();
  });

  it('rejects phoneNumber with spaces', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '98765 43210',
      }),
    ).toThrow();
  });

  it('rejects phoneNumber with leading + (caller should send the country code separately)', () => {
    expect(() =>
      phoneInputSchema.parse({
        countryCode: 'IN',
        phoneNumber: '+919876543210',
      }),
    ).toThrow();
  });
});