import { Pressable, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Pill } from './ui';
import { elevation, radius, colors } from '../theme';
import { avatarColorFor } from '../utils/avatarColor';
import type { PostSummary } from '../api/posts.api';

/**
 * Single post card used by the home feed.
 *
 * Layout:
 *   - Author row (avatar + name + group name + relative timestamp)
 *   - Caption (1-2 lines)
 *   - Optional media thumbnail (first image)
 *   - Footer: timer pill, reaction count, comment count, response count
 *
 * Tapping the whole card fires `onPress(post)`. The card never assumes
 * a router path — the consumer passes the navigation callback. This
 * keeps PostCard reusable across the home feed, the groups detail page,
 * and the dedicated /feed route.
 */

const AVATAR_SIZE = 36;

type Props = {
  post: PostSummary;
  onPress?: (post: PostSummary) => void;
};

export function PostCard({ post, onPress }: Props) {
  const initials = authorInitials(post.author.name);
  const avatarColor = avatarColorFor(post.author.id);
  const firstImageMedia = post.media.find((m) => m.mimeType.startsWith('image/'));

  return (
    <Pressable
      onPress={onPress ? () => onPress(post) : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Open post: ${post.caption.slice(0, 50)}`}
      className="bg-surface rounded-lg p-4 mb-3 border border-border active:bg-surface-muted"
      style={{
        borderRadius: radius.lg,
        ...elevation[1],
      }}
    >
      {/* Author + group + time */}
      <View className="flex-row items-center mb-3">
        <View
          className="items-center justify-center mr-3"
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: 9999,
            backgroundColor: avatarColor,
          }}
        >
          <Text variant="metaStrong" tone="primary">
            {initials}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text variant="bodyStrong" numberOfLines={1}>
            {post.author.name ?? 'Someone'}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <Ionicons
              name="people-outline"
              size={12}
              color={colors.text.secondary}
            />
            <Text variant="meta" tone="secondary" numberOfLines={1} className="flex-shrink">
              {post.groupName}
            </Text>
            <Text variant="meta" tone="tertiary">·</Text>
            <Text variant="meta" tone="secondary" numberOfLines={1}>
              {formatRelative(post.createdAt)}
            </Text>
          </View>
        </View>
        {post.hasReplied ? (
          <Pill label="You replied" tone="info" />
        ) : null}
      </View>

      {/* Caption */}
      <Text variant="body" className="mb-3" numberOfLines={3}>
        {post.caption}
      </Text>

      {/* First image (if any) */}
      {firstImageMedia ? (
        <Image
          source={{ uri: firstImageMedia.url }}
          className="w-full aspect-[16/9] rounded-md mb-3"
          resizeMode="cover"
        />
      ) : null}

      {/* Timer badge + counts */}
      <View className="flex-row items-center justify-between mt-1">
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          {post.status === 'active' && post.discussionMeta ? (
            <TimerBadge endsAt={post.discussionMeta.revealEndsAt} />
          ) : (
            <Pill label="Revealed" tone="success" />
          )}
        </View>

        <View className="flex-row items-center gap-4">
          <CountChip
            icon="heart-outline"
            label={`${post.reactionCount}`}
          />
          <CountChip
            icon="chatbubble-outline"
            label={`${post.responseCount}`}
          />
          <CountChip
            icon="chatbox-outline"
            label={`${post.commentCount}`}
          />
        </View>
      </View>
    </Pressable>
  );
}

function TimerBadge({ endsAt }: { endsAt: string }) {
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  const text = remainingMs <= 0 ? 'Ready to reveal' : formatRemaining(remainingMs);
  return (
    <Pill
      label={text}
      tone={remainingMs <= 0 ? 'success' : 'warning'}
      withDot
    />
  );
}

function CountChip({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}) {
  return (
    <View className="flex-row items-center">
      <Ionicons name={icon} size={16} color={colors.text.secondary} />
      <Text variant="meta" tone="secondary" className="ml-1.5">
        {label}
      </Text>
    </View>
  );
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin === 0 ? `${hours}h` : `${hours}h ${remMin}m`;
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  return `${wk}w`;
}

function authorInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return (
    (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '?')
  ).toUpperCase();
}

