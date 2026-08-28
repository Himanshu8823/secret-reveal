import { z } from 'zod';

/**
 * zod schemas for the groups module. Controllers parse with these at the
 * boundary; service code can trust the inputs.
 *
 * Per CLAUDE.md: every request body validated with zod at the controller
 * boundary, before it touches any service logic. Never trust req.body
 * unvalidated.
 */

/**
 * UUID schema — strict, lowercase, dashed form. Prisma stores UUIDs in
 * this canonical form, and the service inserts them into UUID columns.
 * Anything else is rejected here so the service never sees malformed ids.
 */
const uuid = z.string().uuid();

/**
 * POST /groups body.
 *
 *   - name: 1..60 chars after trim (same rule as User.name for consistency)
 *   - memberIds: array of UUIDs, 0..50 entries
 *
 * We dedupe memberIds inside the schema because the service inserts them
 * as GroupMember PKs; duplicates would cause a DB error after validation.
 * The creator is always added server-side — clients don't pass themselves.
 */
export const createGroupSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Name is required')
        .max(60, 'Name must be at most 60 characters')
        .refine((s) => !/[\x00-\x1F\x7F]/.test(s), {
          message: 'Name must not contain control characters',
        }),
    ),
  memberIds: z
    .array(uuid)
    .max(50, 'At most 50 members can be added at creation')
    .transform((ids) => Array.from(new Set(ids)))
    .optional()
    .default([]),
});

export type CreateGroupBody = z.infer<typeof createGroupSchema>;

/**
 * GET /groups?mine=true query.
 *
 *   - cursor: opaque string produced by the server on the previous page;
 *     we don't decode it, just pass it back to Prisma.
 *   - limit: 1..50, defaults to 20 — same range the auth module uses.
 *     Express's req.query delivers values as strings, so coerce to number.
 */
export const listMyGroupsQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20),
});

export type ListMyGroupsQuery = z.infer<typeof listMyGroupsQuery>;
