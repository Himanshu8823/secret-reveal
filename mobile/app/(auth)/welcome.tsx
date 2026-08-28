import { useState } from 'react';
import {
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button, Input, Text } from '../../src/components/ui';
import { updateProfile } from '../../src/api/users.api';
import { useAuthStore } from '../../src/store/authStore';
import { setStoredUser } from '../../src/utils/secureStorage';

/**
 * First-run welcome screen. Reached after verify-otp only when the user
 * has no display name yet (see verify-otp.tsx). On submit we PATCH
 * /users/me and update both the in-memory session and the persisted
 * user blob so a cold-start sees the latest name.
 */
export default function WelcomeScreen() {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onContinue = async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      Alert.alert('Tell us your name', 'Type at least one character to continue.');
      return;
    }
    if (trimmed.length > 60) {
      Alert.alert('Too long', 'Names must be at most 60 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await updateProfile({ name: trimmed });
      // Mirror the server's user shape back into the session so subsequent
      // screens (and the persisted blob used by boot.ts) see the name.
      const session = useAuthStore.getState();
      if (session.accessToken && session.user) {
        useAuthStore.getState().setSession({
          accessToken: session.accessToken,
          user: { id: updated.id, phone: updated.phone, name: updated.name },
          isNewUser: false,
        });
      }
      await setStoredUser({
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
      });
      router.replace('/(app)');
    } catch (e) {
      Alert.alert(
        'Could not save name',
        e instanceof Error ? e.message : 'Try again',
      );
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
        <View className="flex-1 p-6 pt-12">
          <View className="pt-6 pb-2">
            <Text variant="h1">Welcome to NEXORA</Text>
            <Text variant="body" tone="secondary" className="mt-2">
              What should we call you?
            </Text>
          </View>

          <View className="flex-1 justify-center">
            <Input
              placeholder="Your name"
              maxLength={60}
              autoFocus
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              onSubmitEditing={onContinue}
              containerClassName="mb-5"
            />

            <Button
              label="Continue"
              variant="primary"
              size="lg"
              fullWidth
              loading={submitting}
              onPress={onContinue}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
