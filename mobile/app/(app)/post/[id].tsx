import { useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../src/theme';
import { Text } from '../../../src/components/ui';
import {
  getPost,
  submitResponse,
  type PostDetail,
  type PostMediaItem,
} from '../../../src/api/posts.api';

/**
 * Screen 9 — Hidden Discussion.
 *
 * Dark gradient background (faked with three stacked views to avoid
 * adding a new dependency — `expo-linear-gradient` and
 * `react-native-linear-gradient` are not installed). The three layers
 * fade from a deeper top to a slightly lighter mid to a deeper bottom.
 *
 * Behaviour (Phase 4 v1):
 *  - Fetches `GET /posts/:id` on mount.
 *  - Shows a live countdown computed from `discussionMeta.revealEndsAt`.
 *  - The "submit your response" composer POSTs to `/posts/:id/responses`.
 *    The GET responses endpoint returns 403 while the post is `active`
 *    (unless the viewer is the author), so we don't fetch responses here
 *    yet — that lands in a follow-up phase.
 */

const AVATAR_SIZE = 36;

// Gradient stops for the hero background. Kept as named constants so the
// screen has no inline hex literals.
const HERO_TOP = '#0B1228';
const HERO_MID = '#13193A';
const HERO_BOTTOM = '#1A2151';
const HERO_OVERLAY = 'rgba(255,255,255,0.06)';
const HERO_OVERLAY_STRONG = 'rgba(255,255,255,0.16)';
const HERO_ICON_MUTED = '#B6B9BF';
const HERO_BORDER = 'rgba(255,255,255,0.12)';
const HERO_ERROR = '#FCA5A5';

export default function HiddenDiscussionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
    enabled: Boolean(postId),
  });

  const [draft, setDraft] = useState('');
  const [now, setNow] = useState<number>(() => Date.now());

  // Countdown tick — for v1 we just re-render every second. Phase 4
  // replaces this with the shared `useCountdown` hook.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const countdownText = useMemo(
    () => formatCountdown(postQuery.data, now),
    [postQuery.data, now],
  );

  const submitMutation = useMutation({
    mutationFn: (body: string) => submitResponse(postId, { body }),
    onSuccess: () => {
      setDraft('');
      // Invalidate the post so responseCount stays fresh when the
      // author view lands in a follow-up phase.
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const isInitialLoad = postQuery.isLoading && !postQuery.data;
  const post = postQuery.data;

  return (
    <View className="flex-1">
      {/* Fake gradient — three stacked views, no new deps. */}
      <View
        className="absolute left-0 right-0"
        style={{ top: 0, height: '40%', backgroundColor: HERO_TOP }}
        pointerEvents="none"
      />
      <View
        className="absolute left-0 right-0"
        style={{ top: '30%', height: '40%', backgroundColor: HERO_MID, opacity: 0.85 }}
        pointerEvents="none"
      />
      <View
        className="absolute left-0 right-0"
        style={{ bottom: 0, height: '40%', backgroundColor: HERO_BOTTOM, opacity: 0.7 }}
        pointerEvents="none"
      />

      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-6 pt-4 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {/* Top bar */}
            <View className="flex-row items-start justify-between gap-3 mb-6">
              <View className="flex-1 min-w-0">
                <View
                  className="self-start px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: HERO_OVERLAY_STRONG }}
                >
                  <Text variant="caption" bold tone="onDark" numberOfLines={1}>
                    Hidden Discussion
                  </Text>
                </View>
                <Text variant="meta" tone="tertiary" className="mt-2 leading-[18px]" numberOfLines={2}>
                  Responses are hidden until the timer ends
                </Text>
              </View>
              <View
                className="px-3 py-1.5 rounded-full"
                style={{ backgroundColor: HERO_OVERLAY_STRONG }}
              >
                <Text
                  variant="metaStrong"
                  tone="onDark"
                  numberOfLines={1}
                  style={{
                    fontVariant: ['tabular-nums'],
                    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
                  }}
                >
                  {countdownText}
                </Text>
              </View>
            </View>

            {isInitialLoad ? (
              <View className="py-12 items-center">
                <ActivityIndicator color={colors.text.onDark} />
              </View>
            ) : postQuery.error ? (
              <View className="py-8 items-center">
                <Text variant="body" tone="onDark" className="mb-3">
                  Couldn't load this discussion.
                </Text>
                <Pressable
                  onPress={() => postQuery.refetch()}
                  className="px-4 py-2 rounded-md active:opacity-80"
                  style={{ backgroundColor: HERO_OVERLAY_STRONG }}
                >
                  <Text variant="bodyStrong" tone="onDark">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : post ? (
              <PostBody post={post} />
            ) : null}

            <View
              className="pt-4"
              style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HERO_BORDER }}
            >
              <View className="mb-3">
                <Text variant="title" tone="onDark">
                  Submit your response
                </Text>
              </View>

              <View
                className="rounded-md p-3"
                style={{ backgroundColor: HERO_OVERLAY }}
              >
                <View
                  className="rounded-md px-3 py-2 mb-3"
                  style={{ backgroundColor: HERO_OVERLAY }}
                >
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a comment…"
                    placeholderTextColor={colors.text.tertiary}
                    className="text-text-onDark min-h-[36px] max-h-[120px] p-0"
                    multiline
                    editable={!submitMutation.isPending}
                    accessibilityLabel="Your response"
                  />
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-4">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach image"
                      className="w-8 h-8 items-center justify-center active:opacity-70"
                      // Phase 5 wires the actual picker.
                    >
                      <MaterialCommunityIcons name="image-outline" size={20} color={HERO_ICON_MUTED} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach video"
                      className="w-8 h-8 items-center justify-center active:opacity-70"
                    >
                      <MaterialCommunityIcons name="video-outline" size={20} color={HERO_ICON_MUTED} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach audio"
                      className="w-8 h-8 items-center justify-center active:opacity-70"
                    >
                      <MaterialCommunityIcons name="music-note-outline" size={20} color={HERO_ICON_MUTED} />
                    </Pressable>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send response"
                    onPress={() => {
                      const trimmed = draft.trim();
                      if (!trimmed) return;
                      submitMutation.mutate(trimmed);
                    }}
                    disabled={submitMutation.isPending || draft.trim().length === 0}
                    className={`w-10 h-10 rounded-full items-center justify-center ${
                      submitMutation.isPending || draft.trim().length === 0 ? 'opacity-50' : 'active:opacity-90'
                    }`}
                    style={{ backgroundColor: colors.brand.primary }}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator color={colors.text.onDark} size="small" />
                    ) : (
                      <MaterialCommunityIcons name="send" size={18} color={colors.text.onDark} />
                    )}
                  </Pressable>
                </View>

                {submitMutation.isError ? (
                  <Text variant="meta" className="mt-2" style={{ color: HERO_ERROR }}>
                    Couldn't send your response. Try again.
                  </Text>
                ) : null}
              </View>
            </View>

            <Text variant="caption" tone="tertiary" className="text-center mt-6">
              Other responses are hidden
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PostBody({ post }: { post: PostDetail }) {
  const initials = authorInitials(post.authorName);
  const avatarColor = avatarColorFor(post.authorId);
  const firstMedia = post.media?.[0];

  return (
    <>
      {/* Author card */}
      <View className="flex-row items-center mb-4">
        <View
          className="items-center justify-center mr-3"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: 9999, backgroundColor: avatarColor }}
        >
          <Text variant="metaStrong" tone="onDark">
            {initials}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text variant="bodyStrong" tone="onDark" numberOfLines={1}>
            {post.authorName ?? 'Unknown author'}
          </Text>
          <Text variant="meta" tone="tertiary" className="mt-0.5">
            {formatRelativeTime(post.createdAt)}
          </Text>
        </View>
      </View>

      {/* Question */}
      <Text variant="h2" tone="onDark" className="mb-4">
        {post.caption}
      </Text>

      {/* Media (single full-width preview, 16:9) */}
      {firstMedia ? <MediaPreview item={firstMedia} /> : null}
    </>
  );
}

function MediaPreview({ item }: { item: PostMediaItem }) {
  const isImage = item.kind === 'image';
  return (
    <Pressable
      // Phase 5 wires the Media Viewer route. Tap is intentionally inert
      // for now — the route doesn't exist yet.
      accessibilityRole="image"
      accessibilityLabel="Attached media"
      className="w-full aspect-[16/9] rounded-lg overflow-hidden mb-6 active:opacity-80"
      style={{ backgroundColor: HERO_BOTTOM }}
    >
      {isImage ? (
        <Image source={{ uri: item.url }} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: HERO_BOTTOM }}>
          <MaterialCommunityIcons
            name={item.kind === 'video' ? 'play-circle-outline' : 'music-circle-outline'}
            size={36}
            color={colors.text.onDark}
          />
        </View>
      )}
    </Pressable>
  );
}

/* ----- helpers (component-local) ----- */

function formatCountdown(post: PostDetail | undefined, now: number): string {
  if (!post || !post.discussionMeta?.revealEndsAt) {
    return '00:00:00';
  }
  const endsAt = new Date(post.discussionMeta.revealEndsAt).getTime();
  const remainingMs = Math.max(0, endsAt - now);
  if (remainingMs === 0) return '00:00:00';

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return '';
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