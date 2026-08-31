import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';

/**
 * Auth-stack guard. If a session is already live in memory (cold start
 * restored it via bootstrapAuth, or the user just verified an OTP), the
 * auth screens must not be reachable — otherwise a signed-in user who
 * lands here (deep link, a stray redirect, back-navigation) gets asked
 * to log in again even though their session is perfectly valid.
 */
export default function AuthLayout() {
  // Gate on the user, not the access token — an offline cold start has a
  // restored user with a null token and must still count as signed in.
  const user = useAuthStore((s) => s.user);

  if (user) {
    return <Redirect href="/(app)" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
