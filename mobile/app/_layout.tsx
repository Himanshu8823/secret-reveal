import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { DialogProvider } from '../src/components/ui';
import { colors } from '../src/theme';

/**
 * Root stack. Wraps the tree in TanStack Query for server-cached data
 * (groups, posts, notifications). One client per app instance — created
 * lazily so React strict-mode double-render in dev doesn't mint two.
 *
 * AppState + focusManager wiring: when the app comes back to the
 * foreground (background → active), we tell React Query the app is
 * focused. Combined with `refetchOnWindowFocus: true`, every active
 * query whose data is older than `staleTime` refetches automatically.
 * Without this, RN never fires "focus" events and the cache goes stale
 * the moment the user backgrounds the app.
 *
 * onlineManager + NetInfo: tracks connectivity state and feeds it into
 * React Query. Combined with `refetchOnReconnect: true`, queries
 * automatically retry once the network is back. Default behavior
 * assumes "online" forever on RN — flaky mobile networks would
 * otherwise stay stuck in the error state until a manual refetch.
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            networkMode: 'offlineFirst',
          },
        },
      }),
  );

  // App foreground / background → React Query focus signal.
  useEffect(() => {
    function onAppStateChange(status: AppStateStatus) {
      // On web, React Query already wires focus to window events. On RN
      // we drive it from AppState: any time the app is "active", treat
      // it as focused; anything else means we shouldn't refetch on focus.
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
    }
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  // NetInfo → React Query online signal. NetInfo.isConnected drives
  // onlineManager so refetchOnReconnect kicks in when the network comes
  // back (e.g. user walked out of a dead zone).
  useEffect(() => {
    onlineManager.setEventListener((setOnline) => {
      return NetInfo.addEventListener((state) => {
        setOnline(!!state.isConnected);
      });
    });
    // onlineManager.setEventListener manages its own teardown via the
    // function returned from the listener callback — TanStack calls
    // it when a new listener is registered or on cleanup. We don't
    // need to track the unsubscribe ourselves.
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <DialogProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.surface.bg },
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </DialogProvider>
    </QueryClientProvider>
  );
}