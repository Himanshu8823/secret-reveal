import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.title} numberOfLines={1}>
            {groupNamePlaceholder}
          </Text>
          <Text style={styles.meta}>Member count</Text>
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
        contentContainerStyle={styles.list}
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
            tintColor={colors.primary}
          />
        }
      />

      <Pressable
        onPress={() => {
          // Create-post entry point — for now reuses the existing Create tab.
          router.push('/(app)/create');
        }}
        accessibilityRole="button"
        accessibilityLabel="Start a discussion"
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

function PostCard({ post, onPress }: { post: PostSummary; onPress: () => void }) {
  const initials = authorInitials(post.authorName);
  const avatarColor = avatarColorFor(post.authorId);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open post by ${post.authorName ?? 'unknown'}`}
    >
      <View style={styles.cardHead}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.cardHeadBody}>
          <Text style={styles.author} numberOfLines={1}>
            {post.authorName ?? 'Unknown author'}
          </Text>
          <View
            style={[
              styles.statusBadge,
              post.status === 'active' ? styles.statusBadgeActive : styles.statusBadgeRevealed,
            ]}
          >
            <Text style={styles.statusText}>{statusLabel(post.status)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.caption} numberOfLines={3}>
        {post.caption}
      </Text>

      <View style={styles.iconRow}>
        <View style={styles.iconItem}>
          <MaterialCommunityIcons name="message-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.iconText}>{post.commentCount}</Text>
        </View>
        <View style={styles.iconItem}>
          <MaterialCommunityIcons name="heart-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.iconText}>{post.reactionCount}</Text>
        </View>
        <View style={styles.iconItem}>
          <MaterialCommunityIcons name="reply" size={16} color={colors.textSecondary} />
          <Text style={styles.iconText}>{post.responseCount}</Text>
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

const AVATAR_SIZE = 36;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  backBtnPressed: {
    backgroundColor: '#F5F6F8',
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 96,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: '#F5F6F8',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cardHeadBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  author: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: '#E8EEFE',
  },
  statusBadgeRevealed: {
    backgroundColor: '#F5F6F8',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: '#0940D6',
  },
});