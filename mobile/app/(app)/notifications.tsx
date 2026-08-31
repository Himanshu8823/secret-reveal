import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState } from '../../src/components/EmptyState';
import { Fab } from '../../src/components/Fab';
import { Text } from '../../src/components/ui';
import { colors, radius } from '../../src/theme';
import { GroupRowSkeleton } from '../../src/components/skeleton/Skeleton';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { formatRelative } from '../../src/utils/formatRelative';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
} from '../../src/api/notifications.api';

/**
 * Notifications tab. Real data as of the notifications feature — invites,
 * reveals, comments, responses. Realtime updates arrive via
 * useRealtimeNotifications (mounted once in app/(app)/_layout.tsx), which
 * invalidates the ['notifications'] query on a live push; this screen just
 * renders whatever TanStack Query has.
 */
export default function NotificationsScreen() {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications({ limit: 30 }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
  });

  useRefreshOnFocus(['notifications']);

  const markReadMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const markAllReadMut = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const items = notificationsQuery.data?.notifications ?? [];
  const isInitialLoad = notificationsQuery.isLoading && !notificationsQuery.data;
  const hasUnread = items.some((n) => !n.read);

  const onPressItem = (item: NotificationItem) => {
    if (!item.read) markReadMut.mutate(item.id);
    if (item.postId) {
      router.push({ pathname: '/(app)/post/[id]', params: { id: item.postId } });
    } else if (item.groupId) {
      router.push({ pathname: '/(app)/group/[id]', params: { id: item.groupId } });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text variant="h1">Notifications</Text>
          <Text variant="meta" tone="secondary" className="mt-1">
            Invites, results, comments, reports.
          </Text>
        </View>
        {hasUnread ? (
          <Pressable
            onPress={() => markAllReadMut.mutate()}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications read"
            hitSlop={8}
          >
            <Text variant="bodyStrong" tone="link">
              Mark all read
            </Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={onPressItem} />}
        contentContainerClassName="px-4 pb-24 flex-grow"
        ListEmptyComponent={
          isInitialLoad ? (
            <View className="gap-2 pt-2">
              <GroupRowSkeleton />
              <GroupRowSkeleton />
              <GroupRowSkeleton />
            </View>
          ) : notificationsQuery.error ? (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                iconName="cloud-off-outline"
                title="Couldn't load notifications"
                subtitle="Pull down to refresh, or check your connection."
              />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center">
              <EmptyState
                iconName="bell-outline"
                title="No notifications yet"
                subtitle="Invites and result reveals will show up here."
              />
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={notificationsQuery.isFetching && !notificationsQuery.isLoading}
            onRefresh={() => notificationsQuery.refetch()}
            tintColor={colors.brand.primary}
          />
        }
      />

      <Fab onPress={() => router.push('/(app)/create')} accessibilityLabel="Create post" />
    </SafeAreaView>
  );
}

const ICON_BY_TYPE: Record<NotificationItem['type'], string> = {
  invite: 'account-multiple-plus-outline',
  invite_accepted: 'account-check-outline',
  reveal: 'timer-sand-complete',
  comment: 'comment-outline',
  response: 'message-reply-text-outline',
};

function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      className="flex-row items-start bg-surface border border-border rounded-lg p-4 mb-3 active:bg-surface-muted"
      style={{ borderRadius: radius.lg }}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: item.read ? colors.surface.muted : colors.brand.primarySubtle }}
      >
        <MaterialCommunityIcons
          name={ICON_BY_TYPE[item.type] as never}
          size={18}
          color={item.read ? colors.text.secondary : colors.brand.primary}
        />
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center justify-between mb-0.5">
          <Text variant="bodyStrong" numberOfLines={1} className="flex-1 mr-2">
            {item.title}
          </Text>
          <Text variant="meta" tone="secondary">
            {formatRelative(item.createdAt)}
          </Text>
        </View>
        <Text variant="meta" tone="secondary" numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.read ? (
        <View
          className="w-2 h-2 rounded-full ml-2 mt-1.5"
          style={{ backgroundColor: colors.brand.primary }}
        />
      ) : null}
    </Pressable>
  );
}
