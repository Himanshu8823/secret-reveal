import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { clearRefreshToken } from '../../src/utils/secureStorage';
import { router } from 'expo-router';

/**
 * Stub landing screen. Verify-OTP routes here on success so navigation is
 * not dead. Replace with the real app shell in a later session.
 */
export default function AppIndex() {
  const { session, signOut } = useAuth();

  const onSignOut = async () => {
    await clearRefreshToken();
    signOut();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Hello{session.user?.phone ? `, ${session.user.phone}` : ''}</Text>
        <Text style={styles.subtitle}>
          {session.isNewUser ? 'Welcome — your account was just created.' : 'Welcome back.'}
        </Text>
        <Pressable style={styles.button} onPress={onSignOut}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: 32 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { ...typography.button, color: '#fff' },
});
