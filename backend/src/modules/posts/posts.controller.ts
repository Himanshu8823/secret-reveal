import type { Request, Response, NextFunction } from 'express';
import {
  createComment as createCommentService,
  createPost as createPostService,
  getMyVote as getMyVoteService,
  getPost as getPostService,
  listComments as listCommentsService,
  listPosts as listPostsService,
  listRatings as listRatingsService,
  listPostReactors as listPostReactorsService,
  listResponses as listResponsesService,
  listVotes as listVotesService,
  submitRating as submitRatingService,
  submitResponse as submitResponseService,
  submitPollVote as submitPollVoteService,
  getPollResults as getPollResultsService,
  toggleReactionAny as toggleReactionAnyService,
  toggleLike as toggleLikeService,
} from './posts.service.js';
import {
  createCommentSchema,
  createPostSchema,
  listPostsQuerySchema,
  postIdParamSchema,
  ratingSchema,
  reactionSchema,
  submitResponseSchema,
  pollVoteSchema,
} from './posts.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape the
 * response envelope.
 *
 * All routes here require auth (see posts.routes.ts — requireAuth is
 * applied at the router mount). We still defensively guard on `req.user`
 * so the service contract is explicit.
 */

function requireUser(req: Request): { id: string; phone: string } {
  if (!req.user) {
    // requireAuth guarantees this; defensive throw that the central error
    // handler maps to the standard envelope.
    throw new Error('Authentication required');
  }
  return req.user;
}

export async function postCreate(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const body = createPostSchema.parse(req.body);
    const result = await createPostService({
      authorId: user.id,
      groupId: body.groupId,
      memberIds: body.memberIds,
      caption: body.caption,
      mediaIds: body.mediaIds,
      timerMinutes: body.timerMinutes,
      groupName: body.groupName,
      allowedInteractions: body.allowedInteractions,
      ratingScale: body.ratingScale ?? null,
      pollOptions: body.pollOptions,
      pollMultiSelect: body.pollMultiSelect,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /posts — feed list.
 *
 * Query params: cursor, limit, groupId (optional). Returns post summaries
 * with counts only — bodies are never sent before reveal.
 */
export async function getPosts(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const q = listPostsQuerySchema.parse(req.query);
    const result = await listPostsService({
      viewerId: user.id,
      groupId: q.groupId,
      cursor: q.cursor,
      limit: q.limit,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getPostDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await getPostService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getResponses(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listResponsesService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postResponse(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = submitResponseSchema.parse(req.body);
    const result = await submitResponseService({
      viewerId: user.id,
      postId: id,
      body: body.body,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getComments(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listCommentsService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postComment(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = createCommentSchema.parse(req.body);
    const result = await createCommentService({
      viewerId: user.id,
      postId: id,
      body: body.body,
      replyToId: body.replyToId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postPollVote(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = pollVoteSchema.parse(req.body);
    const result = await submitPollVoteService({
      viewerId: user.id,
      postId: id,
      optionIds: body.optionIds,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /posts/:id/poll — options plus, once revealed, the tallies. Before
 * reveal the counts come back null and only the viewer's own selection is
 * populated.
 */
export async function getPollResultsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await getPollResultsService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postRating(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = ratingSchema.parse(req.body);
    const result = await submitRatingService({ viewerId: user.id, postId: id, value: body.value });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postReactionAny(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const body = reactionSchema.parse(req.body);
    const result = await toggleReactionAnyService({ viewerId: user.id, postId: id, type: body.type });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function postToggleLike(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await toggleLikeService({ viewerId: user.id, postId: id });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getMyVoteDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await getMyVoteService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getVotes(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listVotesService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /posts/:id/reactors — who liked, and who reacted with what.
 * Reveal-gated; 403 while the post is still active.
 */
export async function getPostReactors(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listPostReactorsService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getRatings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = requireUser(req);
    const { id } = postIdParamSchema.parse(req.params);
    const result = await listRatingsService(user.id, id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
