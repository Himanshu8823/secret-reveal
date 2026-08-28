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

export type PostDetail = {
  id: string;
  authorId: string;
  authorName: string | null;
  groupId: string;
  groupName: string;
  caption: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  media: PostMediaItem[];
  discussionMeta: PostDiscussionMeta | null;
  responseCount: number;
  reactionCount: number;
  commentCount: number;
  viewerReaction: string | null;
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
  groupId: string;
  caption: string;
  mediaIds: string[];
  timerMinutes: number;
};

export type CreatePostResult = {
  id: string;
  authorId: string;
  groupId: string;
  caption: string;
  status: string;
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
