import { z } from 'zod';

/**
 * POST /posts body.
 *
 * Two ways to specify the audience, exactly one of which must be present:
 *
 * - groupId: legacy flow — caller already picked a group. Must reference
 *   an existing group (existence/authorization checked in the service
 *   layer; validation is purely shape).
 * - memberIds: preferred flow — pass the people to share with and the
 *   service finds-or-creates the matching group. Two posts with the
 *   same memberIds hit the same group row.
 *
 * - caption: 1..2000 chars after trim. The 2000 matches the DB column.
 * - mediaIds: optional, ≤4 entries. Each must be a UUID. Ownership/real-media
 *   verification happens in the service (v1 accepts any UUID; production-grade
 *   would verify uploaderId = authorId and that the row exists).
 * - timerMinutes: int 5..1440. 5 minute floor (a 1-min discussion would
 *   defeat the "discussion" mechanic), 24 hour ceiling (anything longer is
 *   essentially "never reveals" and would clog the reveal queue).
 */
export const INTERACTION_TYPES = ['poll', 'textComment', 'reaction', 'rating', 'like'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Rating is always 1-5. Kept as a named constant so the UI and the
 *  validator can't drift apart. */
export const RATING_SCALE = 5;

/** A poll needs at least two answers to be a choice, and more than six
 *  stops being scannable on a phone. */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

export const createPostSchema = z
  .object({
    groupId: z.string().uuid('groupId must be a UUID').optional(),
    memberIds: z
      .array(z.string().uuid('memberIds must be UUIDs'))
      .max(20, 'A post can be shared with at most 20 members')
      .optional(),
    caption: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(1, 'Caption is required')
          .max(2000, 'Caption must be at most 2000 characters'),
      ),
    mediaIds: z
      .array(z.string().uuid('mediaIds must be UUIDs'))
      .max(5, 'A post can include at most 5 media items')
      .default([]),
    timerMinutes: z
      .number()
      .int('timerMinutes must be an integer')
      .min(5, 'timerMinutes must be at least 5')
      .max(1440, 'timerMinutes must be at most 1440 (24 hours)'),
    groupName: z.string().trim().min(1).max(60).optional(),
    allowedInteractions: z
      .array(z.enum(INTERACTION_TYPES))
      .min(1, 'Pick at least one interaction type')
      .max(5)
      .default(['textComment']),
    // Rating is fixed at 1-5. The field is still accepted so older clients
    // don't start failing mid-rollout, but only the value 5 is legal and
    // the service ignores it either way.
    ratingScale: z.literal(RATING_SCALE).optional().nullable(),
    /**
     * Poll answers. The question is the post's caption — we never take a
     * separate question field. Order is the array order.
     */
    pollOptions: z
      .array(
        z
          .string()
          .transform((s) => s.trim())
          .pipe(
            z
              .string()
              .min(1, 'Poll options cannot be empty')
              .max(120, 'Poll options must be at most 120 characters'),
          ),
      )
      .max(POLL_MAX_OPTIONS, `A poll can have at most ${POLL_MAX_OPTIONS} options`)
      .optional(),
    /** Whether one voter may pick several answers. Poll-only. */
    pollMultiSelect: z.boolean().optional(),
  })
  .refine(
    (b) => Boolean(b.groupId) !== Boolean(b.memberIds && b.memberIds.length > 0),
    {
      message: 'Provide exactly one of groupId or memberIds',
      path: ['groupId'],
    },
  )
  .superRefine((b, ctx) => {
    const types = b.allowedInteractions ?? [];
    const hasPoll = types.includes('poll');

    // dedup check
    if (new Set(types).size !== types.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate interaction types',
        path: ['allowedInteractions'],
      });
    }

    // Poll options are required with a poll and meaningless without one.
    if (hasPoll) {
      const options = b.pollOptions ?? [];
      if (options.length < POLL_MIN_OPTIONS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A poll needs at least ${POLL_MIN_OPTIONS} options`,
          path: ['pollOptions'],
        });
      }
      // Two identical answers make the result unreadable — the voter
      // can't tell which one they picked.
      const seen = options.map((o) => o.toLowerCase());
      if (new Set(seen).size !== seen.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Poll options must be unique',
          path: ['pollOptions'],
        });
      }
    } else {
      if (b.pollOptions != null && b.pollOptions.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Poll options are only allowed when the poll interaction is enabled',
          path: ['pollOptions'],
        });
      }
      if (b.pollMultiSelect != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pollMultiSelect is only allowed when the poll interaction is enabled',
          path: ['pollMultiSelect'],
        });
      }
    }

    // Rating no longer carries a scale choice — it is always 1-5. Only an
    // explicit non-5 value is rejected; omitting it is the normal case.
    if (!types.includes('rating') && b.ratingScale != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rating scale only allowed when rating interaction is enabled',
        path: ['ratingScale'],
      });
    }
  });

export type CreatePostBody = z.infer<typeof createPostSchema>;

/**
 * POST /posts/:id/responses body.
 */
export const submitResponseSchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Response body is required')
        .max(2000, 'Response must be at most 2000 characters'),
    ),
});

export type SubmitResponseBody = z.infer<typeof submitResponseSchema>;

/**
 * Param schema for routes that take a post id (`/posts/:id/...`).
 * Used at the controller boundary to reject malformed ids early.
 */
export const postIdParamSchema = z.object({
  id: z.string().uuid('Post id must be a UUID'),
});

export type PostIdParam = z.infer<typeof postIdParamSchema>;

/**
 * GET /posts query — feed list.
 *
 *   - cursor: opaque string from a previous page's nextCursor
 *   - limit:  1..50, defaults to 20 (matches the groups module)
 *   - groupId: optional UUID filter for the per-group feed
 */
export const listPostsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  groupId: z.string().uuid('groupId must be a UUID').optional(),
});

export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

/**
 * POST /posts/:id/comments body.
 *
 * Comments follow the same shape as responses: 1..1000 chars after trim
 * (the Comment.body column is VARCHAR(1000), distinct from Response.body
 * at 2000 because meta-discussion tolerates shorter messages).
 */
export const createCommentSchema = z.object({
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Comment body is required')
        .max(1000, 'Comment must be at most 1000 characters'),
    ),
  /** Comment being replied to. The service checks it belongs to this post. */
  replyToId: z.string().uuid('replyToId must be a UUID').optional().nullable(),
});

export type CreateCommentBody = z.infer<typeof createCommentSchema>;

/**
 * POST /posts/:id/poll-vote body.
 *
 * Always an array, even for a single-select poll — one shape for both
 * modes keeps the client from branching. An empty array clears the
 * viewer's vote. The service rejects more than one entry on a
 * single-select poll and validates that the ids belong to this post.
 */
export const pollVoteSchema = z.object({
  optionIds: z
    .array(z.string().uuid('optionIds must be UUIDs'))
    .max(POLL_MAX_OPTIONS, `Cannot select more than ${POLL_MAX_OPTIONS} options`),
});
export type PollVoteBody = z.infer<typeof pollVoteSchema>;

// Rating is 1-5 everywhere now. The old bound accepted up to 10, which
// would have let a client write a 7 onto a 1-5 post.
export const ratingSchema = z.object({
  value: z.number().int().min(1).max(RATING_SCALE),
});
export type RatingBody = z.infer<typeof ratingSchema>;

export const reactionSchema = z.object({
  type: z.string().min(1).max(20),
});
export type ReactionBody = z.infer<typeof reactionSchema>;
