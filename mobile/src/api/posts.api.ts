import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

/**
 * Posts API surface. Mirrors the backend `posts` module:
 *   GET    /posts                       — list visible feed
 *   POST   /posts                       — create a post
 *   GET    /posts/:id                   — single post detail
 *   POST   /posts/:id/reactions         — toggle a reaction
 *   POST   /posts/:id/comments          — add a comment
 *   GET    /posts/:id/responses         — list responses (anonymous mask)
 *   POST   /posts/:id/responses         — submit a response
 *
 * The backend envelope is unwrapped here; callers see only the typed
 * `data` payload.
 */

export type PostMediaItem = {
  id: string;
  url: string;
  mimeType: string;
  order: number;
};

export type DiscussionMeta = {
  postId: string;
  timerMinutes: number;
  revealEndsAt: string;
  revealedAt: string | null;
  revealNotifiedAt: string | null;
};

export type PostStatus = 'active' | 'revealed' | 'deleted';
export type ReactionType = 'like' | 'love' | 'laugh';

/**
 * Author block of a feed summary. Backend currently has no `username`
 * or `avatarUrl` columns on `User` — those fields will land when the
 * profile module does. For now they're always `null`, and the mobile
 * side falls back to an initial-based coloured avatar.
 */
export type PostAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

/**
 * Single post in a feed page. Includes per-viewer fields
 * (`hasReplied`, `viewerReaction`) so the home feed can render the
 * correct badges without a follow-up request per card.
 */
export type PostSummary = {
  id: string;
  author: PostAuthor;
  groupId: string;
  groupName: string;
  caption: string;
  status: PostStatus;
  allowedInteractions: string[];
  createdAt: string;
  media: PostMediaItem[];
  discussionMeta: DiscussionMeta | null;
  reactionCount: number;
  commentCount: number;
  responseCount: number;
  likeCount: number;
  hasReplied: boolean;
  viewerReaction: ReactionType | null;
  viewerLiked: boolean;
};

export type ListPostsParams = {
  groupId?: string;
  cursor?: string;
  limit?: number;
};

export type ListPostsResponse = {
  posts: PostSummary[];
  nextCursor: string | null;
};

export async function listPosts(params: ListPostsParams = {}): Promise<ListPostsResponse> {
  const query: Record<string, string> = {};
  if (params.groupId) query.groupId = params.groupId;
  if (params.cursor) query.cursor = params.cursor;
  if (params.limit) query.limit = String(params.limit);

  return unwrap<ListPostsResponse>(
    apiClient.get<ApiEnvelope<ListPostsResponse>>('/posts', {
      params: Object.keys(query).length > 0 ? query : undefined,
    }),
  );
}

// --- Single post ----------------------------------------------------------

export type PostDetail = {
  id: string;
  authorId: string;
  authorName: string | null;
  groupId: string;
  groupName: string;
  caption: string;
  status: PostStatus;
  allowedInteractions: string[];
  ratingScale: number | null;
  createdAt: string;
  updatedAt: string;
  media: PostMediaItem[];
  discussionMeta: DiscussionMeta | null;
  responseCount: number;
  reactionCount: number;
  commentCount: number;
  likeCount: number;
  viewerReaction: string | null;
  viewerLiked: boolean;
  /** The viewer's own poll selection. Visible before reveal; only the
   *  tallies are withheld until then. */
  viewerPollOptionIds: string[];
  viewerRating: number | null;
};

/** One poll answer. `votes` is null until the post reveals. */
export type PollOption = {
  id: string;
  label: string;
  order: number;
  votes: number | null;
};

export type PollResults = {
  revealed: boolean;
  multiSelect: boolean;
  /** Distinct voters, not row count. Null until reveal. */
  totalVoters: number | null;
  options: PollOption[];
  myOptionIds: string[];
};

export async function getPost(postId: string): Promise<PostDetail> {
  return unwrap<PostDetail>(
    apiClient.get<ApiEnvelope<PostDetail>>(`/posts/${postId}`),
  );
}

// --- Create post ----------------------------------------------------------

/**
 * Inputs for POST /posts.
 *
 * The backend resolves the destination Group from the supplied member-set
 * signature: if a Group with the exact same `memberIds` already exists
 * (owned by this user), the post joins it; otherwise a new Group is
 * materialised on the fly. Clients therefore only need to send the
 * selected people — never a `groupId`.
 */
export type CreatePostInput = {
  /** Selected member user ids. Order-insensitive set on the server side. */
  memberIds?: string[];
  groupId?: string;
  caption: string;
  /** UUIDs of Media rows already uploaded in Phase 3b. */
  mediaIds?: string[];
  timerMinutes: number;
  groupName?: string;
  allowedInteractions?: string[];
  ratingScale?: number | null;
  /** Poll answers in display order. Only sent when 'poll' is enabled. */
  pollOptions?: string[];
  /** Whether one voter may pick several answers. Poll posts only. */
  pollMultiSelect?: boolean;
};

export type CreatedPost = {
  id: string;
  authorId: string;
  groupId: string;
  caption: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  media: PostMediaItem[];
  discussionMeta: DiscussionMeta;
  /** Echo of accepted invitee ids persisted as GroupInvite rows. */
  inviteeIds: string[];
};

export async function createPost(input: CreatePostInput): Promise<CreatedPost> {
  return unwrap<CreatedPost>(
    apiClient.post<ApiEnvelope<CreatedPost>>('/posts', input),
  );
}

// --- Legacy re-exports -----------------------------------------------------
//
// Earlier versions of the composer co-located the `createGroup` helper in
// this file (Phase 3 shape: `{ name, memberIds }`). Group creation has now
// moved to `groups.api.ts` with the new phone-numbers shape; we re-export
// from there so existing composer call-sites continue to resolve a name.
// The shape differs (`memberIds` vs `phoneNumbers`); the composer is the
// source of truth on which it sends.
export { createGroup } from './groups.api';
export type { CreateGroupInput } from './groups.api';

// --- Reactions ------------------------------------------------------------

export type ToggleReactionInput = { type?: string };

export type ToggleReactionResponse = {
  /** Whether the caller is now reacted (after the toggle). */
  reacted: boolean;
  count: number;
  /** Active reaction type. Equal to the input `type` on create, or the
   *  previous type on removal. */
  type: string;
};

export async function toggleReaction(
  postId: string,
  input: ToggleReactionInput = {},
): Promise<ToggleReactionResponse> {
  return unwrap<ToggleReactionResponse>(
    apiClient.post<ApiEnvelope<ToggleReactionResponse>>(
      `/posts/${postId}/reactions`,
      input,
    ),
  );
}

export async function toggleReactionAny(postId: string, type: string): Promise<ToggleReactionResponse> {
  return unwrap<ToggleReactionResponse>(
    apiClient.post<ApiEnvelope<ToggleReactionResponse>>(`/posts/${postId}/reactions-any`, { type }),
  );
}

export type ToggleLikeResponse = { liked: boolean; likeCount: number };

export async function toggleLike(postId: string): Promise<ToggleLikeResponse> {
  return unwrap<ToggleLikeResponse>(
    apiClient.post<ApiEnvelope<ToggleLikeResponse>>(`/posts/${postId}/likes`),
  );
}

/**
 * Replace the viewer's poll answer. Always send the COMPLETE selection —
 * the backend treats it as the full answer, not a delta, so a retry can't
 * double-count. An empty array clears the vote.
 */
export async function votePoll(postId: string, optionIds: string[]) {
  return unwrap<{ optionIds: string[] }>(
    apiClient.post<ApiEnvelope<{ optionIds: string[] }>>(`/posts/${postId}/poll-vote`, {
      optionIds,
    }),
  );
}

export type PostReactors = {
  likes: Array<{ userId: string; name: string | null }>;
  reactions: Array<{ userId: string; name: string | null; emoji: string }>;
};

/**
 * Who liked and who reacted. Reveal-gated server-side — throws while the
 * post is still active, which the caller renders as "hidden until reveal"
 * rather than as an error.
 */
export async function getPostReactors(postId: string): Promise<PostReactors> {
  return unwrap<PostReactors>(
    apiClient.get<ApiEnvelope<PostReactors>>(`/posts/${postId}/reactors`),
  );
}

export async function getPollResults(postId: string): Promise<PollResults> {
  return unwrap<PollResults>(
    apiClient.get<ApiEnvelope<PollResults>>(`/posts/${postId}/poll`),
  );
}

export async function ratePost(postId: string, value: number) {
  return unwrap<unknown>(apiClient.post<ApiEnvelope<unknown>>(`/posts/${postId}/ratings`, { value }));
}

export async function getMyVote(postId: string) {
  return unwrap<{ pollOptionIds: string[]; rating: unknown; reaction: unknown }>(
    apiClient.get<ApiEnvelope<{ pollOptionIds: string[]; rating: unknown; reaction: unknown }>>(
      `/posts/${postId}/my-vote`,
    ),
  );
}

// --- Comments (meta-discussion, never anonymous) --------------------------

export type CreateCommentInput = {
  body: string;
  /** Comment being replied to. Must be on the same post. */
  replyToId?: string | null;
};

/** The comment a reply quotes — everything the quote strip renders. */
export type CommentQuote = {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
};

export type CommentItem = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** Null for a top-level comment, and for a reply whose quoted comment
   *  was deleted. */
  replyTo: CommentQuote | null;
};

export async function createComment(
  postId: string,
  input: CreateCommentInput,
): Promise<CommentItem> {
  return unwrap<CommentItem>(
    apiClient.post<ApiEnvelope<CommentItem>>(`/posts/${postId}/comments`, input),
  );
}

export type ListCommentsResponse = CommentItem[];

/** Comments are meta-discussion, never anonymous — visible pre-reveal unlike responses. */
export async function listComments(postId: string): Promise<ListCommentsResponse> {
  return unwrap<ListCommentsResponse>(
    apiClient.get<ApiEnvelope<ListCommentsResponse>>(`/posts/${postId}/comments`),
  );
}

// --- Responses ------------------------------------------------------------

export type ResponseItem = {
  id: string;
  postId: string;
  authorId: string;
  /** Real name during revealed phase; `Anonymous #N` during active phase
   *  (unless the viewer is the response author — see CLAUDE.md). */
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ListResponsesResponse = ResponseItem[];

export async function listResponses(postId: string): Promise<ListResponsesResponse> {
  return unwrap<ListResponsesResponse>(
    apiClient.get<ApiEnvelope<ListResponsesResponse>>(`/posts/${postId}/responses`),
  );
}

export type SubmitResponseInput = {
  body: string;
  /** Phase 3b: pre-uploaded Media UUIDs. */
  mediaIds?: string[];
};

export type SubmitResponseResponse = ResponseItem;

export async function submitResponse(
  postId: string,
  input: SubmitResponseInput,
): Promise<SubmitResponseResponse> {
  return unwrap<SubmitResponseResponse>(
    apiClient.post<ApiEnvelope<SubmitResponseResponse>>(
      `/posts/${postId}/responses`,
      input,
    ),
  );
}
