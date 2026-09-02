import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { cacheDel, cacheDelPattern, cacheGetOrSet } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { findOrCreateGroupByMembers } from '../groups/groups.service.js';
import { createNotification } from '../notifications/notifications.service.js';
import { RATING_SCALE } from './posts.validation.js';
import type {
  CommentItem,
  CreateCommentInput,
  CreatePostInput,
  CreatePostResult,
  ListCommentsResult,
  ListPostsInput,
  ListPostsResult,
  ListResponsesResult,
  PostAuthor,
  PostDetail,
  PostDiscussionMeta,
  PostMediaItem,
  PostSummary,
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
 *   - createPost:     viewer must be a member of the target group
 *   - getPost:        viewer must be a member of the post's group
 *   - listResponses:  viewer must be a group member AND post must be revealed.
 *                     Nobody — not even the author — sees responses before
 *                     reveal. The author exemption was removed per the
 *                     product rule ("Reveal hone tak jo bhi comments hai
 *                     vo nahi dikhenge").
 *   - submitResponse: viewer must be a group member; allowed during both
 *                     active and revealed phases (responses are just hidden
 *                     from all viewers before reveal)
 *   - listComments:   same gate as listResponses — bodies hidden until
 *                     status='revealed'.
 *   - createComment:  viewer must be a group member; allowed during both
 *                     phases.
 *   - listPosts:      viewer must be a member of every group included in
 *                     the feed. Counts only — bodies never leave the server.
 */

/**
 * Create a post + discussion-meta + post-media rows + bump group activity,
 * all in a single transaction so a half-created post never surfaces.
 *
 * Two audience paths:
 *
 * - memberIds: resolve the group via findOrCreateGroupByMembers (preferred).
 *   The membership rows are inserted by that helper, so the post transaction
 *   only writes the post itself.
 * - groupId: legacy flow — caller already picked a group; we just verify
 *   membership and write the post in that group.
 *
 * Validation has already ensured exactly one of these is set; we re-check
 * defensively here so an internal call (e.g. from a test) with both set
 * fails loudly instead of silently picking one.
 */
export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const {
    authorId,
    groupId,
    memberIds,
    caption,
    mediaIds,
    timerMinutes,
    allowedInteractions,
    ratingScale,
    pollOptions,
    pollMultiSelect,
  } = input;

  const isPoll = (allowedInteractions ?? []).includes('poll');

  if (Boolean(groupId) === Boolean(memberIds && memberIds.length > 0)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      'Provide exactly one of groupId or memberIds',
    );
  }

  // Resolve the target group up front. For memberIds we go through the
  // find-or-create helper, which both locates an existing group for the
  // same member set and (when missing) inserts the membership rows in
  // its own transaction. customName is the compulsory Group name from the UI.
  let resolvedGroupId: string;
  if (memberIds && memberIds.length > 0) {
    const { group } = await findOrCreateGroupByMembers({
      creatorId: authorId,
      memberIds,
      customName: input.groupName,
    });
    resolvedGroupId = group.id;
  } else {
    // Type narrowing: validation guarantees groupId is set here, but TS
    // doesn't carry the refinement through the boolean expression above.
    if (!groupId) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_FAILED,
        'groupId is required when memberIds is not provided',
      );
    }
    resolvedGroupId = groupId;

    // Legacy flow: verify membership + group existence. Membership is
    // normally always present (creator is auto-added), but a stale row
    // would otherwise fall through with a confusing FK error.
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: resolvedGroupId, userId: authorId } },
      select: { groupId: true },
    });
    if (!membership) {
      throw new AppError(
        403,
        ErrorCode.VALIDATION_FAILED,
        'You are not a member of this group',
      );
    }

    const group = await prisma.group.findUnique({
      where: { id: resolvedGroupId },
      select: { id: true },
    });
    if (!group) {
      throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Group not found');
    }
  }

  const now = new Date();
  const revealEndsAt = new Date(now.getTime() + timerMinutes * 60 * 1000);

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId,
        groupId: resolvedGroupId,
        caption,
        status: 'active',
        allowedInteractions: allowedInteractions ?? [],
        ratingScale: ratingScale ?? null,
        // Only set alongside a poll; null everywhere else so the column
        // never implies a mode a non-poll post doesn't have.
        pollMultiSelect: isPoll ? (pollMultiSelect ?? false) : null,
        media: {
          create: mediaIds.map((mediaId, idx) => ({ mediaId, order: idx })),
        },
        // Options are written in the same transaction as the post: a poll
        // that exists without its answers is not a usable post.
        ...(isPoll
          ? {
              pollOptions: {
                create: (pollOptions ?? []).map((label, idx) => ({
                  label,
                  order: idx,
                })),
              },
            }
          : {}),
        discussionMeta: {
          create: { timerMinutes, revealEndsAt },
        },
      },
      include: {
        media: { include: { media: true }, orderBy: { order: 'asc' } },
        discussionMeta: true,
        pollOptions: { orderBy: { order: 'asc' } },
      },
    });

    await tx.group.update({
      where: { id: resolvedGroupId },
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
    allowedInteractions: (post as unknown as { allowedInteractions: string[] }).allowedInteractions ?? [],
    ratingScale: (post as unknown as { ratingScale: number | null }).ratingScale ?? null,
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
      _count: { select: { responses: true, reactions: true, comments: true, postLikes: true } },
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

  const [viewerReactionRow, viewerPollRows, viewerRatingRow, viewerLikeRow] = await Promise.all([
    prisma.reaction.findUnique({
      where: { postId_userId: { postId, userId: viewerId } },
      select: { type: true },
    }),
    // The viewer's own selection is safe to return before reveal — it is
    // their own answer. Only the tallies are withheld (getPollResults).
    prisma.pollVote.findMany({
      where: { postId, userId: viewerId },
      select: { optionId: true },
    }),
    prisma.rating.findUnique({
      where: { postId_userId: { postId, userId: viewerId } },
      select: { value: true },
    }),
    prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: viewerId } },
      select: { postId: true },
    }),
  ]);

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
    allowedInteractions: (post as unknown as { allowedInteractions: string[] }).allowedInteractions ?? [],
    ratingScale: (post as unknown as { ratingScale: number | null }).ratingScale ?? null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    media,
    discussionMeta: meta,
    responseCount: post._count.responses,
    reactionCount: post._count.reactions,
    commentCount: post._count.comments,
    likeCount: post._count.postLikes,
    viewerReaction: viewerReactionRow?.type ?? null,
    viewerLiked: viewerLikeRow != null,
    viewerPollOptionIds: viewerPollRows.map((r) => r.optionId),
    viewerRating: viewerRatingRow?.value ?? null,
  };
}

/**
 * List responses for a post.
 *
 * Visibility: viewer must be a group member AND the post must be revealed.
 * NOBODY — not even the author — sees responses before reveal. The author
 * exemption was removed per the product rule: "Reveal hone tak jo bhi
 * comments hai vo nahi dikhenge — ek bhi comment nahi dikhega us post par,
 * jab reveal hoga tab dikhega." Bodies must never leave the server during
 * the active phase; client-side masking is not an option.
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

  if (post.status === 'active') {
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
 * response is hidden from ALL viewers before reveal (the listResponses
 * gate enforces this server-side). Write-side is intentionally permissive
 * so the discussion phase still collects responses; the visibility
 * control lives at the read path.
 */
export async function submitResponse(input: SubmitResponseInput): Promise<ResponseItem> {
  const { viewerId, postId, body } = input;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, groupId: true, authorId: true },
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

  // Notify the post author — generic, pre-reveal-safe text only. Never
  // leak the response body or responder identity before reveal; the
  // notification itself must respect the same hiding rule as the API.
  if (post.authorId !== viewerId) {
    void createNotification({
      userId: post.authorId,
      type: 'response',
      title: 'New response',
      body: 'Someone responded to your post.',
      postId,
    }).catch((err) => logger.error({ err, postId }, 'failed to create response notification'));
  }

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

// ---------------------------------------------------------------------------
// Feed (GET /posts)
// ---------------------------------------------------------------------------

/**
 * Decode a base64 cursor produced by listPosts into the (createdAt, id)
 * pair it represents. Returns undefined on any failure — a bad cursor
 * silently restarts pagination from the top (the client gets a fresh
 * first page instead of a 400, which would be a worse experience than
 * silently re-syncing).
 */
function decodeListPostsCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof decoded.t === 'string' && typeof decoded.i === 'string') {
      return { createdAt: new Date(decoded.t), id: decoded.i };
    }
  } catch {
    // fall through — bad cursor treated as "no cursor"
  }
  return undefined;
}

/**
 * List posts visible to the viewer — the home feed and per-group feeds.
 *
 * The viewer scope is "posts in groups the viewer is a member of". We
 * resolve membership once and pass the groupId set into the WHERE clause;
 * this avoids an N+1 (one membership lookup per post) without needing
 * a join across GroupMember.
 *
 * Optional `groupId` filter narrows the result to a single group. We
 * still verify the viewer is a member of that group — without that
 * check, a non-member could enumerate another group's post list by id.
 *
 * Counts only — never bodies. The PostSummary shape intentionally
 * excludes response / comment bodies so we can't accidentally leak
 * pre-reveal content through this endpoint.
 *
 * Cursor pagination on (createdAt, id) DESC. The cursor is opaque to
 * the client (we base64 the pair). Fetch limit+1 to detect the next
 * page without a second query.
 */
export async function listPosts(input: ListPostsInput): Promise<ListPostsResult> {
  const { viewerId, groupId, cursor, limit } = input;

  if (groupId) {
    // Per-group feed: must be a member.
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: viewerId } },
      select: { groupId: true },
    });
    if (!membership) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a member of this group');
    }
  }

  const cursorClause = decodeListPostsCursor(cursor);

  // Without a groupId filter we resolve the viewer's member groups up front.
  // (groupId case: we don't need this — the single groupId is the scope.)
  const viewerGroupIds = groupId
    ? [groupId]
    : (
        await prisma.groupMember.findMany({
          where: { userId: viewerId },
          select: { groupId: true },
        })
      ).map((m) => m.groupId);

  if (viewerGroupIds.length === 0) {
    return { posts: [], nextCursor: null };
  }

  const rows = await prisma.post.findMany({
    where: {
      groupId: { in: viewerGroupIds },
      status: { not: 'deleted' },
      ...(cursorClause
        ? {
            OR: [
              { createdAt: { lt: cursorClause.createdAt } },
              {
                createdAt: cursorClause.createdAt,
                id: { lt: cursorClause.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
      media: { include: { media: true }, orderBy: { order: 'asc' } },
      discussionMeta: true,
      _count: { select: { responses: true, reactions: true, comments: true, postLikes: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ t: last.createdAt.toISOString(), i: last.id }),
        ).toString('base64')
      : null;

  // Per-viewer flags: hasReplied (any Response row from this viewer) and
  // viewerReaction. Done in one IN-query per flag to avoid N+1.
  const postIds = page.map((p) => p.id);
  const viewerResponses =
    postIds.length === 0
      ? []
      : await prisma.response.findMany({
          where: { postId: { in: postIds }, authorId: viewerId },
          select: { postId: true },
        });
  const viewerReactions =
    postIds.length === 0
      ? []
      : await prisma.reaction.findMany({
          where: { postId: { in: postIds }, userId: viewerId },
          select: { postId: true, type: true },
        });
  const viewerLikes =
    postIds.length === 0
      ? []
      : await prisma.postLike.findMany({
          where: { postId: { in: postIds }, userId: viewerId },
          select: { postId: true },
        });
  const hasRepliedByPost = new Set(viewerResponses.map((r) => r.postId));
  const reactionByPost = new Map(viewerReactions.map((r) => [r.postId, r.type]));
  const likedByPost = new Set(viewerLikes.map((l) => l.postId));

  const posts: PostSummary[] = page.map((p) => {
    const media: PostMediaItem[] = p.media.map((pm) => ({
      id: pm.media.id,
      url: pm.media.url,
      mimeType: pm.media.mimeType,
      order: pm.order,
    }));
    const meta: PostDiscussionMeta | null = p.discussionMeta
      ? {
          postId: p.discussionMeta.postId,
          timerMinutes: p.discussionMeta.timerMinutes,
          revealEndsAt: p.discussionMeta.revealEndsAt,
          revealedAt: p.discussionMeta.revealedAt,
          revealNotifiedAt: p.discussionMeta.revealNotifiedAt,
        }
      : null;
    const author: PostAuthor = {
      id: p.author.id,
      name: p.author.name,
      username: null,
      avatarUrl: null,
    };
    return {
      id: p.id,
      author,
      groupId: p.groupId,
      groupName: p.group.name,
      caption: p.caption,
      status: p.status,
      allowedInteractions: (p as unknown as { allowedInteractions: string[] }).allowedInteractions ?? [],
      ratingScale: (p as unknown as { ratingScale: number | null }).ratingScale ?? null,
      createdAt: p.createdAt,
      media,
      discussionMeta: meta,
      reactionCount: p._count.reactions,
      responseCount: p._count.responses,
      commentCount: p._count.comments,
      likeCount: p._count.postLikes,
      hasReplied: hasRepliedByPost.has(p.id),
      viewerReaction: reactionByPost.get(p.id) ?? null,
      viewerLiked: likedByPost.has(p.id),
    };
  });

  return { posts, nextCursor };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/**
 * Post-comment gate helper. Returns the post's status and groupId if the
 * viewer is a member; throws otherwise. Used by both listComments and
 * createComment — single source of truth for the membership check.
 */
async function loadPostForCommentGate(
  viewerId: string,
  postId: string,
): Promise<{ status: string; groupId: string; authorId: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, groupId: true, status: true, authorId: true },
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
  return { status: post.status, groupId: post.groupId, authorId: post.authorId };
}

/**
 * List comments for a post.
 *
 * Visibility: viewer must be a group member AND the post must be revealed.
 * Same gate as listResponses — no author exemption. The product rule
 * ("ek bhi comment nahi dikhega us post par, jab reveal hoga tab dikhega")
 * applies to comments too.
 */
export async function listComments(
  viewerId: string,
  postId: string,
): Promise<ListCommentsResult> {
  const { status } = await loadPostForCommentGate(viewerId, postId);

  if (status === 'active') {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'Comments are hidden until reveal');
  }

  const rows = await prisma.comment.findMany({
    where: { postId },
    include: {
      author: { select: { name: true } },
      // The quoted comment is embedded rather than left to the client to
      // resolve: a reply whose parent sits on an unloaded page would
      // otherwise render an empty quote. One join here beats the client
      // guessing.
      replyTo: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(
    (c): CommentItem => ({
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      authorName: c.author.name,
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      replyTo: c.replyTo
        ? {
            id: c.replyTo.id,
            authorId: c.replyTo.authorId,
            authorName: c.replyTo.author.name,
            body: c.replyTo.body,
          }
        : null,
    }),
  );
}

/**
 * Create a comment. Allowed during both active and revealed phases — the
 * comment is just hidden from all viewers before reveal. Same write-side
 * contract as submitResponse.
 */
export async function createComment(input: CreateCommentInput): Promise<CommentItem> {
  const { viewerId, postId, body, replyToId } = input;

  // Gate on membership; we deliberately do NOT gate on status — comments
  // are writable during the discussion phase, only the list is gated.
  const gate = await loadPostForCommentGate(viewerId, postId);

  // A reply must quote a comment on THIS post. Without the postId check a
  // caller could quote a comment from a post they can't even see, and the
  // quoted body would then be served back to them through this thread.
  if (replyToId) {
    const parent = await prisma.comment.findFirst({
      where: { id: replyToId, postId },
      select: { id: true },
    });
    if (!parent) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Replied-to comment not found on this post');
    }
  }

  const created = await prisma.comment.create({
    data: { postId, authorId: viewerId, body, replyToId: replyToId ?? null },
    include: {
      author: { select: { name: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          authorId: true,
          author: { select: { name: true } },
        },
      },
    },
  });

  logger.info(
    { commentId: created.id, postId, authorId: viewerId },
    'comment created',
  );

  // Notify the post author — generic, pre-reveal-safe text only. Same
  // privacy posture as submitResponse: never leak the comment body or
  // commenter identity before reveal.
  if (gate.authorId !== viewerId) {
    void createNotification({
      userId: gate.authorId,
      type: 'comment',
      title: 'New comment',
      body: 'Someone commented on your post.',
      postId,
    }).catch((err) => logger.error({ err, postId }, 'failed to create comment notification'));
  }

  // Whoever was replied to also gets told — unless they're the replier, or
  // the post author who was already notified just above (one event, one
  // notification). Same generic wording: no body, no identity.
  const quotedAuthorId = created.replyTo?.authorId;
  if (quotedAuthorId && quotedAuthorId !== viewerId && quotedAuthorId !== gate.authorId) {
    void createNotification({
      userId: quotedAuthorId,
      type: 'comment',
      title: 'New reply',
      body: 'Someone replied to your comment.',
      postId,
    }).catch((err) => logger.error({ err, postId }, 'failed to create reply notification'));
  }

  return {
    id: created.id,
    postId: created.postId,
    authorId: created.authorId,
    authorName: created.author.name,
    body: created.body,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    replyTo: created.replyTo
      ? {
          id: created.replyTo.id,
          authorId: created.replyTo.authorId,
          authorName: created.replyTo.author.name,
          body: created.replyTo.body,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Reveal worker
// ---------------------------------------------------------------------------

/**
 * Flip every post whose DiscussionMeta.revealEndsAt has passed from
 * 'active' to 'revealed'. Runs periodically via the reveal worker
 * (backend/src/workers/revealWorker.ts).
 *
 * One transaction per post — atomic update of both Post.status and
 * DiscussionMeta.revealedAt. We do this post-by-post rather than as a
 * single batch UPDATE because:
 *   1. the sweep should be resilient: one bad row doesn't roll back the
 *      whole batch.
 *   2. the upcoming `revealNotifiedAt` notification sweep (Phase 3b+)
 *      needs per-post granularity anyway.
 *
 * Returns the array of post ids just revealed, so the worker can hand
 * them to the notification job without re-querying. Reveal-only —
 * notifications live elsewhere.
 */
export async function revealDuePosts(now: Date = new Date()): Promise<string[]> {
  // Find candidates first — we want to log the count and hand the ids
  // to whoever cares (currently the worker, soon the notifier). Pull
  // groupId + caption here too so the per-post notification fan-out below
  // doesn't need a second round trip per post.
  const candidates = await prisma.post.findMany({
    where: {
      status: 'active',
      discussionMeta: { revealEndsAt: { lte: now }, revealedAt: null },
    },
    select: { id: true, groupId: true, caption: true },
  });

  const revealed: string[] = [];
  const revealedMeta = new Map<string, { groupId: string; caption: string }>();
  for (const { id, groupId, caption } of candidates) {
    // Per-post atomic update. updateMany with the same WHERE keeps it
    // idempotent — a concurrent sweeper (e.g. another instance) that
    // already flipped the row just no-ops.
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.updateMany({
        where: {
          id,
          status: 'active',
          discussionMeta: { revealEndsAt: { lte: now }, revealedAt: null },
        },
        data: { status: 'revealed' },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.discussionMeta.update({
        where: { postId: id },
        data: { revealedAt: now },
      });
      return true;
    });

    if (result) {
      revealed.push(id);
      revealedMeta.set(id, { groupId, caption });
      // Invalidate the cached post-detail for every viewer of this post.
      // We don't know the viewer set here; the cache key includes the
      // viewer id so pattern-delete covers them all.
      await cacheDelPattern(`cache:post:${id}:*`);
    }
  }

  if (revealed.length > 0) {
    logger.info({ count: revealed.length, postIds: revealed }, 'posts revealed by timer');

    // Notify every member of every affected group. One batched query for
    // all revealed posts' groups (not per-post) to avoid N+1s, then a
    // fan-out of best-effort createNotification calls. A notification
    // failure here must never re-fail the reveal itself — the posts are
    // already committed 'revealed' by this point.
    const groupIds = [...new Set([...revealedMeta.values()].map((m) => m.groupId))];
    const members = await prisma.groupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, userId: true },
    });
    const membersByGroup = new Map<string, string[]>();
    for (const m of members) {
      const list = membersByGroup.get(m.groupId) ?? [];
      list.push(m.userId);
      membersByGroup.set(m.groupId, list);
    }

    for (const postId of revealed) {
      const meta = revealedMeta.get(postId);
      if (!meta) continue;
      const captionSnippet =
        meta.caption.length > 200 ? `${meta.caption.slice(0, 200)}…` : meta.caption;
      const recipients = membersByGroup.get(meta.groupId) ?? [];
      for (const userId of recipients) {
        void createNotification({
          userId,
          type: 'reveal',
          title: 'Results are in',
          body: captionSnippet,
          postId,
        }).catch((err) => logger.error({ err, postId, userId }, 'failed to create reveal notification'));
      }
    }
  }

  return revealed;
}

// ---------------------------------------------------------------------------
// Poll / Rating / Reactions (any emoji)
// ---------------------------------------------------------------------------

async function ensureInteractionAllowed(postId: string, viewerId: string, needed: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      groupId: true,
      status: true,
      allowedInteractions: true,
      ratingScale: true,
      pollMultiSelect: true,
    },
  });
  if (!post) throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member of this group');
  const allowed = (post as unknown as { allowedInteractions: string[] }).allowedInteractions ?? [];
  if (!allowed.includes(needed)) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, `${needed} not enabled for this post`);
  }
  return post;
}

/**
 * Cast (or clear) the viewer's poll vote.
 *
 * `optionIds` is the viewer's complete answer, not a delta: whatever they
 * had before is replaced. An empty array clears the vote. Writing the
 * full set makes the operation idempotent — a retried request can't
 * double-count, which a per-option toggle endpoint would have allowed.
 *
 * Like every other interaction, voting is permitted before reveal; it is
 * only the *results* that stay hidden (see getPollResults).
 */
export async function submitPollVote(input: {
  viewerId: string;
  postId: string;
  optionIds: string[];
}) {
  const { viewerId, postId, optionIds } = input;
  const post = await ensureInteractionAllowed(postId, viewerId, 'poll');

  const multiSelect = Boolean(
    (post as unknown as { pollMultiSelect: boolean | null }).pollMultiSelect,
  );
  if (!multiSelect && optionIds.length > 1) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      'This poll accepts only one answer',
    );
  }

  // Duplicate ids would insert once but imply a bigger selection than the
  // voter made; reject rather than silently collapsing them.
  if (new Set(optionIds).size !== optionIds.length) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Duplicate option ids');
  }

  // Every id must belong to THIS post — otherwise a caller could vote on
  // another post's options through this one's id.
  if (optionIds.length > 0) {
    const owned = await prisma.pollOption.findMany({
      where: { postId, id: { in: optionIds } },
      select: { id: true },
    });
    if (owned.length !== optionIds.length) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Unknown poll option');
    }
  }

  // Replace-in-place: clearing and re-inserting in one transaction means a
  // concurrent read never sees the voter as having no answer mid-write.
  await prisma.$transaction(async (tx) => {
    await tx.pollVote.deleteMany({ where: { postId, userId: viewerId } });
    if (optionIds.length > 0) {
      await tx.pollVote.createMany({
        data: optionIds.map((optionId) => ({ optionId, postId, userId: viewerId })),
      });
    }
  });

  await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
  await cacheDelPattern(`cache:post:${postId}:votes:*`);
  logger.info({ postId, viewerId, count: optionIds.length }, 'poll vote');
  return { optionIds };
}

/**
 * Poll tallies. Gated exactly like comments and responses: nothing is
 * visible until the post reveals. Before then the viewer can see their
 * OWN selection (they need it to render their choice) but no counts.
 */
export async function getPollResults(viewerId: string, postId: string) {
  const post = await ensureInteractionAllowed(postId, viewerId, 'poll');

  const options = await prisma.pollOption.findMany({
    where: { postId },
    orderBy: { order: 'asc' },
    select: { id: true, label: true, order: true },
  });

  const mine = await prisma.pollVote.findMany({
    where: { postId, userId: viewerId },
    select: { optionId: true },
  });
  const myOptionIds = mine.map((m) => m.optionId);

  // Pre-reveal: counts stay hidden, same rule as every other interaction.
  if (post.status === 'active') {
    return {
      revealed: false,
      multiSelect: Boolean(
        (post as unknown as { pollMultiSelect: boolean | null }).pollMultiSelect,
      ),
      totalVoters: null,
      options: options.map((o) => ({ ...o, votes: null })),
      myOptionIds,
    };
  }

  const grouped = await prisma.pollVote.groupBy({
    by: ['optionId'],
    where: { postId },
    _count: { optionId: true },
  });
  const countByOption = new Map(grouped.map((g) => [g.optionId, g._count.optionId]));

  // Distinct voters, not total rows — a multi-select poll has more rows
  // than people, and a percentage over row count would exceed 100%.
  const voters = await prisma.pollVote.findMany({
    where: { postId },
    select: { userId: true },
    distinct: ['userId'],
  });

  return {
    revealed: true,
    multiSelect: Boolean(
      (post as unknown as { pollMultiSelect: boolean | null }).pollMultiSelect,
    ),
    totalVoters: voters.length,
    options: options.map((o) => ({ ...o, votes: countByOption.get(o.id) ?? 0 })),
    myOptionIds,
  };
}

export async function submitRating(input: { viewerId: string; postId: string; value: number }) {
  const { viewerId, postId, value } = input;
  // Membership + "rating is enabled here" gate; the returned row is no
  // longer needed since the scale is fixed rather than read per-post.
  await ensureInteractionAllowed(postId, viewerId, 'rating');
  // Always 1-5, including on posts stored with the old ratingScale=10.
  // The UI only ever draws 5 stars now, so honouring a stored 10 here
  // would accept a value no client can produce or display.
  if (value < 1 || value > RATING_SCALE) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      `Rating must be between 1 and ${RATING_SCALE}`,
    );
  }
  const rating = await prisma.rating.upsert({
    where: { postId_userId: { postId, userId: viewerId } },
    create: { postId, userId: viewerId, value },
    update: { value },
  });
  await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
  await cacheDelPattern(`cache:post:${postId}:ratings:*`);
  logger.info({ postId, viewerId, value }, 'rating');
  return rating;
}

export async function toggleReactionAny(input: { viewerId: string; postId: string; type: string }) {
  const { viewerId, postId, type } = input;
  await ensureInteractionAllowed(postId, viewerId, 'reaction');
  // any single emoji: if same type exists, remove (toggle off), else upsert
  const existing = await prisma.reaction.findUnique({
    where: { postId_userId: { postId, userId: viewerId } },
    select: { type: true },
  });
  if (existing && existing.type === type) {
    await prisma.reaction.delete({ where: { postId_userId: { postId, userId: viewerId } } });
    await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
    return { reacted: false, type, count: await prisma.reaction.count({ where: { postId } }) };
  }
  await prisma.reaction.upsert({
    where: { postId_userId: { postId, userId: viewerId } },
    create: { postId, userId: viewerId, type },
    update: { type },
  });
  await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
  return { reacted: true, type, count: await prisma.reaction.count({ where: { postId } }) };
}

// Separate from toggleReactionAny on purpose — Like and emoji-reaction are
// independent per product decision, backed by separate tables (PostLike vs
// Reaction), so one never overwrites the other's state.
export async function toggleLike(input: { viewerId: string; postId: string }) {
  const { viewerId, postId } = input;
  await ensureInteractionAllowed(postId, viewerId, 'like');
  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: viewerId } },
    select: { postId: true },
  });
  if (existing) {
    await prisma.postLike.delete({ where: { postId_userId: { postId, userId: viewerId } } });
    await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
    return { liked: false, likeCount: await prisma.postLike.count({ where: { postId } }) };
  }
  await prisma.postLike.create({ data: { postId, userId: viewerId } });
  await cacheDel(`cache:post:${postId}:viewer:${viewerId}`);
  return { liked: true, likeCount: await prisma.postLike.count({ where: { postId } }) };
}

export async function getMyVote(viewerId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { groupId: true } });
  if (!post) throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member');
  const [pollVotes, rating, reaction] = await Promise.all([
    prisma.pollVote.findMany({
      where: { postId, userId: viewerId },
      select: { optionId: true },
    }),
    prisma.rating.findUnique({ where: { postId_userId: { postId, userId: viewerId } } }),
    prisma.reaction.findUnique({ where: { postId_userId: { postId, userId: viewerId } } }),
  ]);
  return { pollOptionIds: pollVotes.map((v) => v.optionId), rating, reaction };
}

export async function listVotes(viewerId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { groupId: true, status: true } });
  if (!post) throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member');
  if (post.status === 'active') throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'Votes are hidden until reveal');
  // Raw poll rows, post-reveal only. Callers that want tallies should use
  // getPollResults instead — this stays row-level for parity with the
  // other list* helpers.
  return prisma.pollVote.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } });
}

/**
 * Who liked this post, and who reacted with what.
 *
 * Both are reveal-gated exactly like ratings and comments: before reveal
 * the counts are already visible on the post, but WHO is behind them is
 * not. Handing back names during the hidden phase would let anyone work
 * out the room's leaning from the like list alone, which is the whole
 * thing the hidden phase exists to prevent.
 */
export async function listPostReactors(viewerId: string, postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { groupId: true, status: true },
  });
  if (!post) throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member');
  if (post.status === 'active') {
    throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'Hidden until reveal');
  }

  const [likes, reactions] = await Promise.all([
    prisma.postLike.findMany({
      where: { postId },
      select: { userId: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.reaction.findMany({
      where: { postId },
      select: { userId: true, type: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    likes: likes.map((l) => ({ userId: l.userId, name: l.user.name })),
    reactions: reactions.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      emoji: r.type,
    })),
  };
}

export async function listRatings(viewerId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { groupId: true, status: true } });
  if (!post) throw new AppError(404, ErrorCode.VALIDATION_FAILED, 'Post not found');
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: post.groupId, userId: viewerId } },
    select: { groupId: true },
  });
  if (!membership) throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'You are not a member');
  if (post.status === 'active') throw new AppError(403, ErrorCode.VALIDATION_FAILED, 'Ratings are hidden until reveal');
  return prisma.rating.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } });
}
