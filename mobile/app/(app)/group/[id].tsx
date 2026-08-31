import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../src/theme';
import { Text } from '../../../src/components/ui';
import { Fab } from '../../../src/components/Fab';
import { EmptyState } from '../../../src/components/EmptyState';
import { Button, useDialog } from '../../../src/components/ui';
import { leaveGroup, getGroup } from '../../../src/api/groups.api';
import { listPosts } from '../../../src/api/posts.api';
import { PostCard } from '../../../src/components/PostCard';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PostCardSkeleton, Skeleton } from '../../../src/components/skeleton/Skeleton';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';

/**
 * Group detail screen. Header shows group name + member count; the list
 * below shows recent posts. The Posts API still returns an empty array
 * (Phase 3a lands the feed), so the empty state is the normal first-run
 * view.
 *
 * Header actions:
 *   - Back chevron (always)
 *   - "Leave" button (hidden if the caller is the creator)
 */
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';
  const queryClient = useQueryClient();
  const dialog = useDialog();

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => getGroup(groupId),
    enabled: Boolean(groupId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const postsQuery = useQuery({
    queryKey: ['group', groupId, 'posts'],
    queryFn: () => listPosts({ groupId }),
    enabled: Boolean(groupId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
  });

  useRefreshOnFocus(['group', groupId]);
  useRefreshOnFocus(['group', groupId, 'posts']);

  const leaveMut = useMutation({
    mutationFn: () => leaveGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      router.back();
    },
    onError: (e) => {
      dialog.show({
        variant: 'danger',
        title: 'Could not leave group',
        message: e instanceof Error ? e.message : 'Try again',
        actions: [{ label: 'OK' }],
      });
    },
  });

  const onLeavePress = () => {
    dialog.show({
      variant: 'warning',
      title: 'Leave this group?',
      message: 'You will stop seeing posts from this group.',
      cancelLabel: 'Cancel',
      actions: [
        {
          label: 'Leave',
          variant: 'danger',
          onPress: () => leaveMut.mutate(),
        },
      ],
    });
  };

  // Pull-to-refresh must only spin for a refresh the user actually
  // triggered — wiring RefreshControl directly to isFetching also spins
  // it for every silent focus-refetch (refetchOnWindowFocus +
  // useRefreshOnFocus fire whenever this screen regains focus).
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([groupQuery.refetch(), postsQuery.refetch()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [groupQuery, postsQuery]);

  const group = groupQuery.data;
  const posts = postsQuery.data?.posts ?? [];
  const isInitialLoad =
    (groupQuery.isLoading && !groupQuery.data) || (postsQuery.isLoading && !postsQuery.data);
  // The detail payload doesn't include the caller's id directly, so we
  // can't reliably tell if the viewer is the creator. The Leave button
  // is always shown; the backend rejects creator-leave with a clear 409
  // and the dialog surfaces the error. (Adding a `viewerIsCreator` flag
  // to the detail response would be a small follow-up.)

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center px-4 py-3 border-b border-border bg-surface">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          className="w-10 h-10 rounded-full items-center justify-center mr-1 active:bg-surface-muted"
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text.primary} />
        </Pressable>
        <View className="flex-1 min-w-0 ml-1">
          <Text variant="h2" numberOfLines={1}>
            {group?.name ?? 'Group'}
          </Text>
          <Text variant="meta" tone="secondary" className="mt-0.5">
            {group
              ? `${group.members.length} member${group.members.length === 1 ? '' : 's'} · ${(group as unknown as { postCount?: number }).postCount ?? posts.length} posts`
              : ' '}
          </Text>
        </View>
        {group ? (
          <Button
            label="Leave"
            variant="ghost"
            size="sm"
            fullWidth={false}
            loading={leaveMut.isPending}
            onPress={onLeavePress}
            accessibilityLabel="Leave group"
          />
        ) : null}
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => {
              // Phase 3c will land /(app)/post/[id]. Until then this navigates
              // to a route that doesn't exist yet — expo-router handles the
              // missing route gracefully (returns to home).
              router.push({ pathname: '/(app)/post/[id]', params: { id: item.id } });
            }}
          />
        )}
        contentContainerClassName="px-4 pt-4 pb-24 flex-grow"
        ListEmptyComponent={
          isInitialLoad ? (
            <View className="gap-3 pt-2">
              <PostCardSkeleton />
              <PostCardSkeleton />
            </View>
          ) : postsQuery.error ? (
            <EmptyState
              iconName="cloud-off-outline"
              title="Couldn't load discussions"
              subtitle="Pull down to refresh, or check your connection."
            />
          ) : (
            <EmptyState
              iconName="forum-outline"
              title="No discussions yet"
              subtitle="Tap + to start one"
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
          />
        }
      />

      <Fab
        onPress={() => {
          // Create-post entry point — for now reuses the existing Create tab.
          router.push('/(app)/create');
        }}
        accessibilityLabel="Start a discussion"
      />
    </SafeAreaView>
  );
}