import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { Fab } from '../../../src/components/Fab';
import { AvatarWithCamera } from '../../../src/components/AvatarWithCamera';
import { AvatarSourceSheet } from '../../../src/components/AvatarSourceSheet';
import { getMe, getMyStats } from '../../../src/api/users.api';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';
import { useAvatarUpload } from '../../../src/features/profile/useAvatarUpload';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';
import { ProfileSkeleton, Skeleton } from '../../../src/components/skeleton/Skeleton';
import { getRefreshToken, clearAllAuthData } from '../../../src/utils/secureStorage';
import { useAuthStore } from '../../../src/store/authStore';
import { colors } from '../../../src/theme';
import { logout } from '../../../src/api/auth.api';
import { unregisterPushToken } from '../../../src/api/notifications.api';

/**
 * Profile screen. Single source of truth for the user's own profile —
 * pulls the full UserProfile + aggregate stats from the backend via
 * TanStack Query. Stats row shows two cards (Posts | Active Groups) —
 * Connections is deliberately omitted from this phase.
 *
 * Layout (top → bottom):
 *   1. Avatar (~110 px) — circular Image when avatarUrl is set, otherwise
 *      a MaterialCommunityIcons account-circle fallback on the muted
 *      surface token.
 *   2. Display name (h2, centered).
 *   3. Username (caption, secondary tone, "@{username}", centered).
 *   4. Edit Profile button → /(app)/profile/edit.
 *   5. Stats row (2 cards).
 *   6. About Me section — always renders; placeholder text when bio is
 *      empty so the section never disappears (matches the reference
 *      layout — permanent slot, not conditional).
 *   7. Sign out button at the bottom.
 */
export default function ProfileScreen() {
  const { signOut } = useAuth();
  const dialog = useDialog();
  const { pickAndUpload, busy: avatarBusy } = useAvatarUpload();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => getMe(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const statsQuery = useQuery({
    queryKey: ['users', 'me', 'stats'],
    queryFn: () => getMyStats(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Profile screen should always show fresh data when the tab regains
  // focus — name / bio / avatar / stats may have changed elsewhere.
  useRefreshOnFocus(['users', 'me']);
  useRefreshOnFocus(['users', 'me', 'stats']);

  // Edit screen hydrates from authStore instantly (sessionUser), while
  // profile was waiting only for getMe() → looked empty until network
  // returned. Use store as fallback so original cached name shows
  // immediately, then server data wins when it arrives.
  const storeUser = useAuthStore((s) => s.user);
  const user = profileQuery.data ?? storeUser ?? undefined;

  // Skeleton only on a true cold render — when there is nothing at all to
  // paint. The cached `storeUser` normally carries name/username/avatar, so
  // gating on `profileQuery.isLoading` alone would flash a skeleton over
  // content we can already show, which reads worse than a brief stale value.
  // Stats have no cached fallback, so they get their own check below.
  const showProfileSkeleton = !user && profileQuery.isLoading;
  const showStatsPlaceholder = !statsQuery.data && statsQuery.isLoading;

  // createdAt only exists on the server's UserProfile, never on the cached
  // authStore user. Parse defensively — an unparseable value must not
  // render "Invalid Date".
  const rawCreatedAt = (user as unknown as { createdAt?: string })?.createdAt;
  const parsedCreatedAt = rawCreatedAt ? new Date(rawCreatedAt) : null;
  const joinedAt =
    parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : null;

  const onUploadError = (msg: string) =>
    dialog.show({
      variant: 'danger',
      title: 'Could not update photo',
      message: msg,
      actions: [{ label: 'OK' }],
    });

  const [avatarSourceOpen, setAvatarSourceOpen] = useState(false);
  const onChangeAvatar = () => setAvatarSourceOpen(true);

  const onSignOut = async () => {
    // Revoke server-side before wiping local state — the refresh token is
    // only readable from secure storage until clearAllAuthData() runs.
    // Both calls are best-effort: logout() always 204s per its own doc
    // comment, and a push-token that was never registered (or a network
    // failure) must never block the user from getting signed out locally.
    const refreshToken = await getRefreshToken();
    await Promise.all([
      refreshToken ? logout({ refreshToken }).catch(() => undefined) : Promise.resolve(),
      unregisterPushToken().catch(() => undefined),
    ]);
    await clearAllAuthData();
    signOut();
    // Wipe every cached query — the QueryClient lives for the whole app
    // process (one instance created in app/_layout.tsx), so without this
    // the next user to sign in on this device sees the previous user's
    // cached posts/groups/profile render instantly (stale data from the
    // old cache) until each query's background refetch catches up. Query
    // keys here aren't scoped by user id, so this is the only thing that
    // actually isolates one session's data from the next.
    queryClient.clear();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        showsVerticalScrollIndicator={false}
      >
        {showProfileSkeleton ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* Avatar + identity */}
            <View className="items-center pt-8 pb-4">
              <AvatarWithCamera
                avatarUrl={user?.avatarUrl}
                size={110}
                cameraSize={36}
                busy={avatarBusy}
                onCameraPress={onChangeAvatar}
              />

              {user?.name?.trim() ? (
                <Text variant="h2" tone="primary" className="mt-4 text-center">
                  {user.name}
                </Text>
              ) : null}

              {user?.username ? (
                <Text variant="caption" tone="secondary" className="mt-1 text-center">
                  @{user.username}
                </Text>
              ) : null}

              <View className="mt-5">
                <Button
                  label="Edit Profile"
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={() => router.push('/(app)/profile/edit')}
                />
              </View>
            </View>

            {/* Stats row. While the counts are still loading we show a bar in
            place of the number rather than `0` — a real-looking zero that
            then jumps to another value reads as a bug, an obvious
            placeholder does not. The labels stay put so only the numeral
            swaps. */}
            <View className="flex-row px-4 gap-3 mt-2">
              <View className="flex-1 bg-surface-muted rounded-lg p-4">
                {showStatsPlaceholder ? (
                  <View className="items-center" style={{ height: 28, justifyContent: 'center' }}>
                    <Skeleton width={40} height={22} />
                  </View>
                ) : (
                  <Text variant="h2" tone="primary" className="text-center">
                    {statsQuery.data?.posts ?? 0}
                  </Text>
                )}
                <Text variant="caption" tone="secondary" className="text-center mt-1">
                  Posts
                </Text>
              </View>
              <View className="flex-1 bg-surface-muted rounded-lg p-4">
                {showStatsPlaceholder ? (
                  <View className="items-center" style={{ height: 28, justifyContent: 'center' }}>
                    <Skeleton width={40} height={22} />
                  </View>
                ) : (
                  <Text variant="h2" tone="primary" className="text-center">
                    {statsQuery.data?.activeGroups ?? 0}
                  </Text>
                )}
                <Text variant="caption" tone="secondary" className="text-center mt-1">
                  Active Groups
                </Text>
              </View>
            </View>

            {/* About Me section — always renders. Empty bio shows a soft
            placeholder so the section never disappears (matches the
            reference layout — it's a permanent slot, not conditional).
            The "Joined" line below it is also unconditional — every
            profile has a join date, so hiding it when bio is empty was
            wrong. */}
            <View className="px-4 mt-6">
              <Text variant="bodyStrong" tone="primary" className="mb-2">
                About Me
              </Text>
              <Text
                variant="body"
                tone={user?.bio && user.bio.trim().length > 0 ? 'secondary' : 'tertiary'}
              >
                {user?.bio && user.bio.trim().length > 0
                  ? user.bio
                  : 'Tell people a bit about yourself — tap Edit Profile to add a bio.'}
              </Text>
              {/* Joined date. Only the server's UserProfile carries createdAt —
              the cached authStore user does not, and defaulting to
              Date.now() printed today's date as though it were the real
              join date. Show a placeholder bar until the value exists. */}
              <View className="flex-row items-center mt-3">
                <MaterialCommunityIcons name="calendar" size={14} color={colors.text.tertiary} />
                {joinedAt ? (
                  <Text variant="caption" tone="tertiary" className="ml-1.5">
                    Joined{' '}
                    {joinedAt.toLocaleString('en-US', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                ) : (
                  <View className="ml-1.5">
                    <Skeleton width={128} height={16} />
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        {/* Sign out — sits below the scrollable content area, separated
            by a top divider so the destructive action is visually distinct. */}
        <View className="px-4 mt-10 pt-6 border-t border-border">
          <Button label="Sign out" variant="danger" size="lg" onPress={onSignOut} />
        </View>
      </ScrollView>

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />

      <AvatarSourceSheet
        visible={avatarSourceOpen}
        onClose={() => setAvatarSourceOpen(false)}
        onTakePhoto={() => pickAndUpload({ source: 'camera', onError: onUploadError })}
        onChooseFromLibrary={() => pickAndUpload({ source: 'gallery', onError: onUploadError })}
      />
    </SafeAreaView>
  );
}
