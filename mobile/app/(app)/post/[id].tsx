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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius } from '../../../src/theme';
import { Text, Pill } from '../../../src/components/ui';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';
import {
  createComment as createCommentApi,
  getPost,
  listComments,
  listResponses,
  ratePost,
  submitResponse,
  toggleReaction,
  toggleReactionAny,
  voteYesNo,
  type CommentItem,
  type PostDetail,
  type PostMediaItem,
} from '../../../src/api/posts.api';

/**
 * Screen — Hidden Discussion, thread-style (Phase 4 redesign, plan §10).
 *
 * Layout, top → bottom:
 *   - Author row (avatar, name, relative time) + hidden/revealed status pill
 *   - Caption
 *   - Media (16:9, if any)
 *   - Compact engagement bar — dynamic per `post.allowedInteractions`
 *   - Thread list: Responses (reveal-gated) then Comments (always visible,
 *     meta-discussion, never anonymous)
 *   - Reply composer, pinned to the bottom of the scroll content
 *
 * Reveal is timer-only (server-side worker) — there is intentionally no
 * manual reveal action anywhere in this screen.
 */

const AVATAR_SIZE = 36;
const THREAD_AVATAR_SIZE = 30;

const BORDER = colors.border.DEFAULT;
const MUTED_BG = colors.surface.muted;
const ICON_MUTED = colors.text.tertiary;
const ERROR_COLOR = colors.semantic.danger;
const SUBTLE_PILL_BG = colors.brand.primarySubtle;

const EMOJI_PICKER = ['❤️', '😂', '🔥', '🙏', '😮', '😢', '👍', '👏', '🎉', '😍', '🤔', '👌'];

export default function HiddenDiscussionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';
  const queryClient = useQueryClient();

  const postQuery = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPost(postId),
    enabled: Boolean(postId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const responsesQuery = useQuery({
    queryKey: ['post', postId, 'responses'],
    queryFn: () => listResponses(postId),
    enabled: Boolean(postId),
    // 403 during active phase will throw — surfaced via `error`.
    // Keep previous data while refetching to avoid flicker between
    // "No responses" and "Hidden" states.
    retry: false,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
  });

  const commentsQuery = useQuery({
    queryKey: ['post', postId, 'comments'],
    queryFn: () => listComments(postId),
    enabled: Boolean(postId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Refresh when the user comes back to this post from another screen
  // (e.g. opened notifications, switched to home and back). Reaction /
  // response / comment counts may have changed in the background.
  useRefreshOnFocus(['post', postId]);
  useRefreshOnFocus(['post', postId, 'responses']);
  useRefreshOnFocus(['post', postId, 'comments']);

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

  const submitMutation = useMutation({
    mutationFn: (body: string) => submitResponse(postId, { body }),
    onSuccess: () => {
      setDraft('');
      // Invalidate the post so responseCount stays fresh, and the
      // responses list so the new entry shows up for the author.
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'responses'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      if (post?.groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', post.groupId, 'posts'] });
      }
    },
  });

  const reactionMutation = useMutation({
    mutationFn: (type: string) => toggleReaction(postId, { type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      if (post?.groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', post.groupId, 'posts'] });
      }
    },
  });

  const reactionAnyMutation = useMutation({
    mutationFn: (emoji: string) => toggleReactionAny(postId, emoji),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });

  const yesNoMutation = useMutation({
    mutationFn: (value: 'yes' | 'no') => voteYesNo(postId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const ratingMutation = useMutation({
    mutationFn: (value: number) => ratePost(postId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => createCommentApi(postId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      if (post?.groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', post.groupId, 'posts'] });
      }
    },
  });

  const [commentDraft, setCommentDraft] = useState('');

  const isInitialLoad = postQuery.isLoading && !postQuery.data;

  return (
    <View className="flex-1 bg-surface">
      <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 pt-3 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {isInitialLoad ? (
              <View className="gap-3 pt-2">
                <View className="h-6 w-24 rounded-full" style={{ backgroundColor: MUTED_BG }} />
                <View className="h-4 w-full rounded-md" style={{ backgroundColor: MUTED_BG }} />
                <View className="h-40 w-full rounded-lg" style={{ backgroundColor: MUTED_BG, borderRadius: radius.lg }} />
              </View>
            ) : postQuery.error ? (
              <View className="py-8 items-center">
                <Text variant="body" tone="primary" className="mb-3">
                  Couldn't load this discussion.
                </Text>
                <Pressable
                  onPress={() => postQuery.refetch()}
                  className="px-4 py-2 rounded-md active:opacity-80"
                  style={{ backgroundColor: SUBTLE_PILL_BG }}
                >
                  <Text variant="bodyStrong" tone="primary">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : post ? (
              <>
                <PostHeader post={post} countdownText={countdownText} />
                <EngagementBar
                  post={post}
                  onLike={() => reactionMutation.mutate('like')}
                  onYesNo={(v) => yesNoMutation.mutate(v)}
                  onRate={(n) => ratingMutation.mutate(n)}
                  onReact={(emoji) => reactionAnyMutation.mutate(emoji)}
                />

                <ThreadSection
                  title="Responses"
                  statusPill={
                    post.status === 'active'
                      ? <Pill label="Hidden until reveal" tone="info" />
                      : <Pill label="Revealed" tone="success" />
                  }
                  showTopFilter
                >
                  {responsesQuery.isLoading ? (
                    <View className="py-3 items-center">
                      <ActivityIndicator color={colors.brand.primary} />
                    </View>
                  ) : post.status === 'active' ? (
                    <Text variant="caption" tone="tertiary" className="mb-2">
                      {responsesQuery.error instanceof Error
                        ? responsesQuery.error.message
                        : 'Responses are hidden until reveal.'}
                    </Text>
                  ) : (responsesQuery.data ?? []).length === 0 ? (
                    <Text variant="caption" tone="tertiary">
                      No responses yet. Be the first.
                    </Text>
                  ) : (
                    (responsesQuery.data ?? []).map((r) => (
                      <ThreadRow key={r.id} name={r.authorName ?? 'Anonymous'} body={r.body} createdAt={r.createdAt} />
                    ))
                  )}
                </ThreadSection>

                <ThreadSection title="Comments">
                  {commentsQuery.isLoading ? (
                    <View className="py-3 items-center">
                      <ActivityIndicator color={colors.brand.primary} />
                    </View>
                  ) : (commentsQuery.data ?? []).length === 0 ? (
                    <Text variant="caption" tone="tertiary" className="mb-2">
                      No comments yet — meta-discussion only, never anonymous.
                    </Text>
                  ) : (
                    (commentsQuery.data ?? []).map((c: CommentItem) => (
                      <ThreadRow key={c.id} name={c.authorName ?? 'Unknown'} body={c.body} createdAt={c.createdAt} />
                    ))
                  )}

                  <ReplyComposer
                    value={commentDraft}
                    onChangeText={setCommentDraft}
                    placeholder="Comment on this discussion…"
                    accessibilityLabel="Comment"
                    isPending={commentMutation.isPending}
                    isError={commentMutation.isError}
                    errorText="Couldn't post the comment. Try again."
                    onSend={() => {
                      const trimmed = commentDraft.trim();
                      if (!trimmed) return;
                      commentMutation.mutate(trimmed, { onSuccess: () => setCommentDraft('') });
                    }}
                  />
                </ThreadSection>

                <View className="pt-5 mt-1">
                  <Text variant="title" tone="primary" className="mb-0.5">
                    Submit your response
                  </Text>
                  <Text variant="caption" tone="tertiary" className="mb-3">
                    Visible to others after the timer ends.
                  </Text>
                  <ReplyComposer
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write your response…"
                    accessibilityLabel="Your response"
                    isPending={submitMutation.isPending}
                    isError={submitMutation.isError}
                    errorText="Couldn't send your response. Try again."
                    onSend={() => {
                      const trimmed = draft.trim();
                      if (!trimmed) return;
                      submitMutation.mutate(trimmed);
                    }}
                  />
                </View>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PostHeader({ post, countdownText }: { post: PostDetail; countdownText: string }) {
  const initials = authorInitials(post.authorName);
  const avatarColor = avatarColorFor(post.authorId);
  const firstMedia = post.media?.[0];
  const isRevealed = post.status === 'revealed';

  return (
    <View className="mb-3">
      {/* Author row */}
      <View className="flex-row items-center mb-2.5">
        <View
          className="items-center justify-center mr-2.5"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radius.full, backgroundColor: avatarColor }}
        >
          <Text variant="metaStrong" tone="primary">
            {initials}
          </Text>
        </View>
        <View className="flex-1 min-w-0 flex-row items-center flex-wrap">
          <Text variant="bodyStrong" tone="primary" numberOfLines={1}>
            {post.authorName ?? 'Unknown author'}
          </Text>
          <Text variant="meta" tone="tertiary" className="ml-2">
            {formatRelativeTime(post.createdAt)}
          </Text>
        </View>
        <View className="px-2.5 py-1 rounded-full ml-2" style={{ backgroundColor: SUBTLE_PILL_BG }}>
          <Text
            variant="caption"
            bold
            tone="primary"
            numberOfLines={1}
            style={{
              fontVariant: ['tabular-nums'],
              fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
            }}
          >
            {isRevealed ? 'Revealed' : countdownText}
          </Text>
        </View>
      </View>

      {/* Caption */}
      <Text variant="h2" tone="primary" className="mb-2">
        {post.caption}
      </Text>

      {!isRevealed ? (
        <Text variant="meta" tone="tertiary" className="mb-2.5">
          Responses are hidden until the timer ends. Only your own reply is visible to you.
        </Text>
      ) : null}

      {/* Media (single full-width preview, 16:9) */}
      {firstMedia ? <MediaPreview item={firstMedia} /> : null}
    </View>
  );
}

/**
 * Compact inline engagement row — one entry per enabled interaction type,
 * matching plan §10.1's `[♡ Like] [Yes][No] [★★★★★] [emoji]` density
 * instead of the old vertically-stacked "Interact" section.
 */
function EngagementBar({
  post,
  onLike,
  onYesNo,
  onRate,
  onReact,
}: {
  post: PostDetail;
  onLike: () => void;
  onYesNo: (v: 'yes' | 'no') => void;
  onRate: (n: number) => void;
  onReact: (emoji: string) => void;
}) {
  const allowed = post.allowedInteractions ?? [];
  const viewerYesNoVote = (post as unknown as { viewerYesNoVote: string | null }).viewerYesNoVote;
  const viewerRating = (post as unknown as { viewerRating: number | null }).viewerRating;

  if (allowed.length === 0) return null;

  return (
    <View
      className="flex-row items-center flex-wrap gap-2 py-3 mb-1"
      style={{ borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}
    >
      {allowed.includes('like') ? (
        <Pressable
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel="Like"
          className="flex-row items-center px-3 py-1.5 rounded-full border active:opacity-80"
          style={{ backgroundColor: post.viewerReaction === 'like' ? colors.brand.primary : colors.surface.bg, borderColor: colors.brand.primary }}
        >
          <Ionicons name={post.viewerReaction === 'like' ? 'heart' : 'heart-outline'} size={15} color={post.viewerReaction === 'like' ? colors.brand.onPrimary : colors.brand.primary} />
          <Text variant="caption" bold tone={post.viewerReaction === 'like' ? 'onDark' : 'primary'} className="ml-1">Like</Text>
        </Pressable>
      ) : null}

      {allowed.includes('yesNo') ? (
        <View className="flex-row rounded-full overflow-hidden border" style={{ borderColor: colors.brand.primary }}>
          {(['yes', 'no'] as const).map((v) => {
            const active = viewerYesNoVote === v;
            return (
              <Pressable
                key={v}
                onPress={() => onYesNo(v)}
                accessibilityRole="button"
                accessibilityLabel={v === 'yes' ? 'Vote yes' : 'Vote no'}
                className="px-3.5 py-1.5"
                style={{ backgroundColor: active ? colors.brand.primary : colors.surface.bg }}
              >
                <Text variant="caption" bold tone={active ? 'onDark' : 'primary'}>{v === 'yes' ? 'Yes' : 'No'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {allowed.includes('rating') ? (
        <View className="flex-row items-center flex-wrap gap-1">
          {Array.from({ length: post.ratingScale ?? 5 }, (_, i) => i + 1).map((n) => {
            const active = viewerRating === n;
            return (
              <Pressable
                key={n}
                onPress={() => onRate(n)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n}`}
                className="w-8 h-8 rounded-full border items-center justify-center"
                style={{ backgroundColor: active ? colors.brand.primary : colors.surface.bg, borderColor: colors.brand.primary }}
              >
                <Text variant="caption" bold tone={active ? 'onDark' : 'primary'}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {allowed.includes('reaction') ? (
        <ReactionPicker viewerReaction={post.viewerReaction} reactionCount={post.reactionCount} onReact={onReact} />
      ) : null}
    </View>
  );
}

function ReactionPicker({
  viewerReaction,
  reactionCount,
  onReact,
}: {
  viewerReaction: string | null;
  reactionCount: number;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="React with emoji"
        className="flex-row items-center px-3 py-1.5 rounded-full border active:opacity-80"
        style={{ backgroundColor: viewerReaction ? SUBTLE_PILL_BG : colors.surface.bg, borderColor: colors.brand.primary }}
      >
        <Text style={{ fontSize: 15 }}>{viewerReaction ?? '🙂'}</Text>
        {reactionCount > 0 ? (
          <Text variant="caption" bold tone="primary" className="ml-1">{reactionCount}</Text>
        ) : null}
      </Pressable>
      {open ? (
        <View
          className="flex-row flex-wrap gap-1.5 p-2 mt-2 rounded-lg border"
          style={{ backgroundColor: colors.surface.bg, borderColor: BORDER, borderRadius: radius.md }}
        >
          {EMOJI_PICKER.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onReact(emoji);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              className="w-9 h-9 rounded-md items-center justify-center active:opacity-70"
            >
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Shared thread-section shell: title + optional status pill + optional "Top ∨" filter (static, non-functional per plan). */
function ThreadSection({
  title,
  statusPill,
  showTopFilter,
  children,
}: {
  title: string;
  statusPill?: React.ReactNode;
  showTopFilter?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-5 pt-4" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }}>
      <View className="flex-row items-center justify-between mb-3">
        <Text variant="title" tone="primary">
          {title}
        </Text>
        {statusPill ?? null}
      </View>
      {showTopFilter ? (
        <View className="flex-row items-center mb-2">
          <Text variant="caption" tone="secondary">Top</Text>
          <Ionicons name="chevron-down" size={14} color={colors.text.secondary} style={{ marginLeft: 2 }} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** One thread row: avatar, name, timestamp, wrapping body, lightweight action row. */
function ThreadRow({ name, body, createdAt }: { name: string; body: string; createdAt: string }) {
  const initials = authorInitials(name);
  return (
    <View className="flex-row items-start py-3" style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
      <View
        className="items-center justify-center mr-2.5"
        style={{ width: THREAD_AVATAR_SIZE, height: THREAD_AVATAR_SIZE, borderRadius: radius.full, backgroundColor: SUBTLE_PILL_BG }}
      >
        <Text variant="caption" bold tone="primary">
          {initials}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap">
          <Text variant="bodyStrong" tone="primary" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="meta" tone="tertiary" className="ml-2">
            {formatRelativeTime(createdAt)}
          </Text>
        </View>
        <Text variant="body" tone="primary" className="mt-1">
          {body}
        </Text>
        <View className="flex-row items-center mt-1.5">
          <Text variant="caption" tone="secondary">Like</Text>
          <Text variant="caption" tone="tertiary" className="mx-1.5">·</Text>
          <Text variant="caption" tone="secondary">Reply</Text>
        </View>
      </View>
    </View>
  );
}

/** Rounded muted-bg composer card, shared by the comment and response inputs (plan §10.2). */
function ReplyComposer({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  isPending,
  isError,
  errorText,
  onSend,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  isPending: boolean;
  isError: boolean;
  errorText: string;
  onSend: () => void;
}) {
  return (
    <View className="rounded-xl p-3" style={{ backgroundColor: MUTED_BG, borderRadius: radius.md }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        className="text-text-primary min-h-[36px] max-h-[120px] p-0 mb-2"
        multiline
        editable={!isPending}
        accessibilityLabel={accessibilityLabel}
      />
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-4">
          <Pressable accessibilityRole="button" accessibilityLabel="Attach image" className="w-8 h-8 items-center justify-center active:opacity-70">
            <MaterialCommunityIcons name="image-outline" size={20} color={ICON_MUTED} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach video" className="w-8 h-8 items-center justify-center active:opacity-70">
            <MaterialCommunityIcons name="video-outline" size={20} color={ICON_MUTED} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach audio" className="w-8 h-8 items-center justify-center active:opacity-70">
            <MaterialCommunityIcons name="music-note-outline" size={20} color={ICON_MUTED} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          onPress={onSend}
          disabled={isPending || value.trim().length === 0}
          className={`w-9 h-9 rounded-full items-center justify-center ${isPending || value.trim().length === 0 ? 'opacity-50' : 'active:opacity-90'}`}
          style={{ backgroundColor: colors.brand.primary }}
        >
          {isPending ? (
            <ActivityIndicator color={colors.brand.onPrimary} size="small" />
          ) : (
            <MaterialCommunityIcons name="send" size={17} color={colors.brand.onPrimary} />
          )}
        </Pressable>
      </View>

      {isError ? (
        <Text variant="meta" className="mt-2" style={{ color: ERROR_COLOR }}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
}

function MediaPreview({ item }: { item: PostMediaItem }) {
  const isImage = item.mimeType.startsWith('image/');
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Attached media"
      className="w-full aspect-[16/9] overflow-hidden mt-1 mb-1"
      style={{ backgroundColor: colors.surface.bg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}
    >
      {isImage ? (
        <Image source={{ uri: item.url }} className="w-full h-full" resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.surface.bg }}>
          <MaterialCommunityIcons name="play-circle-outline" size={36} color={colors.brand.primary} />
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
