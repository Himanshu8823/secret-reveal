import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

/**
 * Mirrors the backend `post` shape returned by `GET /groups/:id/posts`.
 * `media` is intentionally omitted from the list response — the API returns
 * it but the list view doesn't render it. Keep this type lean so we don't
 * pull thumbnails we won't display.
 */
export type PostSummary = {
  id: string;
  authorId: string;
  authorName: string | null;
  groupId: string;
  caption: string;
  status: 'active' | 'revealed' | 'deleted';
  createdAt: string;
  responseCount: number;
  reactionCount: number;
  commentCount: number;
};

export type ListPostsResponse = {
  posts: PostSummary[];
  nextCursor: string | null;
};

export async function listGroupPosts(
  groupId: string,
  cursor?: string,
): Promise<ListPostsResponse> {
  const params = cursor ? { cursor } : {};
  return unwrap<ListPostsResponse>(
    apiClient.get<ApiEnvelope<ListPostsResponse>>(`/groups/${groupId}/posts`, { params }),
  );
}

// ---------------------------------------------------------------------------
// Create Post (Phase 3 composer)
// ---------------------------------------------------------------------------

export type CreatePostInput = {
  groupId: string;
  caption: string;
  mediaIds: string[];
  timerMinutes: number;
};

export type CreatedPost = {
  id: string;
  authorId: string;
  groupId: string;
  caption: string;
  status: 'active' | 'revealed' | 'deleted';
  createdAt: string;
};

export async function createPost(input: CreatePostInput): Promise<CreatedPost> {
  return unwrap(
    apiClient.post<ApiEnvelope<CreatedPost>>('/posts', input),
  );
}

// ---------------------------------------------------------------------------
// Group creation (used by the Create Post flow — Phase 3 always creates
// a fresh group; reusing an existing group is a v1.1 polish). Co-located
// here so the composer screens don't depend on a separate file.
// ---------------------------------------------------------------------------

export type CreateGroupInput = {
  name: string;
  memberIds: string[];
};

export type CreatedGroup = {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
};

export async function createGroup(input: CreateGroupInput): Promise<CreatedGroup> {
  return unwrap(
    apiClient.post<ApiEnvelope<CreatedGroup>>('/groups', input),
  );
}

// ---------------------------------------------------------------------------
// Post detail + responses (Phase 4 — Hidden Discussion screen)
// ---------------------------------------------------------------------------

export type PostMediaItem = {
  id: string;
  url: string;
  kind: 'image' | 'video' | 'audio';
};

export type DiscussionMeta = {
  status: 'active' | 'revealed';
  revealEndsAt: string | null;
  remainingMs: number;
};

export type PostDetail = {
  id: string;
  authorId: string;
  authorName: string | null;
  groupId: string;
  groupName: string | null;
  caption: string;
  media: PostMediaItem[];
  discussionMeta: DiscussionMeta;
  responseCount: number;
  reactionCount: number;
  commentCount: number;
  createdAt: string;
};

export async function getPost(postId: string): Promise<PostDetail> {
  return unwrap(
    apiClient.get<ApiEnvelope<PostDetail>>(`/posts/${postId}`),
  );
}

export type SubmitResponseInput = { body: string };

export type SubmittedResponse = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export async function submitResponse(
  postId: string,
  input: SubmitResponseInput,
): Promise<SubmittedResponse> {
  return unwrap(
    apiClient.post<ApiEnvelope<SubmittedResponse>>(`/posts/${postId}/responses`, input),
  );
}
