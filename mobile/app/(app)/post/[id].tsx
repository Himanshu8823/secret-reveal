import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  ratePost,
  toggleLike,
  toggleReactionAny,
  votePoll,
  getPollResults,
  getPostReactors,
  getPostRatings,
  getPostVotes,
  type CommentItem,
  type CommentQuote,
  type PostDetail,
  type PostSummary,
  type ListPostsResponse,
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
/** Indent for a reply row. Matches the parent's avatar width plus its gap,
 *  so a reply's avatar lines up under the parent's text. */
const REPLY_INDENT = 44;
/** Replies use a smaller avatar so a thread reads as parent-then-children
 *  at a glance rather than as a list of equals. */
const REPLY_AVATAR_SIZE = 24;

const BORDER = colors.border.DEFAULT;
const MUTED_BG = colors.surface.muted;
const ERROR_COLOR = colors.semantic.danger;
const SUBTLE_PILL_BG = colors.brand.primarySubtle;

const EMOJI_PICKER = ['❤️', '😂', '🔥', '🙏', '😮', '😢', '👍', '👏', '🎉', '😍', '🤔', '👌'];

// A tapped PostCard already has almost everything this screen needs to
// paint (caption, media, counts, author) — it just came from a feed list
// query. Without a placeholder, this screen showed a blank/skeleton state
// on every open and re-fetched from scratch, even though the same data was
// on screen a moment ago in the feed. Reshape whatever summary we can find
// in the feed/group-posts caches into a PostDetail-shaped stand-in so the
// first paint is instant; the real getPost() request still runs and
// overwrites it — this is a placeholder, not a substitute for fresh data.
function summaryToDetailPlaceholder(summary: PostSummary): PostDetail {
  return {
    id: summary.id,
    authorId: summary.author.id,
    authorName: summary.author.name,
    groupId: summary.groupId,
    groupName: summary.groupName,
    caption: summary.caption,
    status: summary.status,
    allowedInteractions: summary.allowedInteractions,
    // Not present on the feed summary — unknown until the real fetch lands.
    ratingScale: null,
    createdAt: summary.createdAt,
    updatedAt: summary.createdAt,
    media: summary.media,
    discussionMeta: summary.discussionMeta,
    responseCount: summary.responseCount,
    reactionCount: summary.reactionCount,
    commentCount: summary.commentCount,
    likeCount: summary.likeCount,
    viewerReaction: summary.viewerReaction,
    viewerLiked: summary.viewerLiked,
    // Not present on the feed summary — unknown until the real fetch lands.
    viewerPollOptionIds: [],
    viewerRating: null,
  };
}

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
    placeholderData: (previous) => {
      // `previous` is whatever this query last resolved to — including a
      // DIFFERENT post's detail when the user just navigated from post A
      // to post B (TanStack Query v5 hands the prior query's data across
      // a key change here, that's how `keepPreviousData` was replaced).
      // Without this id check, opening B showed A's stale content until
      // the real fetch for B landed. Only reuse it when it's actually
      // this post — e.g. navigated away and back to the same one.
      if (previous && previous.id === postId) return previous;
      if (!postId) return undefined;
      // Check every feed-shaped cache this app populates: the home feed,
      // and each group's post list (['group', groupId, 'posts'] — NOT
      // ['group', groupId] alone, which is the group *detail* query and
      // has no `posts` array at all; matching that prefix would find a
      // GroupDetail object here instead of a post list). Whichever one
      // the user actually tapped from will have it; the others are cheap
      // no-op lookups.
      const caches = queryClient.getQueriesData<ListPostsResponse>({ queryKey: ['posts', 'feed'] });
      const groupCaches = queryClient
        .getQueryCache()
        .findAll({ queryKey: ['group'] })
        .filter((q) => q.queryKey.length === 3 && q.queryKey[2] === 'posts')
        .map((q) => q.state.data as ListPostsResponse | undefined);
      for (const data of [...caches.map(([, d]) => d), ...groupCaches]) {
        const match = data?.posts.find((p) => p.id === postId);
        if (match) return summaryToDetailPlaceholder(match);
      }
      return undefined;
    },
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
    // Guard against showing the PREVIOUS post's comments while this one's
    // are still loading — same cross-key placeholder issue as postQuery
    // above. Only reuse `prev` when every comment in it actually belongs
    // to this post.
    placeholderData: (prev) => (prev && prev.every((c) => c.postId === postId) ? prev : undefined),
  });

  // Refresh when the user comes back to this post from another screen
  // (e.g. opened notifications, switched to home and back). Reaction /
  // response / comment counts may have changed in the background.
  useRefreshOnFocus(['post', postId]);
  useRefreshOnFocus(['post', postId, 'responses']);
  useRefreshOnFocus(['post', postId, 'comments']);

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
    mutationFn: (input: { body: string; replyToId?: string | null }) =>
      createCommentApi(postId, input),
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
  // The comment the draft is replying to, or null for a top-level comment.
  // Holding the whole quote (not just an id) lets the composer strip render
  // without hunting through the list for the row again.
  const [replyingTo, setReplyingTo] = useState<CommentQuote | null>(null);
  // Which "who did this" sheet is open, if any.
  const [reactorsMode, setReactorsMode] = useState<'likes' | 'reactions' | null>(null);

  const startReply = useCallback((c: CommentItem) => {
    setReplyingTo({
      id: c.id,
      authorId: c.authorId,
      authorName: c.authorName,
      body: c.body,
    });
  }, []);
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
                <PostHeader post={post} onOpenMedia={openMedia} />
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
                  onShowLikes={() => setReactorsMode('likes')}
                  onShowReactions={() => setReactorsMode('reactions')}
                />

                {post.allowedInteractions?.includes('rating') && post.status === 'revealed' ? (
                  <RatingsList postId={postId} />
                ) : null}

                {/* NOTE: a "Responses" section used to sit here. It was
                    unreachable — the screen never had a composer for it, so
                    it could only ever render "No responses yet. Be the
                    first." with no way to be the first. Comments cover the
                    same ground and are actually writable. The backend's
                    response endpoints are left in place, unused. */}

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
                      groupCommentThreads(commentsQuery.data ?? []).map((thread) => (
                        <View key={thread.parent.id}>
                          <ThreadRow
                            name={thread.parent.authorName ?? 'Unknown'}
                            body={thread.parent.body}
                            createdAt={thread.parent.createdAt}
                            onReply={() => startReply(thread.parent)}
                            // The thread's own rule is drawn by its last
                            // reply, so the parent only draws one when it
                            // stands alone.
                            showDivider={thread.replies.length === 0}
                          />

                          {/* Replies sit indented under their parent. The
                              quote strip is dropped here — the nesting
                              already says what is being replied to, and
                              repeating it doubles every reply's height. */}
                          {thread.replies.length > 0 ? (
                            <View style={{ paddingLeft: REPLY_INDENT }}>
                              {thread.replies.map((r, ri) => (
                                <ThreadRow
                                  key={r.id}
                                  name={r.authorName ?? 'Unknown'}
                                  body={r.body}
                                  createdAt={r.createdAt}
                                  // Only shown when replying to someone
                                  // other than the thread's parent, so a
                                  // deeper reply still says who it answers.
                                  replyTo={
                                    r.replyTo && r.replyTo.id !== thread.parent.id
                                      ? r.replyTo
                                      : null
                                  }
                                  compact
                                  onReply={() => startReply(r)}
                                  // Only the last reply closes the thread.
                                  showDivider={ri === thread.replies.length - 1}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ))
                    )}

                    <ReplyComposer
                      value={commentDraft}
                      onChangeText={setCommentDraft}
                      placeholder={
                        replyingTo
                          ? `Reply to ${replyingTo.authorName ?? 'Unknown'}…`
                          : 'Comment on this discussion…'
                      }
                      accessibilityLabel="Comment"
                      isPending={commentMutation.isPending}
                      isError={commentMutation.isError}
                      errorText="Couldn't post the comment. Try again."
                      replyingTo={replyingTo}
                      onCancelReply={() => setReplyingTo(null)}
                      onSend={() => {
                        const trimmed = commentDraft.trim();
                        if (!trimmed) return;
                        commentMutation.mutate(
                          { body: trimmed, replyToId: replyingTo?.id ?? null },
                          {
                            onSuccess: () => {
                              setCommentDraft('');
                              // Clear the quote too — leaving it armed would
                              // silently attach it to the next comment.
                              setReplyingTo(null);
                            },
                          },
                        );
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

      <ReactorsSheet
        postId={postId}
        mode={reactorsMode}
        onClose={() => setReactorsMode(null)}
      />
      <VideoPlayerModal visible={videoUri != null} uri={videoUri} onClose={() => setVideoUri(null)} />
    </View>
  );
}

/**
 * Ticking "time until reveal" text. Owns its own second-by-second interval
 * so only this small pill re-renders every tick — it used to live in the
 * screen component itself, which re-rendered the whole post (comment
 * thread, media, engagement bar, everything) once a second.
 */
function CountdownPill({ revealEndsAt }: { revealEndsAt: string | null }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const countdownText = useMemo(() => formatCountdown(revealEndsAt, now), [revealEndsAt, now]);

  return (
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
      {countdownText}
    </Text>
  );
}

function PostHeader({
  post,
  onOpenMedia,
}: {
  post: PostDetail;
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
          {isRevealed ? (
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
              Revealed
            </Text>
          ) : (
            <CountdownPill revealEndsAt={post.discussionMeta?.revealEndsAt ?? null} />
          )}
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

      {revealed ? <PollVotersList postId={postId} /> : null}
    </View>
  );
}

/**
 * Who voted for what, shown once a poll is revealed — same row shape as the
 * ratings list: avatar, name, time, then the option they picked.
 */
function PollVotersList({ postId }: { postId: string }) {
  const votesQuery = useQuery({
    queryKey: ['post', postId, 'votes'],
    queryFn: () => getPostVotes(postId),
    staleTime: 30_000,
  });

  const votes = votesQuery.data ?? [];

  if (votesQuery.isLoading) {
    return (
      <View className="py-3 items-center">
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }
  if (votes.length === 0) return null;

  return (
    <View className="mt-3 pt-3" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }}>
      <Text variant="caption" bold tone="secondary" className="mb-1.5">
        Votes
      </Text>
      {votes.map((v) => (
        <View key={`${v.userId}-${v.optionId}`} className="flex-row items-center py-2">
          <View
            className="items-center justify-center"
            style={{
              width: THREAD_AVATAR_SIZE,
              height: THREAD_AVATAR_SIZE,
              borderRadius: radius.full,
              backgroundColor: SUBTLE_PILL_BG,
              marginRight: 12,
            }}
          >
            <Text variant="caption" bold tone="primary">
              {authorInitials(v.name)}
            </Text>
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center flex-wrap">
              <Text variant="bodyStrong" tone="primary" numberOfLines={1}>
                {v.name ?? 'Unknown'}
              </Text>
              <Text variant="meta" tone="tertiary" className="ml-2">
                {formatRelativeTime(v.createdAt)}
              </Text>
            </View>
            <Text variant="caption" tone="secondary" numberOfLines={1} className="mt-0.5">
              {v.optionLabel}
            </Text>
          </View>
        </View>
      ))}
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
  onShowLikes,
  onShowReactions,
}: {
  post: PostDetail;
  onLike: () => void;
  onRate: (n: number) => void;
  onReact: (emoji: string) => void;
  /** Long-press handlers — open the "who did this" sheet. */
  onShowLikes: () => void;
  onShowReactions: () => void;
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
          onLongPress={onShowLikes}
          accessibilityRole="button"
          accessibilityLabel="Like"
          accessibilityHint="Press and hold to see who liked"
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
        <ReactionPicker
          viewerReaction={post.viewerReaction}
          reactionCount={post.reactionCount}
          onReact={onReact}
          onLongPress={onShowReactions}
        />
      ) : null}
    </View>
  );
}

/**
 * Who rated what, shown once the post is revealed — sits directly below
 * the engagement bar's rating stars, same row shape as the poll voters
 * list: avatar, name, time, then that person's filled stars.
 */
function RatingsList({ postId }: { postId: string }) {
  const ratingsQuery = useQuery({
    queryKey: ['post', postId, 'ratings'],
    queryFn: () => getPostRatings(postId),
    staleTime: 30_000,
  });

  const ratings = ratingsQuery.data ?? [];

  if (ratingsQuery.isLoading) {
    return (
      <View className="py-3 items-center">
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }
  if (ratings.length === 0) return null;

  return (
    <View
      className="pt-3 pb-1 mb-1"
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER }}
    >
      <Text variant="caption" bold tone="secondary" className="mb-1.5">
        Ratings
      </Text>
      {ratings.map((r) => (
        <View key={r.userId} className="flex-row items-center py-2">
          <View
            className="items-center justify-center"
            style={{
              width: THREAD_AVATAR_SIZE,
              height: THREAD_AVATAR_SIZE,
              borderRadius: radius.full,
              backgroundColor: SUBTLE_PILL_BG,
              marginRight: 12,
            }}
          >
            <Text variant="caption" bold tone="primary">
              {authorInitials(r.name)}
            </Text>
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center flex-wrap">
              <Text variant="bodyStrong" tone="primary" numberOfLines={1}>
                {r.name ?? 'Unknown'}
              </Text>
              <Text variant="meta" tone="tertiary" className="ml-2">
                {formatRelativeTime(r.createdAt)}
              </Text>
            </View>
            <View className="flex-row items-center mt-0.5">
              {Array.from({ length: RATING_SCALE }, (_, i) => i + 1).map((n) => (
                <Ionicons
                  key={n}
                  name={n <= r.value ? 'star' : 'star-outline'}
                  size={14}
                  color={n <= r.value ? colors.brand.accentAmber : colors.text.tertiary}
                  style={{ marginRight: 1 }}
                />
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Long-press sheet listing who liked, or who reacted with what.
 *
 * Server-gated: the endpoint 403s while the post is still active, so the
 * names stay hidden for exactly as long as everything else does. We render
 * that refusal as an explanatory line, not an error — it is the expected
 * state during the discussion phase, not a failure.
 */
function ReactorsSheet({
  postId,
  mode,
  onClose,
}: {
  postId: string;
  /** null = closed. 'likes' or 'reactions' picks which list to show. */
  mode: 'likes' | 'reactions' | null;
  onClose: () => void;
}) {
  const visible = mode !== null;
  const query = useQuery({
    queryKey: ['post', postId, 'reactors'],
    queryFn: () => getPostReactors(postId),
    enabled: visible,
    retry: false,
    staleTime: 30_000,
  });

  const data = query.data;
  const rows =
    mode === 'likes'
      ? (data?.likes ?? []).map((l) => ({ key: l.userId, name: l.name, emoji: null as string | null }))
      : (data?.reactions ?? []).map((r) => ({ key: r.userId, name: r.name, emoji: r.emoji }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: colors.surface.overlay }}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        {/* Centred card rather than a bottom sheet: the list is short and
            sits far from the button that opened it, so anchoring it to the
            bottom edge left it under the thumb and half off-screen on
            smaller devices. Inner press is swallowed so tapping the card
            doesn't dismiss it. */}
        <Pressable
          onPress={() => {}}
          className="bg-surface w-full px-5 pt-5 pb-5"
          style={{ borderRadius: radius.lg, maxWidth: 420, ...elevation[3] }}
        >
          <Text variant="h3" tone="primary" className="mb-3">
            {mode === 'likes' ? 'Liked by' : 'Reactions'}
          </Text>

          {query.isLoading ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : query.error ? (
            <Text variant="body" tone="secondary" className="py-4">
              Hidden until the discussion is revealed.
            </Text>
          ) : rows.length === 0 ? (
            <Text variant="body" tone="secondary" className="py-4">
              {mode === 'likes' ? 'No likes yet.' : 'No reactions yet.'}
            </Text>
          ) : (
            // maxHeight caps the card's growth so a long list scrolls
            // inside it instead of pushing the card off-screen.
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {rows.map((row) => (
                <View key={row.key} className="flex-row items-center py-2.5">
                  <View
                    className="items-center justify-center"
                    style={{
                      width: THREAD_AVATAR_SIZE,
                      height: THREAD_AVATAR_SIZE,
                      borderRadius: radius.full,
                      backgroundColor: SUBTLE_PILL_BG,
                      marginRight: 12,
                    }}
                  >
                    <Text variant="caption" bold tone="primary">
                      {authorInitials(row.name)}
                    </Text>
                  </View>
                  <Text variant="body" tone="primary" className="flex-1" numberOfLines={1}>
                    {row.name ?? 'Unknown'}
                  </Text>
                  {row.emoji ? (
                    <Text style={{ fontSize: 20, lineHeight: 26 }}>{row.emoji}</Text>
                  ) : (
                    <Ionicons name="heart" size={18} color={colors.semantic.danger} />
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReactionPicker({
  viewerReaction,
  reactionCount,
  onReact,
  onLongPress,
}: {
  viewerReaction: string | null;
  reactionCount: number;
  onReact: (emoji: string) => void;
  /** Opens the "who reacted with what" sheet. */
  onLongPress: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel="React with emoji"
        accessibilityHint="Press and hold to see who reacted"
        className="flex-row items-center active:opacity-70"
        hitSlop={8}
      >
        {/* Unpicked, this is the same happy-outline icon the composer shows
            against the "Reaction" option, so the affordance is recognisable
            from where it was enabled. Once the viewer has reacted their own
            emoji replaces it — that IS their reaction, not a generic entry
            point. */}
        {viewerReaction ? (
          <Text style={{ fontSize: 24, lineHeight: 30 }}>{viewerReaction}</Text>
        ) : (
          <Ionicons name="happy-outline" size={26} color={colors.text.primary} />
        )}
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

/** Shared thread-section shell: title + optional status pill. */
function ThreadSection({
  title,
  statusPill,
  children,
}: {
  title: string;
  statusPill?: React.ReactNode;
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
      {children}
    </View>
  );
}

/** One thread row: avatar, name, timestamp, wrapping body, lightweight action row. */
function ThreadRow({
  name,
  body,
  createdAt,
  replyTo,
  onReply,
  compact = false,
  showDivider = true,
}: {
  name: string;
  body: string;
  createdAt: string;
  replyTo?: CommentQuote | null;
  /** Omitted for responses, which are anonymous and not repliable. */
  onReply?: () => void;
  /** Reply rows: smaller avatar and tighter spacing than a thread parent. */
  compact?: boolean;
  /** Off inside a thread — a rule between a comment and its own replies
   *  reads as a separator between unrelated items, which is the opposite
   *  of what the nesting is saying. Only the last row of a thread keeps it. */
  showDivider?: boolean;
}) {
  const initials = authorInitials(name);
  const avatarSize = compact ? REPLY_AVATAR_SIZE : THREAD_AVATAR_SIZE;
  return (
    <View
      className={compact ? 'flex-row items-start py-2.5' : 'flex-row items-start py-3'}
      style={
        showDivider
          ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }
          : undefined
      }
    >
      {/* marginRight lives in the inline style, not a className: NativeWind's
          cssInterop rewrites className into this same style prop, so a
          class-based margin next to an inline style gets dropped. */}
      <View
        className="items-center justify-center"
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: radius.full,
          backgroundColor: SUBTLE_PILL_BG,
          marginRight: compact ? 10 : 14,
        }}
      >
        <Text variant={compact ? 'meta' : 'caption'} bold tone="primary">
          {initials}
        </Text>
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap">
          <Text
            variant={compact ? 'metaStrong' : 'bodyStrong'}
            tone="primary"
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text variant="meta" tone="tertiary" className="ml-2">
            {formatRelativeTime(createdAt)}
          </Text>
        </View>

        {/* Quoted comment, WhatsApp-style: an accent bar on the leading
            edge, the quoted author, and a clipped preview of their text. */}
        {replyTo ? (
          <View
            className="mt-1.5 rounded-md bg-surface-muted"
            style={{
              borderLeftWidth: 3,
              borderLeftColor: colors.brand.primary,
              paddingLeft: 12,
              paddingRight: 10,
              paddingVertical: 8,
            }}
          >
            <Text variant="caption" bold tone="link" numberOfLines={1}>
              {replyTo.authorName ?? 'Unknown'}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={2} className="mt-0.5">
              {replyTo.body}
            </Text>
          </View>
        ) : null}

        <Text variant={compact ? 'meta' : 'body'} tone="primary" className="mt-1">
          {body}
        </Text>

        {onReply ? (
          <Pressable
            onPress={onReply}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${name}`}
            className="mt-1.5 self-start active:opacity-60"
          >
            <Text variant="caption" bold tone="secondary">Reply</Text>
          </Pressable>
        ) : null}
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
  replyingTo,
  onCancelReply,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  isPending: boolean;
  isError: boolean;
  errorText: string;
  onSend: () => void;
  /** When set, the composer shows the quote strip above the input. */
  replyingTo?: CommentQuote | null;
  onCancelReply?: () => void;
}) {
  // marginTop goes in the inline style, not a className — cssInterop
  // rewrites className into this same style prop and would drop it.
  return (
    <View
      className="rounded-xl p-3"
      style={{ backgroundColor: MUTED_BG, borderRadius: radius.md, marginTop: 12 }}
    >
      {/* Reply preview — the same strip the sent reply will carry, so what
          you see before sending matches what lands in the thread. */}
      {replyingTo ? (
        <View
          className="flex-row items-center rounded-md bg-surface mb-2"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: colors.brand.primary,
            paddingLeft: 12,
            paddingRight: 10,
            paddingVertical: 8,
          }}
        >
          <View className="flex-1 min-w-0">
            <Text variant="caption" bold tone="link" numberOfLines={1}>
              {replyingTo.authorName ?? 'Unknown'}
            </Text>
            <Text variant="caption" tone="secondary" numberOfLines={1} className="mt-0.5">
              {replyingTo.body}
            </Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply"
            className="w-7 h-7 ml-2 items-center justify-center rounded-full active:opacity-60"
          >
            <Ionicons name="close" size={16} color={colors.text.secondary} />
          </Pressable>
        </View>
      ) : null}

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
      <View className="flex-row items-center justify-end">
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

function formatCountdown(revealEndsAt: string | null, now: number): string {
  if (!revealEndsAt) return '00:00:00';
  const endsAt = new Date(revealEndsAt).getTime();
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

/**
 * Group a flat comment list into Instagram/LinkedIn-style threads: each
 * top-level comment followed by its replies.
 *
 * Nesting is deliberately capped at one level. A reply to a reply attaches
 * to the same top-level thread rather than indenting further — unbounded
 * nesting turns into an unreadable staircase on a phone, and it is what
 * Instagram, LinkedIn and YouTube all settle on.
 *
 * A reply whose parent is missing (deleted, so `replyToId` was nulled, or
 * simply not in this page) is promoted to top level instead of being
 * dropped — losing someone's comment because its parent went away would be
 * worse than showing it unattached.
 */
function groupCommentThreads(
  comments: CommentItem[],
): Array<{ parent: CommentItem; replies: CommentItem[] }> {
  const byId = new Map(comments.map((c) => [c.id, c]));

  /** Walk up to the thread root, so a reply-to-a-reply lands in the right
   *  thread. Guarded against a cycle that bad data could introduce. */
  const rootIdOf = (c: CommentItem): string => {
    let current = c;
    const seen = new Set<string>([c.id]);
    while (current.replyTo) {
      const parent = byId.get(current.replyTo.id);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current.id;
  };

  const threads: Array<{ parent: CommentItem; replies: CommentItem[] }> = [];
  const indexById = new Map<string, number>();

  // One pass in server order (oldest first) keeps both the thread order and
  // the replies inside each thread chronological.
  for (const c of comments) {
    const isTopLevel = !c.replyTo || !byId.has(c.replyTo.id);
    if (isTopLevel) {
      indexById.set(c.id, threads.length);
      threads.push({ parent: c, replies: [] });
      continue;
    }
    const rootId = rootIdOf(c);
    const idx = indexById.get(rootId);
    if (idx === undefined) {
      // Root not seen yet — only possible with out-of-order data. Treat it
      // as its own thread rather than dropping the comment.
      indexById.set(c.id, threads.length);
      threads.push({ parent: c, replies: [] });
      continue;
    }
    threads[idx]!.replies.push(c);
  }

  return threads;
}

function authorInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return (
    (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '?')
  ).toUpperCase();
}

