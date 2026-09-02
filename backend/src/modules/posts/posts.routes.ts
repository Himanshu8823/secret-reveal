import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  postCreateLimiter,
  postResponseLimiter,
  rateLimit,
} from '../../middlewares/rateLimiter.js';
import {
  getComments,
  getMyVoteDetail,
  getPostDetail,
  getPosts,
  getRatings,
  getResponses,
  getVotes,
  postComment,
  postCreate,
  postRating,
  postReactionAny,
  postResponse,
  postToggleLike,
  postPollVote,
  getPollResultsHandler,
  getPostReactors,
} from './posts.controller.js';

/**
 * Posts routes. Mounted at /api/v1/posts in app.ts.
 *
 * Per CLAUDE.md: every public endpoint that accepts user input gets
 * rate-limited. requireAuth is applied at the router level so every
 * handler can assume req.user is set; per-route limiters are mounted
 * individually on the write paths (after auth, before validation, so
 * abuse is rejected cheaply without parsing bodies).
 *
 * Reveal: there is intentionally NO POST /:id/reveal. Reveal happens
 * server-side via the reveal-worker (backend/src/workers/revealWorker.ts)
 * when DiscussionMeta.revealEndsAt passes. "Reveal now" was removed per
 * the product rule ("Reveal now mat rakho, timer based hi rahega").
 */
export const postsRouter = Router();

postsRouter.use(requireAuth);

postsRouter.post('/', rateLimit(postCreateLimiter, (req) => req.user?.id ?? 'unknown'), postCreate);
postsRouter.get('/', getPosts);
postsRouter.get('/:id', getPostDetail);
postsRouter.get('/:id/responses', getResponses);
postsRouter.post(
  '/:id/responses',
  rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postResponse,
);
postsRouter.get('/:id/comments', getComments);
postsRouter.post(
  '/:id/comments',
  rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postComment,
);
postsRouter.post(
  '/:id/poll-vote',
  rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'),
  postPollVote,
);
postsRouter.get('/:id/poll', getPollResultsHandler);
postsRouter.get('/:id/votes', getVotes);
postsRouter.post('/:id/ratings', rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'), postRating);
postsRouter.get('/:id/ratings', getRatings);
// Who liked / who reacted. Reveal-gated in the service.
postsRouter.get('/:id/reactors', getPostReactors);
postsRouter.post('/:id/reactions-any', rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'), postReactionAny);
postsRouter.post('/:id/likes', rateLimit(postResponseLimiter, (req) => req.user?.id ?? 'unknown'), postToggleLike);
postsRouter.get('/:id/my-vote', getMyVoteDetail);
