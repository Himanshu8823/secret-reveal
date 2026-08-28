import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Text } from '../../src/components/ui';

/**
 * Phase 2 placeholder. Phase 6 wires real notifications (invites, results
 * available, comments, reports). FAB is part of the menu shell.
 */
export default function NotificationsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 py-3">
        <Text variant="h1">Notifications</Text>
        <Text variant="meta" tone="secondary" className="mt-1">
          Invites, results, comments, reports.
        </Text>
      </View>
      <View className="flex-1 items-center justify-center">
        <EmptyState
          iconName="bell-outline"
          title="No notifications yet"
          subtitle="Invites and result reveals will show up here."
        />
      </View>
      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}
