import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { cacheDel, cacheDelPattern, cacheGetOrSet } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import type {
  CreatePostInput,
  CreatePostResult,
  ListResponsesResult,
  PostDetail,
  PostDiscussionMeta,
  PostMediaItem,
  ResponseItem,
  SubmitResponseInput,
} from './posts.types.js';

/**
 * Posts module — business logic.
 *
 * Per CLAUDE.md: business logic lives here, not in the controllers.
 * Controllers only translate HTTP <-> service inputs and shape the envelope.
 *
 * Visibility rules (server-side enforced — the schema is uniform, access
 * control lives in this layer):
 *   - createPost:  viewer must be a member of the target group
 *   - getPost:     viewer must be a member of the post's group
 *   - listResponses: viewer must be a group member AND post must be revealed
 *                    (or viewer is the author)
 *   - submitResponse: viewer must be a group member; allowed during both
 *                     active and revealed phases (responses are just hidden
 *                     from non-author viewers before reveal)
 */

/**
 * Create a post + discussion-meta + post-media rows + bump group activity,
 * all in a single transaction so a half-created post never surfaces.
 */
export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const { authorId, groupId, caption, mediaIds, timerMinutes } = input;

  // Validate group membership. The author is auto-added on group creation,
  // so for normal flow this is always true — but a member row could have
  // been deleted out-of-band, so we still check.
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: authorId } },
    select: { groupId: true },
  });
  if (!membership) {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member of this group');
  }

  // Verify the group exists at all (membership existence implies this, but
  // a defensive check gives a clean 404 vs a FK error).
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) {
    throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Group not found');
  }

  const now = new Date();
  const revealEndsAt = new Date(now.getTime() + timerMinutes * 60 * 1000);

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId,
        groupId,
        caption,
        status: 'active',
        media: {
          create: mediaIds.map((mediaId, idx) => ({ mediaId, order: idx })),
        },
        discussionMeta: {
          create: { timerMinutes, revealEndsAt },
        },
      },
      include: {
        media: { include: { media: true }, orderBy: { order: 'asc' } },
        discussionMeta: true,
      },
    });

    await tx.group.update({
      where: { id: groupId },
      data: { lastActivityAt: now },
    });

    return created;
  });

  const mediaItems: PostMediaItem[] = post.media.map((pm) => ({
    id: pm.media.id,
    url: pm.media.url,
    mimeType: pm.media.mimeType,
    order: pm.order,
  }));

  // discussionMeta is non-null on a freshly created post (we created it above
  // via nested write). The `!` is safe but expressed defensively for TS.
  if (!post.discussionMeta) {
    throw new AppError(500, ErrorCode.INTERNAL, 'Post created without discussion meta');
  }

  const meta: PostDiscussionMeta = {
    postId: post.discussionMeta.postId,
    timerMinutes: post.discussionMeta.timerMinutes,
    revealEndsAt: post.discussionMeta.revealEndsAt,
    revealedAt: post.discussionMeta.revealedAt,
    revealNotifiedAt: post.discussionMeta.revealNotifiedAt,
  };

  // Lifecycle event — emitted after the transaction commits so we never
  // log a post that didn't actually persist.
  logger.info(
    { postId: post.id, authorId: post.authorId, groupId: post.groupId },
    'post created',
  );

  return {
    id: post.id,
    authorId: post.authorId,
    groupId: post.groupId,
    caption: post.caption,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    media: mediaItems,
    discussionMeta: meta,
  };
}

/**
 * Fetch a post with viewer-scoped data: counts and the viewer's own
 * reaction (if any). Visibility: viewer must be in the post's group.
 *
 * Caching: per-viewer cache key (`cache:post:${postId}:viewer:${viewerId}`)
 * with 30s TTL. The viewerReaction field is per-viewer so the key must
 * include viewerId — without it, viewer A's reaction would leak to viewer B.
 * 30s is short because reactions/responses can land at any time; the cache
 * absorbs the "pull-to-refresh" hammering case without serving truly stale
 * data for long.
 */
export async function getPost(viewerId: string, postId: string): Promise<PostDetail> {
  return cacheGetOrSet(
    `cache:post:${postId}:viewer:${viewerId}`,
    30,
    () => loadPostFromDb(viewerId, postId),
  );
}

async function loadPostFromDb(viewerId: string, postId: string): Promise<PostDetail> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
      media: { include: { media: true }, orderBy: { order: 'asc' } },
      discussionMeta: true,
      _count: { select: { responses: true, reactions: true, comments: true } },
    },
  });

  if (!post) {
    throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member of this group');
  }

  const viewerReactionRow = await prisma.reaction.findUnique({
    where: { postId_userId: { postId, userId: viewerId } },
    select: { type: true },
  });

  const media: PostMediaItem[] = post.media.map((pm) => ({
    id: pm.media.id,
    url: pm.media.url,
    mimeType: pm.media.mimeType,
    order: pm.order,
  }));

  const meta: PostDiscussionMeta | null = post.discussionMeta
    ? {
        postId: post.discussionMeta.postId,
        timerMinutes: post.discussionMeta.timerMinutes,
        revealEndsAt: post.discussionMeta.revealEndsAt,
        revealedAt: post.discussionMeta.revealedAt,
        revealNotifiedAt: post.discussionMeta.revealNotifiedAt,
      }
    : null;

  return {
    id: post.id,
    authorId: post.authorId,
    authorName: post.author.name,
    groupId: post.groupId,
    groupName: post.group.name,
    caption: post.caption,
    status: post.status,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    media,
    discussionMeta: meta,
    responseCount: post._count.responses,
    reactionCount: post._count.reactions,
    commentCount: post._count.comments,
    viewerReaction: viewerReactionRow?.type ?? null,
  };
}

/**
 * List responses for a post.
 *
 * Visibility: viewer must be a group member AND the post must be revealed,
 * UNLESS the viewer is the author (authors can see their own responses
 * during the discussion phase — that's the whole point).
 */
export async function listResponses(
  viewerId: string,
  postId: string,
): Promise<ListResponsesResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, groupId: true, status: true },
  });

  if (!post) {
    throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member of this group');
  }

  const isAuthor = post.authorId === viewerId;
  if (post.status === 'active' && !isAuthor) {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'Responses are hidden until reveal');
  }

  const rows = await prisma.response.findMany({
    where: { postId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(
    (r): ResponseItem => ({
      id: r.id,
      postId: r.postId,
      authorId: r.authorId,
      authorName: r.author.name,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }),
  );
}

/**
 * Submit a response. Allowed during both active and revealed phases — the
 * response is just hidden from non-author viewers before reveal. The author
 * themselves always sees their own responses (and others' if revealed).
 */
export async function submitResponse(input: SubmitResponseInput): Promise<ResponseItem> {
  const { viewerId, postId, body } = input;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, groupId: true },
  });

  if (!post) {
    throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member of this group');
  }

  const created = await prisma.response.create({
    data: { postId, authorId: viewerId, body },
    include: { author: { select: { name: true } } },
  });

  // Invalidate caches affected by a new response: the response-list cache
  // (any viewer) and this viewer's cached post detail (responseCount changed).
  // cacheDel swallows errors, so this is fire-and-forget.
  await cacheDelPattern(`cache:post:${postId}:responses:*`);
  await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);

  logger.info(
    { responseId: created.id, postId, authorId: viewerId },
    'response submitted',
  );

  return {
    id: created.id,
    postId: created.postId,
    authorId: created.authorId,
    authorName: created.author.name,
    body: created.body,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}
