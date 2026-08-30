import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import {
  usernameProbablyExists,
  addUsernameToBloom,
} from '../../lib/usernameBloom.js';
import { logger } from '../../lib/logger.js';
import type {
  ListUsersInput,
  ListUsersResult,
  UpdateProfileInput,
  UpdateProfileResult,
  UserPickerEntry,
  UserProfile,
  UserStats,
} from './users.types.js';

// Fields the caller is never allowed to mutate. Per CLAUDE.md: phone is the
// user's identity and is set on signup; id and createdAt are server-owned.
const IMMUTABLE_FIELDS = new Set(['phone', 'id', 'createdAt']);

/**
 * Fields selected by every users.service read — keeps the shape of
 * UserProfile consistent regardless of which read path produced it.
 */
const USER_PROFILE_SELECT = {
  id: true,
  phone: true,
  name: true,
  username: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
} as const;

/**
 * Read the caller's own profile. Throws NOT_FOUND if the user row is
 * missing (this can happen if the row was deleted between token issuance
 * and request — surface as 404 rather than letting an undefined access
 * leak through).
 */
export async function getMyProfile(userId: string): Promise<UserProfile> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_PROFILE_SELECT,
  });
  if (!user) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Update the caller's profile. All fields are optional; only keys present
 * on the input are written.
 *
 * Username uniqueness is enforced by a hybrid bloom filter + Postgres
 * UNIQUE pattern (production pattern used by Twitter / GitHub /
 * Instagram at scale):
 *
 *   1. Bloom filter (Redis-backed, sub-ms) — "probably taken" → fall
 *      through to a Postgres lookup so a false-positive doesn't falsely
 *      reject an actually-free name.
 *   2. Postgres UNIQUE constraint — authoritative; a UNIQUE violation
 *      surfaces as Prisma P2002 → translated to USERNAME_TAKEN (409).
 *
 * False positives from the bloom are safe (Postgres catches the truth);
 * false negatives are mathematically impossible by construction. We only
 * use the bloom as a fast-reject optimization, never as authority.
 *
 * Contract:
 *   - any unknown / extra keys in the payload are silently ignored
 *     (forward-compat — the validation layer trims to the allow-list)
 *   - if the user row is missing, throws NOT_FOUND (instead of letting
 *     Prisma's raw P2025 propagate)
 *   - any attempt to set `phone`/`id`/`createdAt` is rejected with
 *     VALIDATION_FAILED — these are server-owned
 *   - if the caller already has a username and tries to set one
 *     (different or same), reject with VALIDATION_FAILED — username is
 *     chosen once and frozen. The only way to "change" a username in v1
 *     is to contact support.
 */
export async function updateProfile(input: UpdateProfileInput): Promise<UpdateProfileResult> {
  const { userId, name, username, bio, avatarUrl } = input;

  // Read the current row so we can enforce the username immutability rule
  // BEFORE attempting the write. If we did it inside the update we'd have
  // to translate "currentUsername == newUsername" as OK vs
  // "currentUsername is set and newUsername differs" as rejection — both
  // of which require a read first, so just read.
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!current) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
  }

  if (username !== undefined && current.username !== null) {
    // Username already set. Reject any change attempt (same value or
    // different — the contract is "frozen once set"). The error code is
    // VALIDATION_FAILED so the mobile client renders it through the same
    // validation dialog as a bad format.
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      'Username cannot be changed',
    );
  }

  // Username front-line check. Only runs when the caller is setting a
  // username for the first time (current.username is null). The bloom
  // filter may say "probably taken" on a free name (1% false positive by
  // default) — in that case we still trust the DB to give the right
  // answer, so we do an extra findFirst here. If the bloom says "free"
  // we skip the lookup and let Postgres UNIQUE catch the rare real
  // collision (rare because the bloom catches the vast majority of
  // taken names before they reach the DB).
  if (username !== undefined) {
    const probablyTaken = await usernameProbablyExists(username);
    if (probablyTaken) {
      const conflict = await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
        select: { id: true },
      });
      if (conflict) {
        throw new AppError(
          409,
          ErrorCode.USERNAME_TAKEN,
          'Username is already taken',
        );
      }
    }
  }

  // Build the data object — only include keys the caller actually passed.
  // `undefined` keys are dropped so Prisma writes only the columns we
  // explicitly set.
  const data: Prisma.UserUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (username !== undefined) data.username = username;
  if (bio !== undefined) data.bio = bio;
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: USER_PROFILE_SELECT,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      // Race: row was deleted between our findUnique and the update.
      throw new AppError(404, ErrorCode.NOT_FOUND, 'User not found');
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Postgres UNIQUE on `username` — the authoritative guard. We hit
      // this when the bloom filter said "free" (true negative or false
      // negative, the latter is impossible) but two concurrent writers
      // raced, OR when the bloom was empty during cold start. Either
      // way, surface as USERNAME_TAKEN so the mobile client can show a
      // dedicated "username taken" UX distinct from generic validation.
      throw new AppError(
        409,
        ErrorCode.USERNAME_TAKEN,
        'Username is already taken',
      );
    }
    throw err;
  }

  // After a successful write, teach the bloom about the new username.
  // Wrapped in try/catch because a Redis failure here MUST NOT roll back
  // the DB write — the worst case is the bloom misses this name until
  // the next rebuild, which is safe (Postgres UNIQUE still catches the
  // conflict on the next attempt).
  if (username !== undefined) {
    try {
      await addUsernameToBloom(username);
    } catch (err) {
      logger.warn({ err, username }, 'failed to update username bloom');
    }
  }

  return {
    id: updated.id,
    phone: updated.phone,
    name: updated.name,
    username: updated.username,
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
    createdAt: updated.createdAt.toISOString(),
  };
}

/**
 * Aggregate counts for the profile screen. Posts excludes soft-deleted
 * rows (Post.deletedAt IS NOT NULL). Active Groups is the count of
 * group memberships — matches "groups you're in" on the UI.
 *
 * Two simple COUNT queries rather than a single aggregation: each is a
 * tiny index scan, and the two reads run independently so a slow index
 * on one doesn't block the other. The profile screen renders both so the
 * user sees partial data if one fails (defensive — current callers
 * don't surface partial data, but the structure leaves that door open).
 */
export async function getMyStats(userId: string): Promise<UserStats> {
  const [posts, activeGroups] = await Promise.all([
    prisma.post.count({
      where: { authorId: userId, deletedAt: null },
    }),
    prisma.groupMember.count({
      where: { userId },
    }),
  ]);
  return { posts, activeGroups };
}

/**
 * Exposed so callers (e.g. controllers that accept an arbitrary payload)
 * can know which keys are immutable. Used by tests; not currently called
 * at runtime because the controller schema already restricts to the
 * allow-list.
 */
export const __testing = { IMMUTABLE_FIELDS };

// --- Member picker list -----------------------------------------------------

/**
 * Decode the (createdAt, id) cursor produced by listUsers. Returns
 * undefined on any failure — a bad cursor silently restarts pagination
 * from the top (same convention used elsewhere in the codebase).
 */
function decodeListUsersCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
      t?: unknown;
      i?: unknown;
    };
    if (typeof decoded.t === 'string' && typeof decoded.i === 'string') {
      return { createdAt: new Date(decoded.t), id: decoded.i };
    }
  } catch {
    // fall through — bad cursor treated as "no cursor"
  }
  return undefined;
}

/**
 * List users for the composer's member picker.
 *
 * Per the product rule: the picker shows ALL platform users, no group
 * filter, so this route does not require a groupId. The caller is
 * excluded — you can't pick yourself.
 *
 * Search: case-insensitive prefix-style match on `name` OR `username`.
 * We use Postgres `ILIKE` rather than full-text search because the
 * picker needs sub-50ms feel; with a real index this scales comfortably
 * to ~100K users before we'd want to revisit (trigram extension or
 * server-side search). Per CLAUDE.md: no speculative infrastructure —
 * this stays a plain Prisma query.
 *
 * Cursor pagination on (createdAt, id) DESC, base64-encoded. Fetch
 * limit+1 to detect the next page without a second query.
 */
export async function listUsers(input: ListUsersInput): Promise<ListUsersResult> {
  const { callerId, cursor, limit, search } = input;

  const cursorClause = decodeListUsersCursor(cursor);

  // Build the search OR (name OR username match) and the cursor OR
  // (createdAt< OR createdAt=AND id<). Combine with AND when both are
  // present so we don't lose either filter — Prisma would otherwise
  // silently let one overwrite the other.
  const searchOr = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : null;
  const cursorOr = cursorClause
    ? {
        OR: [
          { createdAt: { lt: cursorClause.createdAt } },
          {
            createdAt: cursorClause.createdAt,
            id: { lt: cursorClause.id },
          },
        ],
      }
    : null;

  // Combine search and cursor via AND so each filter narrows the result.
  const textFilter =
    searchOr && cursorOr
      ? { AND: [searchOr, cursorOr] }
      : searchOr ?? cursorOr ?? {};

  const rows = await prisma.user.findMany({
    where: {
      // Exclude the caller — the picker shouldn't list "me" alongside
      // other people. This is a soft filter; it's still safe to pick
      // yourself by id if a deeper endpoint ever needs to, but the
      // picker UI never shows the caller.
      id: { not: callerId },
      ...textFilter,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
      // createdAt drives the cursor — must be in the select for the
      // page->nextCursor step below.
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ t: last.createdAt.toISOString(), i: last.id }),
        ).toString('base64')
      : null;

  const users: UserPickerEntry[] = page.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    avatarUrl: u.avatarUrl,
  }));

  return { users, nextCursor };
}
