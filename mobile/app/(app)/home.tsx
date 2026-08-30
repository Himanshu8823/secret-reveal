import { useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { listMyGroups } from '../../src/api/groups.api';
import { listPosts } from '../../src/api/posts.api';
import { GroupRow } from '../../src/components/GroupRow';
import { PostCard } from '../../src/components/PostCard';
import { Fab } from '../../src/components/Fab';
import { EmptyState } from '../../src/components/EmptyState';
import { Text } from '../../src/components/ui';
import { colors } from '../../src/theme';

/**
 * Home screen — Phase 3a.
 *
 * Two sections, vertically stacked:
 *   1. "Recent discussions" — recent posts from every group the caller
 *      is a member of, sorted by createdAt DESC. Capped at 10 for the
 *      preview; the dedicated `/feed` route (Phase 3a follow-up) handles
 *      pagination.
 *   2. "Your groups" — same list as before Phase 3.
 *
 * The footer FAB (Create) stays global. Tapping a card routes to the
 * post detail screen.
 */
export default function HomeScreen() {
  const groupsQuery = useQuery({
    queryKey: ['groups', 'mine'],
    queryFn: () => listMyGroups(),
  });

  const feedQuery = useQuery({
    queryKey: ['posts', 'feed'],
    queryFn: () => listPosts({ limit: 10 }),
    // Poll every 60s while the feed is mounted so posts from other
    // group members land within a minute without needing a WebSocket.
    // The interval pauses automatically when the query is unmounted
    // (user navigates away) and resumes on remount. Paired with
    // refetchOnWindowFocus via the root layout, this gives both
    // "background → foreground" instant refresh and a continuous
    // gentle tick while the user is actively browsing.
    refetchInterval: 60_000,
  });

  const onRefresh = useCallback(() => {
    groupsQuery.refetch();
    feedQuery.refetch();
  }, [groupsQuery, feedQuery]);

  const isInitialGroupsLoad = groupsQuery.isLoading && !groupsQuery.data;
  const groups = groupsQuery.data?.groups ?? [];
  const posts = feedQuery.data?.posts ?? [];
  const isInitialFeedLoad = feedQuery.isLoading && !feedQuery.data;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            onPress={() => {
              router.push({ pathname: '/(app)/group/[id]', params: { id: item.id } });
            }}
          />
        )}
        contentContainerClassName="px-4 pb-24 flex-grow"
        ListHeaderComponent={
          <View>
            <View className="pt-3 pb-2">
              <Text variant="h1">Home</Text>
            </View>

            {/* Recent discussions feed */}
            <View className="pt-2 pb-3 flex-row items-center justify-between">
              <Text variant="h2">Recent discussions</Text>
              <Pressable
                onPress={() => {
                  // Phase 3a future: dedicated /feed route with full
                  // pagination. For now we just navigate to the home
                  // root — the inline section below is the feed.
                  router.push('/(app)/home');
                }}
                accessibilityRole="button"
                accessibilityLabel="See all discussions"
              >
                <Text variant="bodyStrong" tone="link">
                  See all
                </Text>
              </Pressable>
            </View>

            {isInitialFeedLoad ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={colors.brand.primary} />
              </View>
            ) : feedQuery.error ? (
              <View className="py-4">
                <Text variant="meta" tone="secondary">
                  Couldn't load discussions. Pull down to refresh.
                </Text>
              </View>
            ) : posts.length === 0 ? (
              <View className="py-6 mb-2 rounded-md border border-border bg-surface-muted">
                <Text variant="body" tone="secondary" className="text-center">
                  No discussions yet
                </Text>
                <Text
                  variant="caption"
                  tone="secondary"
                  className="text-center mt-1 px-4"
                >
                  Posts from your groups will appear here.
                </Text>
              </View>
            ) : (
              <View>
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onPress={(p) => router.push(`/(app)/post/${p.id}`)}
                  />
                ))}
              </View>
            )}

            {/* Your groups */}
            <View className="pt-2 pb-2 mt-2">
              <Text variant="h2">Your groups</Text>
              <Text variant="meta" tone="secondary" className="mt-1">
                {isInitialGroupsLoad
                  ? 'Loading…'
                  : groups.length === 0
                  ? 'No groups yet'
                  : `${groups.length} group${groups.length === 1 ? '' : 's'} · latest activity first`}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          isInitialGroupsLoad ? null : groupsQuery.error ? (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                iconName="cloud-off-outline"
                title="Couldn't load your groups"
                subtitle="Pull down to refresh, or check your connection."
              />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                iconName="account-group-outline"
                title="No groups yet"
                subtitle="Start a discussion — tap +"
              />
            </View>
          )
        }
        ListFooterComponent={
          groupsQuery.data?.nextCursor ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={groupsQuery.isFetching || feedQuery.isFetching}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
          />
        }
      />

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}
