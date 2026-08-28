import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EmptyState } from '../../src/components/EmptyState';
import { Button, Text } from '../../src/components/ui';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { clearRefreshToken } from '../../src/utils/secureStorage';

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
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="px-4 py-3">
        <Text variant="h1">Profile</Text>
        <Text variant="meta" tone="secondary" className="mt-1">
          {session.user?.phone ? `Signed in as +${session.user.phone}` : 'Signed in'}
        </Text>
      </View>
      <View className="flex-1 items-center justify-center">
        <EmptyState
          iconName="person-circle-outline"
          title="Your profile"
          subtitle="Stats, edit details, and settings arrive in Phase 6."
        />
      </View>
      <View className="px-4 pb-4">
        <Button label="Sign out" variant="secondary" size="lg" onPress={onSignOut} />
      </View>
    </SafeAreaView>
  );
}
