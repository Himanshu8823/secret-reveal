import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Welcome to NEXORA</Text>
            <Text style={styles.subtitle}>What should we call you?</Text>
          </View>

          <View style={styles.body}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              autoFocus
              value={name}
              onChangeText={setName}
              selectionColor={colors.primary}
              returnKeyType="done"
              onSubmitEditing={onContinue}
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                submitting && styles.primaryButtonDisabled,
              ]}
              onPress={onContinue}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Continue</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  headerWrap: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    ...typography.button,
    color: '#fff',
  },
});