import { z } from 'zod';

/**
 * PATCH /users/me body.
 *
 * All fields are optional — the caller may update any subset of
 * {name, username, bio, avatarUrl}. The service layer decides which
 * columns to write based on which keys are present. Unknown keys are
 * rejected with VALIDATION_FAILED via `.strict()` at the boundary.
 *
 * Name rules:
 *   - string, 1..60 chars after trim
 *   - no control characters (\x00..\x1F or \x7F) — keeps the input safe
 *     to render and store.
 *
 * Username rules:
 *   - 3..20 chars, lowercase letters, digits, or underscores only
 *   - immutability (once set, can't be changed) is enforced at the
 *     service layer, not here. The bloom filter + Postgres UNIQUE check
 *     for collisions also lives in the service layer.
 *
 * Bio rules:
 *   - up to 160 chars (matches the schema.prisma column width)
 *
 * Avatar URL rules:
 *   - must be a valid URL, up to 512 chars (matches column width)
 *   - actual upload is a Phase 3b feature — for now callers paste a URL
 */

// Trim-then-validate so all-whitespace fails the min(1) check with a
// clean error rather than slipping through as "".
const nameSchema = z
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
  );

const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 lowercase letters, digits, or underscores');

const bioSchema = z
  .string()
  .max(160, 'Bio must be at most 160 characters');

const avatarUrlSchema = z
  .string()
  .url('Avatar URL must be a valid URL')
  .max(512, 'Avatar URL must be at most 512 characters');

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
    avatarUrl: avatarUrlSchema.optional(),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

/**
 * GET /users query.
 *
 * Powers the composer's member picker (step 3). Per the product rule:
 * the picker shows ALL platform users, no filter — so the route does
 * not require a groupId. Optional `search` narrows by name/username
 * prefix-style match on the server so the picker stays fast as the
 * user count grows.
 *
 *   - cursor: opaque string produced by the server on the previous page
 *   - limit:  1..50, defaults to 30 (picker-friendly page size)
 *   - search: optional, 1..40 chars; trimmed and matched case-insensitively
 *             against `name` OR `username` via SQL OR.
 */
export const listUsersQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(30),
    search: z
      .string()
      .transform((s) => s.trim())
      .pipe(
        z
          .string()
          .min(1, 'search must be at least 1 character')
          .max(40, 'search must be at most 40 characters'),
      )
      .optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
