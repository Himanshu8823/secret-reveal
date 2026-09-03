import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useRealtimeNotifications } from '../../src/hooks/useRealtimeNotifications';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { getUnreadNotificationCount } from '../../src/api/notifications.api';
import { getMe } from '../../src/api/users.api';
import { setStoredUser } from '../../src/utils/secureStorage';

/**
 * App shell tab nav — Phase 3. Four tabs:
 *   Home / Groups / Notifications / Profile
 *
 * The Create flow is no longer a tab — it's reached via the floating "+"
 * button on the bottom-left of the menu (rendered by Home's Fab). Create
 * routes still live under /(app)/create/* for routing purposes, but they
 * are hidden from the tab bar.
 *
 * The two notification hooks are mounted here (not per-screen) because
 * this layout is the root of the authenticated shell — one socket
 * connection and one push-registration flow for the whole session.
 */
export default function AppLayout() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useRealtimeNotifications();
  usePushRegistration();

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => getUnreadNotificationCount(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Don't fire authenticated requests once the session is gone —
    // otherwise sign-out leaves a 401-ing query running behind the
    // redirect below.
    enabled: Boolean(accessToken),
  });
  useRefreshOnFocus(['notifications', 'unread-count']);
  const unreadCount = unreadQuery.data?.count ?? 0;

  // Cached-onboarding revalidation query — declared unconditionally
  // (rules of hooks) even though it's only meaningful once `user` exists
  // and looks incomplete; `enabled` gates whether it actually fires.
  const cachedNeedsOnboarding =
    !user || !user.name || user.name.trim() === '' || !user.username || user.username.trim() === '';

  const revalidateQuery = useQuery({
    queryKey: ['users', 'me', 'onboarding-revalidate'],
    queryFn: getMe,
    enabled: Boolean(user) && cachedNeedsOnboarding && Boolean(accessToken),
    staleTime: 0,
    retry: false,
  });

  // Guard the authenticated shell on the USER, not the access token: a
  // cold start with no network restores the user from secure storage with
  // a null token on purpose (see boot.ts). Gating on the token would bounce
  // that perfectly valid session straight back to login.
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  // A brand-new user's session is set (setSession in useAuth.ts) the
  // instant OTP verification succeeds — before verify-otp.tsx's own
  // `router.replace('/(auth)/welcome')` runs. Because that setSession call
  // makes (auth)/_layout.tsx's own guard (`if (user) redirect to /(app)`)
  // true first, its redirect wins the race and lands here with no name/
  // username set, and welcome.tsx never mounts. This is the same
  // "needsName" check verify-otp.tsx uses — duplicated here as a backstop
  // so onboarding can't be skipped no matter which navigation wins the
  // race, or which screen (deep link, cold start) is the entry point.
  //
  // Known failure mode this guards against: the in-memory `user` here can
  // come from the OFFLINE cold-start fallback (boot.ts restores a cached
  // SecureStore blob when /auth/refresh can't be reached). That cached
  // blob is a hand-mirrored copy of the server's user row, written by
  // welcome.tsx/link-phone.tsx on submit — if that on-device write was
  // ever interrupted (app killed mid-write, an earlier test run, etc.) it
  // can go stale and read as "still needs onboarding" even though the
  // server-side profile is actually complete. Cheap self-correction: only
  // when we DO have a live access token (i.e. this isn't the genuinely
  // offline case) and the cached user looks incomplete, do one GET
  // /users/me round-trip before trusting that verdict — a live network
  // was available, so this resolves the false positive in one request
  // instead of stranding the user on the welcome screen.
  if (cachedNeedsOnboarding && accessToken) {
    if (revalidateQuery.isLoading) {
      // Brief wait for the one-shot revalidation before committing to a
      // redirect — avoids a visible welcome-screen flash for a stale cache.
      return null;
    }
    if (revalidateQuery.data) {
      const server = revalidateQuery.data;
      const serverNeedsOnboarding =
        !server.name || server.name.trim() === '' || !server.username || server.username.trim() === '';
      if (!serverNeedsOnboarding) {
        // The server disagrees with the stale cache — it's the source of
        // truth. Repair the local copies so this doesn't recur, and fall
        // through to render the app shell below instead of redirecting.
        const freshUser = {
          id: server.id,
          phone: server.phone,
          name: server.name,
          username: server.username,
          avatarUrl: server.avatarUrl,
          bio: server.bio,
        };
        useAuthStore.getState().setSession({
          accessToken,
          user: freshUser,
          isNewUser: false,
        });
        setStoredUser(freshUser).catch(() => undefined);
      } else {
        return <Redirect href="/(auth)/welcome" />;
      }
    } else if (revalidateQuery.isError) {
      // Revalidation failed (network blip, 401, etc.) — fall back to the
      // cached verdict rather than blocking forever.
      return <Redirect href="/(auth)/welcome" />;
    }
  } else if (cachedNeedsOnboarding) {
    // No access token — this is the genuinely-offline cold start. Nothing
    // to revalidate against; trust the cache as before.
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface.bg,
          borderTopColor: colors.border.DEFAULT,
          height: 64,
          paddingTop: spacing[1] + 2,
          paddingBottom: spacing[2],
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      {/*
        expo-router auto-registers every file/folder inside (app)/ as a
        Tabs.Screen. The 4 above are the actual menu. The rest are nested
        routes (modal stacks, detail screens) that must be reachable via
        router.push but MUST NOT appear in the bottom tab bar.

        Without `href: null` they leak into the bar as ghost tabs — the
        user sees "index", "create", "group/[id]", "post/[id]" as extra
        options, which is exactly what we're hiding.
      */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="group/[id]" options={{ href: null }} />
      <Tabs.Screen name="post/[id]" options={{ href: null }} />
      {/* NOTE: profile/edit is NOT declared here — it lives inside
          app/(app)/profile/_layout.tsx Stack (index + edit). Declaring it
          here duplicates the route and throws "[Layout children]: Too many
          screens defined. Route profile/edit is extraneous". */}
    </Tabs>
  );
}
