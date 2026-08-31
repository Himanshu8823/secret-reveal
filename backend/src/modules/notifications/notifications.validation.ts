import { z } from 'zod';

/**
 * GET /notifications query.
 *
 * Cursor pagination, same convention as GET /users and GET /groups.
 *   - cursor: opaque string produced by the server on the previous page
 *   - limit:  1..50, defaults to 30
 */
export const listNotificationsQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(30),
  })
  .strict();

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * POST /notifications/push-token body.
 *
 * Expo push tokens look like "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" or
 * the newer "ExpoPushToken[...]" form. We don't validate the inner opaque
 * id beyond non-empty — Expo owns that format and may change it.
 */
export const registerPushTokenSchema = z
  .object({
    token: z
      .string()
      .regex(
        /^Exponent(?:Push)?Token\[.+\]$|^ExpoPushToken\[.+\]$/,
        'Not a valid Expo push token',
      )
      .max(255, 'Token must be at most 255 characters'),
  })
  .strict();

export type RegisterPushTokenBody = z.infer<typeof registerPushTokenSchema>;
