import { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { listMyGroups } from '../../src/api/groups.api';
import { GroupRow } from '../../src/components/GroupRow';
import { Fab } from '../../src/components/Fab';
import { EmptyState } from '../../src/components/EmptyState';
import { colors } from '../../src/theme/colors';

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Your groups</Text>
        <Text style={styles.subtitle}>
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
        contentContainerStyle={styles.list}
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
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    flexGrow: 1,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
