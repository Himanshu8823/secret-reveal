import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    OTP_PROVIDER: 'twilio',
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_VERIFY_SERVICE_SID: 'VAtest',
  },
}));

const verificationsCreate = vi.fn();
const verificationChecksCreate = vi.fn();
const servicesFn = vi.fn(() => ({
  verifications: { create: verificationsCreate },
  verificationChecks: { create: verificationChecksCreate },
}));

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ verify: { v2: { services: servicesFn } } })),
}));

import { TwilioOtpProvider } from './twilio.provider.js';
import { AppError } from '../AppError.js';

/** Shape of a Twilio REST error as the SDK throws it. */
const twilioError = (code: number, status: number) =>
  Object.assign(new Error(`twilio ${code}`), { code, status });

const provider = new TwilioOtpProvider();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendOtp', () => {
  it('sends over SMS to the E.164 number', async () => {
    verificationsCreate.mockResolvedValue({ status: 'pending' });

    await provider.sendOtp('+919999999999');

    expect(verificationsCreate).toHaveBeenCalledWith({ to: '+919999999999', channel: 'sms' });
    expect(servicesFn).toHaveBeenCalledWith('VAtest');
  });

  it('treats a non-pending send status as a failure, not a success', async () => {
    // Twilio accepted the call but no usable code will arrive — reporting
    // success here would leave the user waiting for an SMS forever.
    verificationsCreate.mockResolvedValue({ status: 'failed' });

    await expect(provider.sendOtp('+919999999999')).rejects.toMatchObject({
      status: 502,
    } satisfies Partial<AppError>);
  });

  it('maps max-send-attempts (60203) to RATE_LIMITED', async () => {
    verificationsCreate.mockRejectedValue(twilioError(60203, 429));

    await expect(provider.sendOtp('+919999999999')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    } satisfies Partial<AppError>);
  });

  it('maps any other Twilio failure to a 502 without leaking its message', async () => {
    verificationsCreate.mockRejectedValue(twilioError(60200, 400));

    await expect(provider.sendOtp('+919999999999')).rejects.toMatchObject({
      status: 502,
      message: 'Could not send OTP, try again',
    });
  });
});

describe('checkOtp', () => {
  it('returns approved on a correct code', async () => {
    verificationChecksCreate.mockResolvedValue({ status: 'approved' });

    await expect(provider.checkOtp('+919999999999', '123456')).resolves.toBe('approved');
    expect(verificationChecksCreate).toHaveBeenCalledWith({
      to: '+919999999999',
      code: '123456',
    });
  });

  it('returns incorrect while the verification is still pending', async () => {
    verificationChecksCreate.mockResolvedValue({ status: 'pending' });

    await expect(provider.checkOtp('+919999999999', '000000')).resolves.toBe('incorrect');
  });

  it.each(['canceled', 'max_attempts_reached', 'deleted', 'failed', 'expired'])(
    'returns expired for a spent verification (status=%s)',
    async (status) => {
      verificationChecksCreate.mockResolvedValue({ status });

      await expect(provider.checkOtp('+919999999999', '123456')).resolves.toBe('expired');
    },
  );

  it('treats a 404 as expired — Verify deletes the record once spent', async () => {
    // Twilio removes the verification on expiry/approval/max-attempts, so a
    // later check 404s rather than reporting a status.
    verificationChecksCreate.mockRejectedValue(twilioError(20404, 404));

    await expect(provider.checkOtp('+919999999999', '123456')).resolves.toBe('expired');
  });

  it('treats max-check-attempts (60202) as expired', async () => {
    verificationChecksCreate.mockRejectedValue(twilioError(60202, 429));

    await expect(provider.checkOtp('+919999999999', '123456')).resolves.toBe('expired');
  });

  it('throws 502 on an unexpected Twilio failure rather than failing open', async () => {
    verificationChecksCreate.mockRejectedValue(twilioError(20003, 401));

    await expect(provider.checkOtp('+919999999999', '123456')).rejects.toMatchObject({
      status: 502,
    } satisfies Partial<AppError>);
  });
});
