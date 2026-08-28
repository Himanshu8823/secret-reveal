import { z } from 'zod';

/**
 * PATCH /users/me body.
 *
 * Name rules:
 *   - string, 1..60 chars after trim
 *   - no control characters (\x00..\x1F or \x7F) — keeps the input safe
 *     to render and store.
 *
 * The `.transform(trim)` runs before `.refine`, so a payload of all
 * whitespace fails the min(1) check with a clean validation error.
 */
export const updateProfileSchema = z.object({
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
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;