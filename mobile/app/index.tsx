import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { bootstrapAuth, type AuthBootState } from '../src/features/auth/boot';
import { OfflineScreen } from '../src/components/OfflineScreen';
import { Pill } from '../src/components/Pill';

/**
 * Root index — runs the cold-start bootstrap state machine.
 *
 *   loading         -> render a brief splash view (Pill dev-only variant below)
 *   authenticated   -> Redirect to /(app) — we already have a fresh access token
 *   unauthenticated -> Redirect to /(auth)/login
 *   offline         -> render OfflineScreen with retry
 *
 * Closing the app and reopening must NOT log the user out — bootstrapAuth
 * reads the refresh token from expo-secure-store and calls /auth/refresh
 * to mint a fresh access token. If the refresh succeeds, the user lands
 * in (app) directly.
 */
export default function RootIndex() {
  const [boot, setBoot] = useState<AuthBootState>({ state: 'loading' });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    bootstrapAuth().then(setBoot);
  }, []);

  const retry = () => {
    setRetrying(true);
    bootstrapAuth().then((s) => {
      setBoot(s);
      setRetrying(false);
    });
  };

  // TEMP (Phase 0.1 sanity check): render the NativeWind Pill in dev so we can
  // visually confirm Tailwind compiles. Removed once Home screen exists.
  if (
      process.env.NODE_ENV !== 'production'
      && process.env.EXPO_PUBLIC_SHOW_TOKEN_SANITY === '1'
    ) {
      return (
        <View className="flex-1 items-center justify-center bg-background p-6 gap-3">
          <Pill label="Hidden Discussion" tone="info" />
          <Pill label="Accepted" tone="success" />
          <Pill label="Pending" tone="warning" />
          <Pill label="Rejected" tone="danger" />
          <Pill label="Neutral" tone="neutral" />
        </View>
      );
    }

  switch (boot.state) {
    case 'loading':
      return null; // Brief blank moment — boot is sub-second on warm network.
    case 'authenticated': {
      // Check the user, not the access token: an offline cold start
      // deliberately restores the session with a null token (see boot.ts),
      // and gating on the token here would send it back to login.
      const user = useAuthStore.getState().user;
      return user ? <Redirect href="/(app)" /> : <Redirect href="/(auth)/login" />;
    }
    case 'unauthenticated':
      return <Redirect href="/(auth)/login" />;
    case 'offline':
      return (
        <OfflineScreen
          onRetry={retry}
          retrying={retrying}
          errorMessage={
            boot.error instanceof Error ? boot.error.message : undefined
          }
        />
      );
  }
}