import { useCallback } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, elevation, radius } from '../../../src/theme';
import { Text } from '../../../src/components/ui';
import { Fab } from '../../../src/components/Fab';
import { EmptyState } from '../../../src/components/EmptyState';
import { listGroupPosts, type PostSummary } from '../../../src/api/posts.api';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';

  const postsQuery = useQuery({
    queryKey: ['group', groupId, 'posts'],
    queryFn: () => listGroupPosts(groupId),
    enabled: Boolean(groupId),
  });

  const onRefresh = useCallback(() => {
    postsQuery.refetch();
  }, [postsQuery]);

  const posts = postsQuery.data?.posts ?? [];
  const isInitialLoad = postsQuery.isLoading && !postsQuery.data;

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
            {groupNamePlaceholder}
          </Text>
          <Text variant="meta" tone="secondary" className="mt-0.5">
            Member count
          </Text>
        </View>
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
          isInitialLoad ? null : postsQuery.error ? (
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
            refreshing={postsQuery.isFetching && !postsQuery.isLoading}
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

function PostCard({ post, onPress }: { post: PostSummary; onPress: () => void }) {
  const initials = authorInitials(post.authorName);
  const avatarColor = avatarColorFor(post.authorId);
  const statusBg =
    post.status === 'active'
      ? 'bg-pill-info'
      : post.status === 'revealed'
      ? 'bg-surface-muted'
      : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${post.authorName ?? 'unknown'}`}
      className="bg-surface rounded-lg p-4 mb-3 border border-border active:bg-surface-muted"
      style={{ borderRadius: radius.lg, ...elevation[1] }}
    >
      <View className="flex-row items-center mb-2.5">
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: avatarColor }}
        >
          <Text variant="metaStrong" tone="onDark">
            {initials}
          </Text>
        </View>
        <View className="flex-1 min-w-0 flex-row items-center justify-between">
          <Text variant="bodyStrong" numberOfLines={1} className="flex-1 mr-2">
            {post.authorName ?? 'Unknown author'}
          </Text>
          <View className={`px-2.5 py-1 rounded-sm ${statusBg}`}>
            <Text variant="caption" bold>
              {statusLabel(post.status)}
            </Text>
          </View>
        </View>
      </View>

      <Text variant="body" className="mb-3" numberOfLines={3}>
        {post.caption}
      </Text>

      <View className="flex-row items-center gap-4">
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="message-outline" size={16} color={colors.text.secondary} />
          <Text variant="meta" tone="secondary" className="ml-1.5">
            {post.commentCount}
          </Text>
        </View>
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="heart-outline" size={16} color={colors.text.secondary} />
          <Text variant="meta" tone="secondary" className="ml-1.5">
            {post.reactionCount}
          </Text>
        </View>
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="reply" size={16} color={colors.text.secondary} />
          <Text variant="meta" tone="secondary" className="ml-1.5">
            {post.responseCount}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/* ----- helpers (component-local; promote to shared utils only if reused) ----- */

const groupNamePlaceholder = 'Group';

function statusLabel(status: PostSummary['status']): string {
  if (status === 'active') return 'Active';
  if (status === 'revealed') return 'Revealed';
  return 'Deleted';
}

function authorInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
  return ((parts[0][0] ?? '?') + (parts[1][0] ?? '?')).toUpperCase();
}

function avatarColorFor(seed: string): string {
  const palette = ['#0B49FA', '#7A4DFF', '#22C7B7', '#FFB020', '#FF3D7F'];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length];
}