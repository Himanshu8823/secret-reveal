import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

/**
 * Root index — picks the right first route based on auth state.
 *   - not logged in  -> /login
 *   - logged in      -> /(app)
 *
 * The access token lives in-memory (zustand) and is gone on app restart,
 * so a cold start almost always lands on login. That's intentional for
 * this phase — refresh-token bootstrapping is out of scope.
 */
export default function RootIndex() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return accessToken ? <Redirect href="/(app)" /> : <Redirect href="/(auth)/login" />;
}
