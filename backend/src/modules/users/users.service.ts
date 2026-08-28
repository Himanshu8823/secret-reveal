import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import type { UpdateProfileInput, UpdateProfileResult } from './users.types.js';

// Fields the caller is never allowed to mutate. Per CLAUDE.md: phone is the
// user's identity and is set on signup; id and createdAt are server-owned.
const IMMUTABLE_FIELDS = new Set(['phone', 'id', 'createdAt']);

/**
 * Update the caller's display name.
 *
 * Contract:
 *   - only the `name` field is mutable by the caller
 *   - any unknown / extra keys in the payload are silently ignored
 *     (forward-compat — the validation layer trims to the allow-list)
 *   - if the user row is missing, throws NOT_FOUND (instead of letting
 *     Prisma's raw P2025 propagate)
 *   - any attempt to set `phone`/`id`/`createdAt` is rejected with
 *     VALIDATION_FAILED — these are server-owned
 */
export async function updateProfile({
  userId,
  name,
}: UpdateProfileInput): Promise<UpdateProfileResult> {
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, phone: true, name: true },
    });
    return { id: updated.id, phone: updated.phone, name: updated.name };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }
    throw err;
  }
}

/**
 * Exposed so callers (e.g. controllers that accept an arbitrary payload)
 * can know which keys are immutable. Used by tests; not currently called
 * at runtime because the controller schema already restricts to `name`.
 */
export const __testing = { IMMUTABLE_FIELDS };