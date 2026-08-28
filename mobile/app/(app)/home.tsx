import { useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { listMyGroups } from '../../src/api/groups.api';
import { GroupRow } from '../../src/components/GroupRow';
import { Fab } from '../../src/components/Fab';
import { EmptyState } from '../../src/components/EmptyState';
import { Text } from '../../src/components/ui';
import { colors } from '../../src/theme';

export default function HomeScreen() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['groups', 'mine'],
    queryFn: () => listMyGroups(),
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const groups = data?.groups ?? [];
  const nextCursor = data?.nextCursor ?? null;
  const isInitialLoad = isLoading && !data;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 py-3">
        <Text variant="h1">Your groups</Text>
        <Text variant="meta" tone="secondary" className="mt-1">
          {isInitialLoad
            ? 'Loading…'
            : groups.length === 0
            ? 'No groups yet'
            : `${groups.length} group${groups.length === 1 ? '' : 's'} · latest activity first`}
        </Text>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            onPress={() => {
              // Phase 2.4 wires /group/[id]; placeholder for now.
              router.push({ pathname: '/(app)/home', params: { id: item.id } });
            }}
          />
        )}
        contentContainerClassName="px-4 pb-24 flex-grow"
        ListEmptyComponent={
          isInitialLoad ? null : error ? (
            <EmptyState
              iconName="cloud-off-outline"
              title="Couldn't load your groups"
              subtitle="Pull down to refresh, or check your connection."
            />
          ) : (
            <EmptyState
              iconName="account-group-outline"
              title="No groups yet"
              subtitle="Start a discussion — tap +"
            />
          )
        }
        ListFooterComponent={
          nextCursor ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
          />
        }
      />

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}
