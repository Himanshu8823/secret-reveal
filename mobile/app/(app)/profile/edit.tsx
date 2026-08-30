import { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Text, useDialog } from '../../../src/components/ui';
import { updateProfile } from '../../../src/api/users.api';
import { useAuthStore } from '../../../src/store/authStore';
import { setStoredUser } from '../../../src/utils/secureStorage';
import { colors, spacing } from '../../../src/theme';

const BIO_MAX = 160;
const NAME_MAX = 60;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/**
 * Edit Profile screen. Reached from /profile → Edit Profile. Hydrates
 * the form from the cached auth store user on mount, then PATCHes
 * /users/me on submit and mirrors the result back into the store +
 * secure storage so the next cold-start sees the latest values.
 *
 * Username field is locked (disabled) once the user has a username — the
 * backend enforces immutability but we surface that here too with a
 * helper line so the user understands why they can't change it.
 */
export default function EditProfileScreen() {
  const dialog = useDialog();
  const queryClient = useQueryClient();

  const sessionUser = useAuthStore((s) => s.user);
  const sessionAccessToken = useAuthStore((s) => s.accessToken);

  const [name, setName] = useState(sessionUser?.name ?? '');
  const [username, setUsername] = useState(sessionUser?.username ?? '');
  const [bio, setBio] = useState(sessionUser?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Username is immutable once set — show the helper, disable the input.
  const usernameLocked = !!sessionUser?.username;

  // Mirror the latest cached values into the form when the screen
  // re-mounts with a different user blob (cold nav, hot reload).
  useEffect(() => {
    if (!sessionUser) return;
    setName(sessionUser.name ?? '');
    setUsername(sessionUser.username ?? '');
    setBio(sessionUser.bio ?? '');
  }, [sessionUser?.id, sessionUser?.name, sessionUser?.username, sessionUser?.bio]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSave = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      dialog.show({
        variant: 'warning',
        title: 'Name is required',
        message: 'Tell us your display name.',
        actions: [{ label: 'OK' }],
      });
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      dialog.show({
        variant: 'warning',
        title: 'Too long',
        message: `Name must be at most ${NAME_MAX} characters.`,
        actions: [{ label: 'OK' }],
      });
      return;
    }

    if (!usernameLocked) {
      const u = username.trim();
      if (u.length === 0) {
        dialog.show({
          variant: 'warning',
          title: 'Pick a username',
          message: 'Usernames are 3-20 lowercase letters, digits, or underscores.',
          actions: [{ label: 'OK' }],
        });
        return;
      }
      if (!USERNAME_REGEX.test(u)) {
        dialog.show({
          variant: 'warning',
          title: 'Invalid username',
          message: 'Usernames are 3-20 lowercase letters, digits, or underscores.',
          actions: [{ label: 'OK' }],
        });
        return;
      }
    }

    if (bio.length > BIO_MAX) {
      dialog.show({
        variant: 'warning',
        title: 'Bio is too long',
        message: `Bio must be at most ${BIO_MAX} characters.`,
        actions: [{ label: 'OK' }],
      });
      return;
    }

    setSubmitting(true);
    try {
      // avatarUrl is no longer edited here — photo changes go through
      // the camera overlay on the Profile screen and use the dedicated
      // upload endpoint. PATCH /users/me from this screen only writes
      // the textual fields.
      const payload: Parameters<typeof updateProfile>[0] = {
        name: trimmedName,
        bio,
      };
      if (!usernameLocked) {
        payload.username = username.trim();
      }
      const updated = await updateProfile(payload);

      // Mirror the server's user shape back into the session so subsequent
      // screens (and the persisted blob used by boot.ts) see the latest
      // values — name, username, bio, avatarUrl.
      const currentSession = useAuthStore.getState();
      if (currentSession.accessToken && currentSession.user) {
        useAuthStore.getState().setSession({
          accessToken: sessionAccessToken ?? currentSession.accessToken,
          user: {
            id: updated.id,
            phone: updated.phone,
            name: updated.name,
            username: updated.username,
            avatarUrl: updated.avatarUrl,
            bio: updated.bio,
          },
          isNewUser: false,
        });
      }
      await setStoredUser({
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
        username: updated.username,
        avatarUrl: updated.avatarUrl,
        bio: updated.bio,
      });
      // Invalidate the cached profile + stats so the Profile tab refetches
      // and shows the freshly-saved values. Without this, the profile
      // screen keeps showing the stale cached data (placeholder bio even
      // when the user just set one).
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      // Explicit navigate back to the Profile tab. Use the bare `/profile`
      // path so expo-router auto-resolves it to profile/index.tsx — the
      // literal `/profile/index` form can throw "no route matched" when
      // there are sibling declarations (profile vs profile/index) and the
      // Tabs navigator decides which is the active leaf.
      router.replace('/(app)/profile');
    } catch (e) {
      const code = (e as { code?: string }).code;
      const message =
        code === 'VALIDATION_FAILED'
          ? e instanceof Error
            ? e.message
            : 'Validation failed'
          : e instanceof Error
            ? e.message
            : 'Could not save profile';
      dialog.show({
        variant: 'danger',
        title: 'Save failed',
        message,
        actions: [{ label: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onClose = () => {
    // Same explicit nav as Save — router.back() can land on Home if the
    // stack history is unexpected. Use `/profile` (not `/profile/index`)
    // to avoid the literal-path "no route matched" error that expo-router
    // throws when the same screen is registered under both folder and
    // literal-name declarations.
    router.replace('/(app)/profile');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — 56 px, close + save */}
        <View
          className="h-14 px-4 flex-row items-center justify-between border-b border-border"
          style={{ borderBottomWidth: 0.5 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close edit profile"
            className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
          >
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
          <Text variant="bodyStrong" tone="primary">
            Edit Profile
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 py-6 gap-5"
          keyboardShouldPersistTaps="handled"
        >
          <Input
            label="Name"
            placeholder="Your display name"
            maxLength={NAME_MAX}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <View>
            <Input
              label="Username"
              placeholder="username"
              maxLength={20}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!usernameLocked}
              helperText={
                usernameLocked
                  ? 'Username cannot be changed'
                  : '3-20 lowercase letters, digits, or underscores'
              }
              leftSlot={
                <Text variant="body" tone="secondary">
                  @
                </Text>
              }
            />
          </View>

          <View>
            <Text variant="bodyStrong" tone="primary" className="mb-3">
              Bio
            </Text>
            <View
              className="border border-border rounded-md bg-surface"
              style={{
                borderRadius: 12,
                paddingHorizontal: spacing[3],
                paddingTop: spacing[2],
                minHeight: 100,
              }}
            >
              <TextInput
                value={bio}
                onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
                placeholder="Tell people a bit about yourself"
                placeholderTextColor={colors.text.tertiary}
                multiline
                textAlignVertical="top"
                style={{
                  fontSize: 15,
                  lineHeight: 22,
                  minHeight: 60,
                  color: colors.text.primary,
                }}
              />
            </View>
            <View className="flex-row justify-between mt-1">
              <Text variant="caption" tone="secondary">
                Up to {BIO_MAX} characters
              </Text>
              <Text variant="caption" tone="secondary">
                {bio.length}/{BIO_MAX}
              </Text>
            </View>
          </View>

          {/* Avatar URL input removed — photo changes happen directly
              from the Profile screen via the camera overlay. Keeping a
              manual URL field here would invite copy-pasted S3 URLs
              from other users (security/privacy) and create two
              divergent code paths for the same thing. */}

          <Button
            label="Save"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={onSave}
            accessibilityLabel="Save profile"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
