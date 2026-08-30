import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { cacheDel, cacheDelPattern, cacheGetOrSet } from '../../lib/cache.js';
import { logger } from '../../lib/logger.js';
import { findOrCreateGroupByMembers } from '../groups/groups.service.js';
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
  const { authorId, groupId, memberIds, caption, mediaIds, timerMinutes } = input;

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
      _count: { select: { responses: true, reactions: true, comments: true } },
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
  const hasRepliedByPost = new Set(viewerResponses.map((r) => r.postId));
  const reactionByPost = new Map(viewerReactions.map((r) => [r.postId, r.type]));

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
      createdAt: p.createdAt,
      media,
      discussionMeta: meta,
      reactionCount: p._count.reactions,
      responseCount: p._count.responses,
      commentCount: p._count.comments,
      hasReplied: hasRepliedByPost.has(p.id),
      viewerReaction: reactionByPost.get(p.id) ?? null,
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
): Promise<{ status: string; groupId: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, groupId: true, status: true },
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
  return { status: post.status, groupId: post.groupId };
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
    include: { author: { select: { name: true } } },
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
    }),
  );
}

/**
 * Create a comment. Allowed during both active and revealed phases — the
 * comment is just hidden from all viewers before reveal. Same write-side
 * contract as submitResponse.
 */
export async function createComment(input: CreateCommentInput): Promise<CommentItem> {
  const { viewerId, postId, body } = input;

  // Gate on membership; we deliberately do NOT gate on status — comments
  // are writable during the discussion phase, only the list is gated.
  await loadPostForCommentGate(viewerId, postId);

  const created = await prisma.comment.create({
    data: { postId, authorId: viewerId, body },
    include: { author: { select: { name: true } } },
  });

  logger.info(
    { commentId: created.id, postId, authorId: viewerId },
    'comment created',
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
  // to whoever cares (currently the worker, soon the notifier).
  const candidates = await prisma.post.findMany({
    where: {
      status: 'active',
      discussionMeta: { revealEndsAt: { lte: now }, revealedAt: null },
    },
    select: { id: true },
  });

  const revealed: string[] = [];
  for (const { id } of candidates) {
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
      // Invalidate the cached post-detail for every viewer of this post.
      // We don't know the viewer set here; the cache key includes the
      // viewer id so pattern-delete covers them all.
      await cacheDelPattern(`cache:post:${id}:*`);
    }
  }

  if (revealed.length > 0) {
    logger.info({ count: revealed.length, postIds: revealed }, 'posts revealed by timer');
  }

  return revealed;
}
