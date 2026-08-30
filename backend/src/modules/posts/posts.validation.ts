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
export const INTERACTION_TYPES = ['yesNo', 'textComment', 'reaction', 'rating', 'like'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

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
    ratingScale: z.union([z.literal(5), z.literal(10)]).optional().nullable(),
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
    const hasYesNo = types.includes('yesNo');
    const hasRating = types.includes('rating');
    if (hasYesNo && hasRating) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Yes/No and Rating cannot be used together',
        path: ['allowedInteractions'],
      });
    }
    // dedup check
    if (new Set(types).size !== types.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate interaction types',
        path: ['allowedInteractions'],
      });
    }
    if (hasRating) {
      if (b.ratingScale !== 5 && b.ratingScale !== 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Rating scale must be 5 or 10 when rating is enabled',
          path: ['ratingScale'],
        });
      }
    } else if (b.ratingScale != null) {
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
});

export type CreateCommentBody = z.infer<typeof createCommentSchema>;

export const yesNoVoteSchema = z.object({
  value: z.enum(['yes', 'no']),
});
export type YesNoVoteBody = z.infer<typeof yesNoVoteSchema>;

export const ratingSchema = z.object({
  value: z.number().int().min(1).max(10),
});
export type RatingBody = z.infer<typeof ratingSchema>;

export const reactionSchema = z.object({
  type: z.string().min(1).max(20),
});
export type ReactionBody = z.infer<typeof reactionSchema>;
