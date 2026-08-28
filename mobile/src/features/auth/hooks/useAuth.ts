import { useCallback } from 'react';
import { requestOtp, verifyOtp } from '../../../api/auth.api';
import { setRefreshToken } from '../../../utils/secureStorage';
import { useAuthStore } from '../../../store/authStore';
import type { AuthUser } from '../types';

/**
 * Auth actions hook. Wraps the API calls + the side effects of a successful
 * verify (write refresh token to secure storage, hydrate the in-memory
 * session). Keeps screens thin — they only call actions and render state.
 *
 * Phone shape: { countryCode, phoneNumber }. Both APIs validate on the
 * backend; the client also runs the same validation via usePhoneValidation
 * to surface errors before the network round-trip.
 */

type RequestOtpInput = { countryCode: string; phoneNumber: string };
type VerifyOtpInput = RequestOtpInput & { otp: string };

export function useAuth() {
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);
  const session = useAuthStore((s) => ({
    accessToken: s.accessToken,
    user: s.user,
    isNewUser: s.isNewUser,
  }));

  const sendOtp = useCallback(async (input: RequestOtpInput) => {
    await requestOtp(input);
  }, []);

  const confirmOtp = useCallback(
    async (input: VerifyOtpInput) => {
      const result = await verifyOtp(input);
      // Refresh token is the only thing we persist (per CLAUDE.md).
      await setRefreshToken(result.refreshToken);
      const user: AuthUser = result.user;
      setSession({ accessToken: result.accessToken, user, isNewUser: result.isNewUser });
      return result;
    },
    [setSession],
  );

  return {
    session,
    sendOtp,
    confirmOtp,
    signOut: clear,
  };
}