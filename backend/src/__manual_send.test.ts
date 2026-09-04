import { it } from 'vitest';
import { getOtpProvider } from './lib/otp/provider.js';

// Temporary manual check — sends a REAL SMS. Deleted right after running.
it('sends a real OTP through the app own provider', async () => {
  const p = getOtpProvider();
  // eslint-disable-next-line no-console
  console.log('Provider in use :', p.constructor.name);
  await p.sendOtp('+917558213669');
  // eslint-disable-next-line no-console
  console.log('SMS SENT — check your phone');
}, 30_000);
