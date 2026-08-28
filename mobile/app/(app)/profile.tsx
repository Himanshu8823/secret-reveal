import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EmptyState } from '../../src/components/EmptyState';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { clearRefreshToken } from '../../src/utils/secureStorage';
import { colors } from '../../src/theme/colors';

/**
 * Phase 2 placeholder. Phase 6 wires real profile (stats, edit, settings).
 * Sign-out stays accessible here because verify-otp's original entry point
 * lived in the stub Home; with Home now showing real content, this is the
 * cleanest place to put it until the real Profile lands.
 */
export default function ProfileScreen() {
  const { session, signOut } = useAuth();

  const onSignOut = async () => {
    await clearRefreshToken();
    signOut();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {session.user?.phone ? `Signed in as +${session.user.phone}` : 'Signed in'}
        </Text>
      </View>
      <View style={styles.body}>
        <EmptyState
          iconName="person-circle-outline"
          title="Your profile"
          subtitle="Stats, edit details, and settings arrive in Phase 6."
        />
      </View>
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
          onPress={onSignOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 4,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 16, paddingBottom: 16 },
  signOut: {
    backgroundColor: '#F5F6F8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutPressed: { opacity: 0.7 },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
