import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Text } from '../../src/components/ui';

/**
 * Groups tab — Phase 2 placeholder. Home already shows the user's groups;
 * this tab will become an "all groups / discover / search" surface in a
 * later phase. For now it mirrors Home's intent: "no separate groups list
 * yet, but the tab exists so the navigation isn't broken."
 *
 * The FAB is global to the menu shell, not per-screen — it lives here too
 * so the create action stays reachable from any tab.
 */
export default function GroupsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 py-3">
        <Text variant="h1">Groups</Text>
        <Text variant="meta" tone="secondary" className="mt-1">
          Your groups are on the Home tab.
        </Text>
      </View>
      <View className="flex-1 items-center justify-center">
        <EmptyState
          iconName="people-outline"
          title="Discover is coming soon"
          subtitle="Browse public and shared groups from this tab in a future release."
        />
      </View>
      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}
