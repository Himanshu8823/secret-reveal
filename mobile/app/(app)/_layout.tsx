import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { useRealtimeNotifications } from '../../src/hooks/useRealtimeNotifications';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { getUnreadNotificationCount } from '../../src/api/notifications.api';

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

  // Guard the authenticated shell on the USER, not the access token: a
  // cold start with no network restores the user from secure storage with
  // a null token on purpose (see boot.ts). Gating on the token would bounce
  // that perfectly valid session straight back to login.
  if (!user) {
    return <Redirect href="/(auth)/login" />;
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
      {/* Create-group route — same pattern as the post composer. */}
      <Tabs.Screen name="groups/new" options={{ href: null }} />
      {/* NOTE: profile/edit is NOT declared here — it lives inside
          app/(app)/profile/_layout.tsx Stack (index + edit). Declaring it
          here duplicates the route and throws "[Layout children]: Too many
          screens defined. Route profile/edit is extraneous". */}
    </Tabs>
  );
}
