import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, elevation } from '../../../src/theme';
import { avatarColorFor } from '../../../src/utils/avatarColor';
import { Text, Pill } from '../../../src/components/ui';
import { ImageViewer } from '../../../src/components/ImageViewer';
import { VideoPlayerModal } from '../../../src/components/VideoPlayerModal';
import { MediaTile } from '../../../src/components/MediaTile';
import { useRefreshOnFocus } from '../../../src/hooks/useRefreshOnFocus';
import {
  createComment as createCommentApi,
  getPost,
  listComments,
  listResponses,
  ratePost,
  toggleLike,
  toggleReactionAny,
  votePoll,
  getPollResults,
  type CommentItem,
  type PostDetail,
} from '../../../src/api/posts.api';
import { RATING_SCALE } from '../../../src/store/composerStore';

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

  const commentsEnabled = (postQuery.data?.allowedInteractions ?? []).includes('textComment');
  // The server hides comment bodies until reveal (403 while status is
  // 'active'). Asking anyway just produced a 403 on every focus/refetch,
  // so only fetch once the post is actually revealed.
  const commentsReadable = commentsEnabled && postQuery.data?.status === 'revealed';

  const commentsQuery = useQuery({
    queryKey: ['post', postId, 'comments'],
    queryFn: () => listComments(postId),
    enabled: Boolean(postId) && commentsReadable,
    retry: false,
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

  const reactionAnyMutation = useMutation({
    mutationFn: (emoji: string) => toggleReactionAny(postId, emoji),
    // Optimistic: flip the heart/emoji instantly instead of waiting on the
    // network round-trip. Toggling off (tapping the same reaction again)
    // clears it; toggling to a different reaction replaces it and bumps
    // the count only when there wasn't one already.
    onMutate: async (emoji: string) => {
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      const previous = queryClient.getQueryData<PostDetail>(['post', postId]);
      if (previous) {
        const wasSame = previous.viewerReaction === emoji;
        queryClient.setQueryData<PostDetail>(['post', postId], {
          ...previous,
          viewerReaction: wasSame ? null : emoji,
          reactionCount: previous.reactionCount + (wasSame ? -1 : previous.viewerReaction ? 0 : 1),
        });
      }
      return { previous };
    },
    onError: (_err, _emoji, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['post', postId], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      if (post?.groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', post.groupId, 'posts'] });
      }
    },
  });

  // Independent from reactionAnyMutation — Like and emoji-reaction are
  // separate backend models (PostLike vs Reaction), never overwrite
  // each other's state.
  const likeMutation = useMutation({
    mutationFn: () => toggleLike(postId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      const previous = queryClient.getQueryData<PostDetail>(['post', postId]);
      if (previous) {
        const nextLiked = !previous.viewerLiked;
        queryClient.setQueryData<PostDetail>(['post', postId], {
          ...previous,
          viewerLiked: nextLiked,
          likeCount: previous.likeCount + (nextLiked ? 1 : -1),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['post', postId], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      if (post?.groupId) {
        queryClient.invalidateQueries({ queryKey: ['group', post.groupId, 'posts'] });
      }
    },
  });

  const pollMutation = useMutation({
    // The complete selection is sent every time, never a delta — that is
    // what makes a retry safe (see votePoll).
    mutationFn: (optionIds: string[]) => votePoll(postId, optionIds),
    // Paint the choice immediately; the server catches up behind it.
    onMutate: async (optionIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      const previous = queryClient.getQueryData<PostDetail>(['post', postId]);
      if (previous) {
        queryClient.setQueryData<PostDetail>(['post', postId], {
          ...previous,
          viewerPollOptionIds: optionIds,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['post', postId], context.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      // Tallies live in their own query — refresh them too, otherwise a
      // revealed poll keeps showing the pre-vote counts.
      queryClient.invalidateQueries({ queryKey: ['post', postId, 'poll'] });
    },
  });

  const ratingMutation = useMutation({
    mutationFn: (value: number) => ratePost(postId, value),
    // Stars fill on tap, not on response — waiting on the round-trip made
    // the control feel broken.
    onMutate: async (value: number) => {
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      const previous = queryClient.getQueryData<PostDetail>(['post', postId]);
      if (previous) {
        queryClient.setQueryData<PostDetail>(['post', postId], {
          ...previous,
          viewerRating: value,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['post', postId], context.previous);
    },
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
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  // Images open the zoomable viewer, videos the player. Audio and PDFs
  // have no in-app viewer yet, so they hand off to the OS.
  const openMedia = useCallback((uri: string, mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      setViewerUri(uri);
    } else if (mimeType.startsWith('video/')) {
      setVideoUri(uri);
    } else {
      void Linking.openURL(uri);
    }
  }, []);

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
                <PostHeader post={post} countdownText={countdownText} onOpenMedia={openMedia} />
                {post.allowedInteractions?.includes('poll') ? (
                  <PollBlock
                    postId={postId}
                    viewerOptionIds={post.viewerPollOptionIds ?? []}
                    onVote={(ids) => pollMutation.mutate(ids)}
                  />
                ) : null}

                <EngagementBar
                  post={post}
                  onLike={() => likeMutation.mutate()}
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

                {/* Comments only exist when the author enabled them at
                    creation — otherwise the whole section stays off. */}
                {(post.allowedInteractions ?? []).includes('textComment') ? (
                  <ThreadSection
                    title="Comments"
                    statusPill={
                      post.status === 'active' ? <Pill label="Hidden until reveal" tone="info" /> : undefined
                    }
                  >
                    {post.status === 'active' ? (
                      <Text variant="caption" tone="tertiary" className="mb-2">
                        Comments stay hidden until the timer ends. You can still add yours.
                      </Text>
                    ) : commentsQuery.isLoading ? (
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
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ImageViewer visible={viewerUri != null} uri={viewerUri} onClose={() => setViewerUri(null)} />
      <VideoPlayerModal visible={videoUri != null} uri={videoUri} onClose={() => setVideoUri(null)} />
    </View>
  );
}

function PostHeader({
  post,
  countdownText,
  onOpenMedia,
}: {
  post: PostDetail;
  countdownText: string;
  onOpenMedia: (uri: string, mimeType: string) => void;
}) {
  const initials = authorInitials(post.authorName);
  const avatarColor = avatarColorFor(post.authorId);
  const isRevealed = post.status === 'revealed';

  return (
    <View className="mb-3">
      {/* Author row */}
      <View className="flex-row items-center mb-2.5">
        <View
          className="items-center justify-center"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radius.full, backgroundColor: avatarColor, marginRight: 8 }}
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
        <View className="rounded-full ml-2" style={{ backgroundColor: SUBTLE_PILL_BG, padding: 4 }}>
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
      <View style={{ minHeight: 64, marginTop: 8 }} className="mb-2">
        <Text variant="body" tone="primary">
          {post.caption}
        </Text>
      </View>

      {/* Every attachment, not just the first — a post can carry up to 5. */}
      {post.media.length > 0 ? (
        <View className="gap-2 mt-1 mb-1">
          {post.media.map((m) => (
            <MediaTile
              key={m.id}
              url={m.url}
              mimeType={m.mimeType}
              recyclingKey={m.id}
              onPress={() => onOpenMedia(m.url, m.mimeType)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Poll block.
 *
 * The post's caption is the question — it is already rendered above, so
 * this draws only the answers.
 *
 * Before reveal the viewer can vote and see their OWN choice, but no
 * counts: same rule as responses and comments. After reveal each row
 * gains a share bar and a vote count. Tapping a chosen option again
 * clears the vote (sends an empty selection).
 */
function PollBlock({
  postId,
  viewerOptionIds,
  onVote,
}: {
  postId: string;
  viewerOptionIds: string[];
  onVote: (optionIds: string[]) => void;
}) {
  const pollQuery = useQuery({
    queryKey: ['post', postId, 'poll'],
    queryFn: () => getPollResults(postId),
    staleTime: 30_000,
  });

  const poll = pollQuery.data;

  // The parent's optimistic value wins while a vote is in flight — the
  // poll query hasn't refetched yet at that point.
  const selected = viewerOptionIds;

  if (pollQuery.isLoading && !poll) {
    return (
      <View className="py-4">
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }
  if (!poll) return null;

  const revealed = poll.revealed;
  const totalVoters = poll.totalVoters ?? 0;

  const toggle = (optionId: string) => {
    const has = selected.includes(optionId);
    if (poll.multiSelect) {
      onVote(has ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
      return;
    }
    // Single choice: tapping the current answer clears it, tapping another
    // replaces it outright.
    onVote(has ? [] : [optionId]);
  };

  return (
    <View
      className="py-3 mb-1"
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text variant="caption" tone="secondary">
          {poll.multiSelect ? 'Select one or more' : 'Select one'}
        </Text>
        <Text variant="caption" tone="tertiary">
          {revealed
            ? `${totalVoters} vote${totalVoters === 1 ? '' : 's'}`
            : 'Results hidden until reveal'}
        </Text>
      </View>

      <View className="gap-2">
        {poll.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          const votes = opt.votes ?? 0;
          // Share of voters, not of votes — with multi-select the columns
          // legitimately sum past 100%, and dividing by row count would
          // understate every bar.
          const pct = revealed && totalVoters > 0 ? Math.round((votes / totalVoters) * 100) : 0;
          // Only dim while the viewer actually holds a single-choice answer;
          // with nothing picked every option is still live. After reveal the
          // rows carry results everyone needs to read, so nothing is dimmed
          // then regardless of what the viewer voted for.
          const dimUnselected =
            !revealed && !poll.multiSelect && selected.length > 0 && !isSelected;

          return (
            <Pressable
              key={opt.id}
              onPress={() => toggle(opt.id)}
              accessibilityRole="button"
              accessibilityLabel={`Vote for ${opt.label}`}
              className={[
                'rounded-md border overflow-hidden active:opacity-80',
                isSelected ? 'border-primary' : 'border-border',
                // Single-choice: once an answer is picked the others take a
                // grey ground so the current choice reads at a glance. They
                // stay tappable — this is a de-emphasis, not a disable,
                // because switching answers has to remain possible.
                // Multi-select skips it, since every unpicked option there is
                // still an equal candidate.
                dimUnselected ? 'bg-surface-muted' : 'bg-surface',
              ].join(' ')}
            >
              {/* Fill bar sits behind the label, only after reveal. */}
              {revealed ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    backgroundColor: isSelected
                      ? colors.brand.primarySubtle
                      : colors.surface.muted,
                  }}
                />
              ) : null}

              {/* Height via className only — the outer Pressable carries an
                  inline style for its dynamic border colour, and NativeWind's
                  cssInterop drops an inline style that sits alongside a
                  className on the same element. Keeping them on separate
                  elements is what makes both stick. */}
              <View className="flex-row items-center px-3 py-4 min-h-[56px]">
                <Ionicons
                  name={
                    poll.multiSelect
                      ? isSelected
                        ? 'checkbox'
                        : 'square-outline'
                      : isSelected
                        ? 'radio-button-on'
                        : 'radio-button-off'
                  }
                  size={18}
                  color={isSelected ? colors.brand.primary : colors.text.tertiary}
                />
                <Text
                  variant="body"
                  tone={dimUnselected ? 'secondary' : 'primary'}
                  className="flex-1 ml-2"
                  numberOfLines={2}
                >
                  {opt.label}
                </Text>
                {revealed ? (
                  <Text variant="caption" bold tone="secondary" className="ml-2">
                    {pct}%
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Compact inline engagement row — one entry per enabled interaction type,
 * matching plan §10.1's `[♡ Like] [★★★★★] [emoji]` density
 * instead of the old vertically-stacked "Interact" section.
 */
function EngagementBar({
  post,
  onLike,
  onRate,
  onReact,
}: {
  post: PostDetail;
  onLike: () => void;
  onRate: (n: number) => void;
  onReact: (emoji: string) => void;
}) {
  const allowed = post.allowedInteractions ?? [];
  const viewerRating = (post as unknown as { viewerRating: number | null }).viewerRating;

  if (allowed.length === 0) return null;

  return (
    <View
      className="flex-row items-center flex-wrap gap-2 py-3 mb-1"
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}
    >
      {allowed.includes('rating') ? (
        // Real star-rating behaviour: tapping the Nth star fills 1..N,
        // rather than highlighting only the exact number tapped.
        // Always 5 stars — the 1-10 scale was removed. Older posts that
        // stored ratingScale=10 render as 5 here by design.
        <View className="flex-row items-center flex-wrap gap-0.5">
          {Array.from({ length: RATING_SCALE }, (_, i) => i + 1).map((n) => {
            const filled = viewerRating != null && n <= viewerRating;
            return (
              <Pressable
                key={n}
                onPress={() => onRate(n)}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${n} out of ${RATING_SCALE}`}
                hitSlop={4}
                className="items-center justify-center active:opacity-70"
                style={{ padding: 2 }}
              >
                <Ionicons
                  name={filled ? 'star' : 'star-outline'}
                  size={22}
                  color={filled ? colors.brand.accentAmber : colors.text.tertiary}
                />
              </Pressable>
            );
          })}
          {viewerRating != null ? (
            <Text variant="caption" tone="secondary" className="ml-1.5">
              {viewerRating}/{RATING_SCALE}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Spacer pushes Like + Reaction to the right edge. */}
      <View className="flex-1" />

      {allowed.includes('like') ? (
        <Pressable
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel="Like"
          className="items-center justify-center active:opacity-70"
          hitSlop={8}
        >
          <Ionicons
            name={post.viewerLiked ? 'heart' : 'heart-outline'}
            size={26}
            color={post.viewerLiked ? colors.semantic.danger : colors.text.primary}
          />
        </Pressable>
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
        className="flex-row items-center active:opacity-70"
        hitSlop={8}
      >
        <Text style={{ fontSize: 24, lineHeight: 30 }}>{viewerReaction ?? '🙂'}</Text>
        {reactionCount > 0 ? (
          <Text variant="caption" bold tone="primary" className="ml-1">{reactionCount}</Text>
        ) : null}
      </Pressable>
      {open ? (
        <>
          {/* Backdrop — tap outside to dismiss without picking. */}
          <Pressable
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss emoji picker"
            style={StyleSheet.absoluteFillObject}
          />
          <View
            className="flex-row flex-wrap gap-1.5 p-2 rounded-lg border"
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 8,
              width: 220,
              backgroundColor: colors.surface.bg,
              borderColor: BORDER,
              borderRadius: radius.md,
              ...elevation[2],
              zIndex: 20,
            }}
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
                <Text style={{ fontSize: 18, lineHeight: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </>
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

