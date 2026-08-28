import { z } from 'zod';

/**
 * POST /posts body.
 *
 * - groupId: must reference an existing group (existence/authorization
 *   checked in the service layer, not here — validation is purely shape).
 * - caption: 1..2000 chars after trim. The 2000 matches the DB column.
 * - mediaIds: optional, ≤4 entries. Each must be a UUID. Ownership/real-media
 *   verification happens in the service (v1 accepts any UUID; production-grade
 *   would verify uploaderId = authorId and that the row exists).
 * - timerMinutes: int 5..1440. 5 minute floor (a 1-min discussion would
 *   defeat the "discussion" mechanic), 24 hour ceiling (anything longer is
 *   essentially "never reveals" and would clog the reveal queue).
 */
export const createPostSchema = z.object({
  groupId: z.string().uuid('groupId must be a UUID'),
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
    .max(4, 'A post can include at most 4 media items')
    .default([]),
  timerMinutes: z
    .number()
    .int('timerMinutes must be an integer')
    .min(5, 'timerMinutes must be at least 5')
    .max(1440, 'timerMinutes must be at most 1440 (24 hours)'),
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
