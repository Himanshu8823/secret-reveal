import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';

/**
 * Auth-stack guard. If a session is already live in memory (cold start
 * restored it via bootstrapAuth, or the user just verified an OTP), the
 * auth screens must not be reachable — otherwise a signed-in user who
 * lands here (deep link, a stray redirect, back-navigation) gets asked
 * to log in again even though their session is perfectly valid.
 *
 * Race with verify-otp.tsx / phone-link.tsx: confirmOtp()/finalizeSession()
 * call setSession (making `user` non-null) BEFORE those screens' own
 * `router.replace(...)` runs. That store update re-renders this layout
 * immediately, so without the checks below this guard would win the race
 * and redirect to /(app) even when the user still needs the welcome
 * screen — bypassing onboarding and, worse, leaving (app)/_layout.tsx's
 * own onboarding redirect fighting this one every render (visible as a
 * repeating GET /users/me and a blank/white screen).
 *
 * Fix: only redirect to /(app) once onboarding is actually satisfied, and
 * never redirect away from the welcome/phone-link screens themselves —
 * those must stay reachable even though `user` is already set.
 */
export default function AuthLayout() {
  // Gate on the user, not the access token — an offline cold start has a
  // restored user with a null token and must still count as signed in.
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();

  const needsOnboarding =
    !user || !user.name || user.name.trim() === '' || !user.username || user.username.trim() === '';

  const onOnboardingScreen = pathname === '/welcome' || pathname === '/phone-link';

  if (user && !needsOnboarding) {
    return <Redirect href="/(app)" />;
  }

  if (user && needsOnboarding && !onOnboardingScreen) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
