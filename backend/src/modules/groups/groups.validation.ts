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
 * GET /groups query.
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

export const sendInvitesSchema = z.object({
  phoneNumbers: z
    .array(z.string().min(5).max(20))
    .min(1)
    .max(10),
});

export type SendInvitesBody = z.infer<typeof sendInvitesSchema>;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phoneNumbers: z.array(z.string().min(5).max(20)).max(10).default([]),
});

export type CreateGroupBody = z.infer<typeof createGroupSchema>;
