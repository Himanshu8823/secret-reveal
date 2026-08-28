import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
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
    <View style={styles.root}>
      {/* Fake gradient — three stacked views, no new deps. */}
      <View style={[styles.gradientLayer, styles.gradientTop]} pointerEvents="none" />
      <View style={[styles.gradientLayer, styles.gradientMid]} pointerEvents="none" />
      <View style={[styles.gradientLayer, styles.gradientBottom]} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top bar */}
            <View style={styles.topBar}>
              <View style={styles.topBarLeft}>
                <View style={styles.pill}>
                  <Text style={styles.pillText} numberOfLines={1}>
                    Hidden Discussion
                  </Text>
                </View>
                <Text style={styles.subtitle} numberOfLines={2}>
                  Responses are hidden until the timer ends
                </Text>
              </View>
              <View style={styles.timerPill}>
                <Text style={styles.timerText} numberOfLines={1}>
                  {countdownText}
                </Text>
              </View>
            </View>

            {isInitialLoad ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : postQuery.error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorText}>Couldn't load this discussion.</Text>
                <Pressable
                  onPress={() => postQuery.refetch()}
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : post ? (
              <PostBody post={post} />
            ) : null}

            <View style={styles.composerWrap}>
              <View style={styles.composerHeader}>
                <Text style={styles.composerHeading}>Submit your response</Text>
              </View>

              <View style={styles.composerCard}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Write a comment…"
                    placeholderTextColor="#8A93AE"
                    style={styles.input}
                    multiline
                    editable={!submitMutation.isPending}
                    accessibilityLabel="Your response"
                  />
                </View>

                <View style={styles.composerFooter}>
                  <View style={styles.attachRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach image"
                      style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
                      // Phase 5 wires the actual picker.
                    >
                      <MaterialCommunityIcons name="image-outline" size={20} color="#B6B9BF" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach video"
                      style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
                    >
                      <MaterialCommunityIcons name="video-outline" size={20} color="#B6B9BF" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Attach audio"
                      style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
                    >
                      <MaterialCommunityIcons name="music-note-outline" size={20} color="#B6B9BF" />
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
                    style={({ pressed }) => [
                      styles.sendBtn,
                      (submitMutation.isPending || draft.trim().length === 0) && styles.sendBtnDisabled,
                      pressed && styles.sendBtnPressed,
                    ]}
                  >
                    {submitMutation.isPending ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                    )}
                  </Pressable>
                </View>

                {submitMutation.isError ? (
                  <Text style={styles.composerError}>
                    Couldn't send your response. Try again.
                  </Text>
                ) : null}
              </View>
            </View>

            <Text style={styles.footerHint}>Other responses are hidden</Text>
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
      <View style={styles.authorCard}>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.authorBody}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.authorName ?? 'Unknown author'}
          </Text>
          <Text style={styles.authorMeta}>{formatRelativeTime(post.createdAt)}</Text>
        </View>
      </View>

      {/* Question */}
      <Text style={styles.question}>{post.caption}</Text>

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
      style={({ pressed }) => [styles.mediaWrap, pressed && styles.mediaWrapPressed]}
    >
      {isImage ? (
        <Image source={{ uri: item.url }} style={styles.mediaImage} resizeMode="cover" />
      ) : (
        <View style={styles.mediaPlaceholder}>
          <MaterialCommunityIcons
            name={item.kind === 'video' ? 'play-circle-outline' : 'music-circle-outline'}
            size={36}
            color="#FFFFFF"
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

const styles = StyleSheet.create({
  flex: { flex: 1 },

  root: {
    flex: 1,
    backgroundColor: '#0B1228',
  },
  // Faked gradient — three absolute layers, decreasing opacity from top to bottom.
  gradientLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  gradientTop: {
    top: 0,
    height: '40%',
    backgroundColor: '#0B1228',
  },
  gradientMid: {
    top: '30%',
    height: '40%',
    backgroundColor: '#13193A',
    opacity: 0.85,
  },
  gradientBottom: {
    bottom: 0,
    height: '40%',
    backgroundColor: '#1A2151',
    opacity: 0.7,
  },

  safe: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: {
    color: '#B6B9BF',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 18,
  },
  timerPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    // RN: monospace via fontFamily on iOS+Android.
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },

  // Author card
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
  authorBody: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  authorMeta: {
    color: '#B6B9BF',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },

  // Question
  question: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.2,
    marginBottom: 16,
  },

  // Media
  mediaWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1A2151',
    marginBottom: 24,
  },
  mediaWrapPressed: {
    opacity: 0.85,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2151',
  },

  // Composer
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 16,
  },
  composerHeader: {
    marginBottom: 12,
  },
  composerHeading: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  composerCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
  },
  inputRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '400',
    minHeight: 36,
    maxHeight: 120,
    padding: 0,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  attachBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtnPressed: {
    opacity: 0.7,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  composerError: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
  },

  // Footer hint
  footerHint: {
    color: '#8A93AE',
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 24,
  },

  // Loading / error
  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  errorWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
