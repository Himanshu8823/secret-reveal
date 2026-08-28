import { z } from 'zod';
import { phoneInputSchema } from '../auth/phone.schema.js';

/**
 * zod schemas for the groups module. Controllers parse with these at the
 * boundary; service code can trust the inputs.
 *
 * Per CLAUDE.md: every request body validated with zod at the controller
 * boundary, before it touches any service logic. Never trust req.body
 * unvalidated.
 */

/**
 * Phone-number list — shared by `createGroup` and `sendInvites`. The same
 * rules apply on both: must be valid E.164 (per `phone.schema.ts`), max 10
 * entries per call (matches the task spec for /invites).
 *
 * We dedupe + cap with zod so the service layer can trust uniqueness.
 */
const phoneListSchema = z
  .array(phoneInputSchema.transform((p) => p.e164))
  .max(10, 'At most 10 phone numbers per call')
  .transform((nums) => Array.from(new Set(nums)))
  .optional()
  .default([]);

/**
 * POST /groups body.
 *
 *   - name: 1..60 chars after trim (same rule as User.name for consistency)
 *   - phoneNumbers: array of E.164 phones, 0..10 entries
 *
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
  phoneNumbers: phoneListSchema,
});

export type CreateGroupBody = z.infer<typeof createGroupSchema>;

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

/**
 * POST /groups/:id/invites body.
 *
 *   - phoneNumbers: array of E.164 phones, 1..10 entries (required here;
 *     the create-time list is optional because it might be just "me").
 */
export const sendInvitesSchema = z.object({
  phoneNumbers: z
    .array(phoneInputSchema.transform((p) => p.e164))
    .min(1, 'Add at least one phone number')
    .max(10, 'At most 10 phone numbers per call')
    .transform((nums) => Array.from(new Set(nums))),
});

export type SendInvitesBody = z.infer<typeof sendInvitesSchema>;