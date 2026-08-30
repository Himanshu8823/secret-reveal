import { useState } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Input, Text, useDialog } from '../../src/components/ui';
import { updateProfile } from '../../src/api/users.api';
import { useAuthStore } from '../../src/store/authStore';
import { setStoredUser } from '../../src/utils/secureStorage';
import { colors, spacing } from '../../src/theme';

const NAME_MAX = 60;
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const BIO_MAX = 160;

/**
 * First-run welcome screen. Reached after verify-otp only when the user
 * has no display name OR no username yet (see verify-otp.tsx). On submit
 * we PATCH /users/me with both name and username, then mirror the
 * server's user shape back into the in-memory session AND the persisted
 * user blob so a cold-start sees the latest values.
 */
export default function WelcomeScreen() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialog = useDialog();

  const onContinue = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      dialog.show({
        variant: 'warning',
        title: 'Tell us your name',
        message: 'Type at least one character to continue.',
        actions: [{ label: 'OK' }],
      });
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      dialog.show({
        variant: 'warning',
        title: 'Too long',
        message: `Names must be at most ${NAME_MAX} characters.`,
        actions: [{ label: 'OK' }],
      });
      return;
    }
    const trimmedUsername = username.trim();
    if (!USERNAME_REGEX.test(trimmedUsername)) {
      dialog.show({
        variant: 'warning',
        title: 'Pick a username',
        message: 'Usernames are 3-20 lowercase letters, digits, or underscores.',
        actions: [{ label: 'OK' }],
      });
      return;
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
      const updated = await updateProfile({
        name: trimmedName,
        username: trimmedUsername,
        bio: bio.length > 0 ? bio : undefined,
      });
      // Mirror the server's user shape back into the session so subsequent
      // screens (and the persisted blob used by boot.ts) see the values.
      const session = useAuthStore.getState();
      if (session.accessToken && session.user) {
        useAuthStore.getState().setSession({
          accessToken: session.accessToken,
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
      router.replace('/(app)');
    } catch (e) {
      dialog.show({
        variant: 'danger',
        title: 'Could not save profile',
        message: e instanceof Error ? e.message : 'Try again',
        actions: [{ label: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-6 pt-12 pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="pt-6 pb-2">
            <Text variant="h1">Welcome to NEXORA</Text>
            <Text variant="body" tone="secondary" className="mt-2">
              What should we call you?
            </Text>
          </View>

          <View className="mt-6">
            <Input
              label="Name *"
              placeholder="Your name"
              maxLength={NAME_MAX}
              autoFocus
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              containerClassName="mb-5"
              autoCapitalize="words"
            />

            <Input
              label="Username *"
              placeholder="username"
              maxLength={20}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              helperText="3-20 lowercase letters, digits, or underscores"
              returnKeyType="next"
              containerClassName="mb-5"
              leftSlot={
                <Text variant="body" tone="secondary">
                  @
                </Text>
              }
            />

            <View className="mb-5">
              <Text variant="bodyStrong" tone="primary" className="mb-3">
                About Me
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
                  placeholder="Tell people a bit about yourself (optional)"
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

            <Button
              label="Continue"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              onPress={onContinue}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
