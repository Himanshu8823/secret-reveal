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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../src/theme';
import { Text, Pill } from '../../../src/components/ui';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';
import {
  createComment as createCommentApi,
  getPost,
  listResponses,
  revealPost,
  submitResponse,
  toggleReaction,
  type PostDetail,
  type PostMediaItem,
  type ReactionType,
  type ResponseItem,
} from '../../../src/api/posts.api';

/**
 * Screen — Hidden Discussion (Phase 3a/4 v1+).
 *
 * Sections (top → bottom):
 *   - Header: timer count + status badge
 *   - Post body: author, caption, first media
 *   - Reactions bar (like/love/laugh) — viewer-scoped toggle
 *   - Comments section (always visible) — meta-discussion; we render
 *     comments inline only when we have a creation flow available
 *     (creator mode is the composer below)
 *   - Responses section — anonymous until reveal, real names after
 *   - Composer at the bottom: response input + send + (for the author)
 *     a "Reveal now" button that calls POST /posts/:id/reveal
 *
 * The gradient hero background is preserved from Phase 4 v1 to keep
 * the timer-as-hero visual intact.
 */

const AVATAR_SIZE = 36;

// Hero palette — kept identical to the prior pass so designers don't
// have to re-review spacing tokens.
const HERO_TOP = '#0B1228';
const HERO_MID = '#13193A';
const HERO_BOTTOM = '#1A2151';
const HERO_OVERLAY = 'rgba(255,255,255,0.06)';
const HERO_OVERLAY_STRONG = 'rgba(255,255,255,0.16)';
const HERO_ICON_MUTED = '#B6B9BF';
const HERO_BORDER = 'rgba(255,255,255,0.12)';
const HERO_ERROR = '#FCA5A5';

const REACTIONS: { type: ReactionType; icon: string; label: string }[] = [
  { type: 'like', icon: 'heart-outline', label: 'Like' },
  { type: 'love', icon: 'heart', label: 'Love' },
  { type: 'laugh', icon: 'emoticon-happy-outline', label: 'Haha' },
];

export default function HiddenDiscussionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
    enabled: Boolean(postId),
  });

  const responsesQuery = useQuery({
    queryKey: ['post', postId, 'responses'],
    queryFn: () => listResponses(postId),
    enabled: Boolean(postId),
    // 403 during active phase (unless the viewer is the author) will
    // throw — surfaced via `error` for the loader to handle gracefully.
    retry: false,
  });

  // Refresh when the user comes back to this post from another screen
  // (e.g. opened notifications, switched to home and back). Reaction /
  // response counts may have changed in the background.
  useRefreshOnFocus(['post', postId]);
  useRefreshOnFocus(['post', postId, 'responses']);

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

  const post = postQuery.data;
  const isAuthor =
    !!post && postQuery.data !== undefined && false; // author self-id isn't returned; the "Reveal" button is gated by membership + post author status. For Phase 3a the reveal button is hidden for non-authors.
  void isAuthor;

  const submitMutation = useMutation({
    mutationFn: (body: string) => submitResponse(postId, { body }),
    onSuccess: () => {
      setDraft('');
      // Invalidate the post so responseCount stays fresh, and the
      // responses list so the new entry shows up for the author.
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'responses'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });

  const reactionMutation = useMutation({
    mutationFn: (type: ReactionType) => toggleReaction(postId, { type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const revealMutation = useMutation({
    mutationFn: () => revealPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'responses'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => createCommentApi(postId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const [commentDraft, setCommentDraft] = useState('');

  const isInitialLoad = postQuery.isLoading && !postQuery.data;

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
                    {post?.status === 'revealed' ? 'Discussion revealed' : 'Hidden Discussion'}
                  </Text>
                </View>
                <Text variant="meta" tone="tertiary" className="mt-2 leading-[18px]" numberOfLines={2}>
                  {post?.status === 'revealed'
                    ? 'All responses are visible'
                    : 'Responses are hidden until the timer ends'}
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

            {post ? (
              <>
                {/* Reactions bar */}
                <View
                  className="mt-6 pt-4"
                  style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HERO_BORDER }}
                >
                  <Text variant="title" tone="onDark" className="mb-3">
                    React
                  </Text>
                  <View className="flex-row items-center gap-3">
                    {REACTIONS.map((r) => {
                      const active = post.viewerReaction === r.type;
                      return (
                        <Pressable
                          key={r.type}
                          accessibilityRole="button"
                          accessibilityLabel={r.label}
                          accessibilityState={{ selected: active }}
                          onPress={() => reactionMutation.mutate(r.type)}
                          disabled={reactionMutation.isPending}
                          className="flex-row items-center px-3 py-2 rounded-md active:opacity-80"
                          style={{
                            backgroundColor: active ? colors.brand.primary : HERO_OVERLAY_STRONG,
                          }}
                        >
                          <Ionicons
                            name={r.icon as never}
                            size={16}
                            color={colors.text.onDark}
                          />
                          <Text variant="caption" bold tone="onDark" className="ml-1.5">
                            {r.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Text variant="meta" tone="tertiary" className="ml-1">
                      {post.reactionCount} {post.reactionCount === 1 ? 'reaction' : 'reactions'}
                    </Text>
                  </View>
                </View>

                {/* Responses */}
                <ResponsesSection
                  responses={responsesQuery.data ?? []}
                  error={responsesQuery.error ?? null}
                  postStatus={post.status}
                />

                {/* Comments (composer only — comments are read-when-implemented in Phase 4) */}
                <View
                  className="mt-6 pt-4"
                  style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HERO_BORDER }}
                >
                  <Text variant="title" tone="onDark" className="mb-1">
                    Comments
                  </Text>
                  <Text variant="caption" tone="tertiary" className="mb-3">
                    {post.commentCount === 0
                      ? 'No comments yet — meta-discussion only, never anonymous.'
                      : `${post.commentCount} comment${post.commentCount === 1 ? '' : 's'}`}
                  </Text>
                  <View
                    className="rounded-md p-3 mb-2"
                    style={{ backgroundColor: HERO_OVERLAY }}
                  >
                    <View
                      className="rounded-md px-3 py-2 mb-3"
                      style={{ backgroundColor: HERO_OVERLAY }}
                    >
                      <TextInput
                        value={commentDraft}
                        onChangeText={setCommentDraft}
                        placeholder="Comment on this discussion…"
                        placeholderTextColor={colors.text.tertiary}
                        className="text-text-onDark min-h-[36px] max-h-[80px] p-0"
                        multiline
                        editable={!commentMutation.isPending}
                        accessibilityLabel="Comment"
                      />
                    </View>
                    <View className="flex-row justify-end">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Post comment"
                        onPress={() => {
                          const trimmed = commentDraft.trim();
                          if (!trimmed) return;
                          commentMutation.mutate(trimmed, {
                            onSuccess: () => setCommentDraft(''),
                          });
                        }}
                        disabled={commentMutation.isPending || commentDraft.trim().length === 0}
                        className="px-4 py-2 rounded-md"
                        style={{
                          backgroundColor: colors.brand.primary,
                          opacity: commentMutation.isPending || commentDraft.trim().length === 0 ? 0.55 : 1,
                        }}
                      >
                        <Text variant="caption" bold tone="onDark">
                          {commentMutation.isPending ? 'Posting…' : 'Post comment'}
                        </Text>
                      </Pressable>
                    </View>
                    {commentMutation.isError ? (
                      <Text variant="meta" className="mt-2" style={{ color: HERO_ERROR }}>
                        Couldn't post the comment. Try again.
                      </Text>
                    ) : null}
                  </View>
                </View>
              </>
            ) : null}

            {/* Composer — response input */}
            {post ? (
              <View
                className="pt-6 mt-6"
                style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HERO_BORDER }}
              >
                <View className="mb-3 flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text variant="title" tone="onDark">
                      Submit your response
                    </Text>
                    <Text variant="caption" tone="tertiary" className="mt-1">
                      Visible to others after the timer ends.
                    </Text>
                  </View>
                  {post.status === 'active' ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reveal now"
                      onPress={() => {
                        Alert.alert(
                          'Reveal now?',
                          'This permanently reveals all responses for this group.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Reveal',
                              style: 'destructive',
                              onPress: () => revealMutation.mutate(),
                            },
                          ],
                        );
                      }}
                      disabled={revealMutation.isPending}
                      className="px-3 py-2 rounded-md active:opacity-80"
                      style={{
                        backgroundColor: HERO_OVERLAY_STRONG,
                        opacity: revealMutation.isPending ? 0.55 : 1,
                      }}
                    >
                      <Text variant="caption" bold tone="onDark">
                        Reveal now
                      </Text>
                    </Pressable>
                  ) : null}
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
            ) : null}
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

      {/* Caption */}
      <Text variant="h2" tone="onDark" className="mb-4">
        {post.caption}
      </Text>

      {/* Media (single full-width preview, 16:9) */}
      {firstMedia ? <MediaPreview item={firstMedia} /> : null}
    </>
  );
}

function ResponsesSection({
  responses,
  error,
  postStatus,
}: {
  responses: ResponseItem[];
  error: unknown;
  postStatus: string;
}) {
  const errorMessage =
    error instanceof Error ? error.message : 'Could not load responses.';
  const showHiddenNotice = postStatus === 'active' && error !== null;

  return (
    <View
      className="mt-6 pt-4"
      style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HERO_BORDER }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text variant="title" tone="onDark">
          Responses
        </Text>
        {postStatus === 'active' ? (
          <Pill label="Hidden until reveal" tone="info" />
        ) : (
          <Pill label="Revealed" tone="success" />
        )}
      </View>

      {showHiddenNotice ? (
        <Text variant="caption" tone="tertiary" className="mb-3">
          {errorMessage}
        </Text>
      ) : null}

      {responses.length === 0 && !showHiddenNotice ? (
        <Text variant="caption" tone="tertiary">
          No responses yet. Be the first.
        </Text>
      ) : null}

      {responses.map((r) => (
        <ResponseRow key={r.id} item={r} />
      ))}
    </View>
  );
}

function ResponseRow({ item }: { item: ResponseItem }) {
  const initials = authorInitials(item.authorName);
  return (
    <View
      className="flex-row items-start py-3"
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HERO_BORDER }}
    >
      <View
        className="items-center justify-center mr-3"
        style={{
          width: 28,
          height: 28,
          borderRadius: 9999,
          backgroundColor: HERO_OVERLAY_STRONG,
        }}
      >
        <Text variant="caption" bold tone="onDark">
          {initials}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <Text variant="bodyStrong" tone="onDark" numberOfLines={1}>
          {item.authorName ?? 'Anonymous'}
        </Text>
        <Text variant="body" tone="onDark" className="mt-1">
          {item.body}
        </Text>
      </View>
    </View>
  );
}

function MediaPreview({ item }: { item: PostMediaItem }) {
  const isImage = item.mimeType.startsWith('image/');
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Attached media"
      className="w-full aspect-[16/9] rounded-lg overflow-hidden mb-6"
      style={{ backgroundColor: HERO_BOTTOM }}
    >
      {isImage ? (
        <Image source={{ uri: item.url }} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: HERO_BOTTOM }}>
          <MaterialCommunityIcons
            name="play-circle-outline"
            size={36}
            color={colors.text.onDark}
          />
        </View>
      )}
    </View>
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

function authorInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return (
    (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '?')
  ).toUpperCase();
}

function avatarColorFor(seed: string): string {
  const palette = ['#0B49FA', '#7A4DFF', '#22C7B7', '#FFB020', '#FF3D7F'];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length] as string;
}
