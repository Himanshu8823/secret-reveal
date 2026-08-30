import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { Fab } from '../../../src/components/Fab';
import { AvatarWithCamera } from '../../../src/components/AvatarWithCamera';
import { getMe, getMyStats } from '../../../src/api/users.api';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';
import { useAvatarUpload } from '../../../src/features/profile/useAvatarUpload';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';
import { clearRefreshToken } from '../../../src/utils/secureStorage';
import { useAuthStore } from '../../../src/store/authStore';
import { colors } from '../../../src/theme';

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

  const onChangeAvatar = () => {
    pickAndUpload({
      source: 'gallery',
      onError: (msg) =>
        dialog.show({
          variant: 'danger',
          title: 'Could not update photo',
          message: msg,
          actions: [{ label: 'OK' }],
        }),
    });
  };

  const onSignOut = async () => {
    await clearRefreshToken();
    signOut();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32"
        showsVerticalScrollIndicator={false}
      >
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
            <Text
              variant="caption"
              tone="secondary"
              className="mt-1 text-center"
            >
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

        {/* Stats row */}
        <View className="flex-row px-4 gap-3 mt-2">
          <View className="flex-1 bg-surface-muted rounded-lg p-4">
            <Text variant="h2" tone="primary" className="text-center">
              {statsQuery.data?.posts ?? 0}
            </Text>
            <Text variant="caption" tone="secondary" className="text-center mt-1">
              Posts
            </Text>
          </View>
          <View className="flex-1 bg-surface-muted rounded-lg p-4">
            <Text variant="h2" tone="primary" className="text-center">
              {statsQuery.data?.activeGroups ?? 0}
            </Text>
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
          <View className="flex-row items-center mt-3">
            <MaterialCommunityIcons
              name="calendar"
              size={14}
              color={colors.text.tertiary}
            />
            <Text variant="caption" tone="tertiary" className="ml-1.5">
              Joined{' '}
              {new Date((user as unknown as { createdAt?: string })?.createdAt ?? Date.now()).toLocaleString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Sign out — sits below the scrollable content area, separated
            by a top divider so the destructive action is visually distinct. */}
        <View className="px-4 mt-10 pt-6 border-t border-border">
          <Button
            label="Sign out"
            variant="danger"
            size="lg"
            onPress={onSignOut}
          />
        </View>
      </ScrollView>

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}
