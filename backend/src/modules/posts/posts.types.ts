/**
 * Public types of the posts module. Kept narrow on purpose: only what
 * crosses module boundaries (controller output, service inputs).
 */

export type PostMediaItem = {
  id: string;
  url: string;
  mimeType: string;
  order: number;
};

export type PostDiscussionMeta = {
  postId: string;
  timerMinutes: number;
  revealEndsAt: Date;
  revealedAt: Date | null;
  revealNotifiedAt: Date | null;
};

/**
 * Author block on a feed summary. Mirrors the mobile PostAuthor shape so
 * PostCard renders without re-fetching. `username` and `avatarUrl` will
 * land when the profile module does — for now they're always null.
 */
export type PostAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type PostDetail = {
  id: string;
  authorId: string;
  authorName: string | null;
  groupId: string;
  groupName: string;
  caption: string;
  status: string;
  allowedInteractions: string[];
  ratingScale: number | null;
  createdAt: Date;
  updatedAt: Date;
  media: PostMediaItem[];
  discussionMeta: PostDiscussionMeta | null;
  responseCount: number;
  reactionCount: number;
  commentCount: number;
  likeCount: number;
  viewerReaction: string | null;
  viewerLiked: boolean;
  /** The viewer's own poll selection. Empty when they haven't voted.
   *  Always returned — only the tallies are gated until reveal. */
  viewerPollOptionIds: string[];
  viewerRating: number | null;
};

/**
 * Feed-row shape returned by GET /posts. Counts only — bodies are NEVER
 * included here. Per the product rule, no response / comment body may
 * leave the server while the post is in the 'active' phase; this type
 * is what stays safe to ship before reveal.
 */
export type PostSummary = {
  id: string;
  author: PostAuthor;
  groupId: string;
  groupName: string;
  caption: string;
  status: string;
  allowedInteractions: string[];
  ratingScale: number | null;
  createdAt: Date;
  media: PostMediaItem[];
  discussionMeta: PostDiscussionMeta | null;
  reactionCount: number;
  responseCount: number;
  commentCount: number;
  likeCount: number;
  hasReplied: boolean;
  viewerReaction: string | null;
  viewerLiked: boolean;
};

export type ResponseItem = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePostInput = {
  authorId: string;
  /**
   * Legacy flow: caller already picked a group. Provide exactly one of
   * `groupId` or `memberIds` (validation lives at the controller).
   */
  groupId?: string;
  /**
   * Preferred flow: pass the people you want to share with and the
   * service finds-or-creates a group whose member set matches. Two
   * posts with the same memberIds resolve to the same group, so the
   * client doesn't have to manage group identity.
   */
  memberIds?: string[];
  caption: string;
  mediaIds: string[];
  timerMinutes: number;
  groupName?: string;
  allowedInteractions?: string[];
  ratingScale?: number | null;
  /** Answer labels, in display order. Poll posts only. */
  pollOptions?: string[];
  /** Whether one voter may pick several answers. Poll posts only. */
  pollMultiSelect?: boolean;
};

export type CreatePostResult = {
  id: string;
  authorId: string;
  groupId: string;
  caption: string;
  status: string;
  allowedInteractions: string[];
  ratingScale: number | null;
  createdAt: Date;
  updatedAt: Date;
  media: PostMediaItem[];
  discussionMeta: PostDiscussionMeta;
};

export type SubmitResponseInput = {
  viewerId: string;
  postId: string;
  body: string;
};

export type ListResponsesResult = ResponseItem[];

/**
 * GET /posts query input. The cursor is opaque to the client (we encode
 * the (createdAt, id) pair); the service decodes it for the WHERE clause.
 */
export type ListPostsInput = {
  viewerId: string;
  groupId?: string;
  cursor?: string;
  limit: number;
};

export type ListPostsResult = {
  posts: PostSummary[];
  nextCursor: string | null;
};

// --- Comments ---------------------------------------------------------------

/**
 * The comment a reply quotes. Only what the quote strip needs — enough to
 * render the preview without a second fetch, and nothing more.
 */
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
  createdAt: Date;
  updatedAt: Date;
  /** Null for a top-level comment, and also for a reply whose quoted
   *  comment has since been deleted (the FK is ON DELETE SET NULL). */
  replyTo: CommentQuote | null;
};

export type CreateCommentInput = {
  viewerId: string;
  postId: string;
  body: string;
  /** Comment being replied to. Must belong to the same post. */
  replyToId?: string | null;
};

export type ListCommentsResult = CommentItem[];

// --- Poll / Rating / Reactions --------------------------------------------

/** One answer on a poll. `votes` is null until the post reveals. */
export type PollOptionItem = {
  id: string;
  label: string;
  order: number;
  votes: number | null;
};

export type PollResults = {
  revealed: boolean;
  multiSelect: boolean;
  /** Distinct voters, not row count — a multi-select poll has more rows
   *  than people. Null until reveal. */
  totalVoters: number | null;
  options: PollOptionItem[];
  /** The requesting viewer's own selection; visible before reveal. */
  myOptionIds: string[];
};

export type PollVoteItem = {
  optionId: string;
  postId: string;
  userId: string;
  createdAt: Date;
};

export type RatingItem = {
  postId: string;
  userId: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VoteInput = {
  viewerId: string;
  postId: string;
  value: 'yes' | 'no';
};

export type RatingInput = {
  viewerId: string;
  postId: string;
  value: number;
};

export type ReactionInput = {
  viewerId: string;
  postId: string;
  type: string; // single emoji
};
