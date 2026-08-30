import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import type {
  FindOrCreateGroupByMembersInput,
  FindOrCreateGroupByMembersResult,
  GroupMemberSummary,
  GroupSummary,
  GroupWithMembers,
  LeaveGroupInput,
  ListMyGroupsInput,
  ListMyGroupsResult,
} from './groups.types.js';

/**
 * Groups service — business logic lives here per CLAUDE.md. Controllers
 * stay thin and only translate HTTP <-> service inputs.
 *
 * Product rule: a Group IS its member set. There is no owner, no roles,
 * no admin, no invite flow. The only way to become a member is to be
 * included in the audience of a post (handled by
 * findOrCreateGroupByMembers). Groups are never created explicitly; they
 * materialise from the member set the first time a post selects it.
 */

/**
 * List groups the caller is a member of, sorted by lastActivityAt DESC.
 *
 * Cursor pagination on the composite (lastActivityAt, id). The cursor is
 * a base64-encoded JSON of `{ t, i }` where `t` is the last activity
 * timestamp seen and `i` is its id — opaque to the client.
 *
 * Phase 3a will populate `latestPost` for each group; for now it's null.
 */
export async function listMyGroups(input: ListMyGroupsInput): Promise<ListMyGroupsResult> {
  const { userId, cursor, limit } = input;

  let cursorClause: { lastActivityAt: Date; id: string } | undefined;
  if (cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as { t?: unknown; i?: unknown };
      if (typeof decoded.t === 'string' && typeof decoded.i === 'string') {
        cursorClause = { lastActivityAt: new Date(decoded.t), id: decoded.i };
      }
    } catch {
      // Bad cursor: ignore and start from the top. The client gets a fresh
      // first page instead of an error.
    }
  }

  // Fetch limit+1 so we can tell whether there's another page without a
  // second query.
  const rows = await prisma.group.findMany({
    where: {
      members: { some: { userId } },
      ...(cursorClause
        ? {
            OR: [
              { lastActivityAt: { lt: cursorClause.lastActivityAt } },
              {
                lastActivityAt: cursorClause.lastActivityAt,
                id: { lt: cursorClause.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      _count: { select: { members: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? Buffer.from(
          JSON.stringify({ t: last.lastActivityAt.toISOString(), i: last.id }),
        ).toString('base64')
      : null;

  const groups: GroupSummary[] = page.map((g) => ({
    id: g.id,
    name: g.name,
    lastActivityAt: g.lastActivityAt,
    createdAt: g.createdAt,
    memberCount: g._count.members,
    latestPost: null,
  }));

  return { groups, nextCursor };
}

/**
 * Single-group detail. Throws NOT_FOUND if the group does not exist;
 * throws FORBIDDEN if the caller is not a member. We deliberately do
 * NOT collapse these into one response: callers that pass a bad id get
 * a clear 404, while non-members get a privacy-preserving 403.
 */
export async function getGroup(
  userId: string,
  groupId: string,
): Promise<GroupWithMembers> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
  if (!group) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Group not found');
  }
  const isMember = group.members.some((m) => m.userId === userId);
  if (!isMember) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a member of this group');
  }
  return {
    id: group.id,
    name: group.name,
    lastActivityAt: group.lastActivityAt,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map<GroupMemberSummary>((m) => ({
      userId: m.userId,
      name: m.user.name,
      phone: m.user.phone,
      joinedAt: m.joinedAt,
    })),
  };
}

/**
 * Leave a group. Every member can leave freely — there is no creator
 * concept and therefore no "creator cannot leave" carve-out.
 *
 * No need to bump `lastActivityAt` on leave — leaving doesn't move the
 * group's relevance up in anyone's feed.
 */
export async function leaveGroup(input: LeaveGroupInput): Promise<void> {
  const { userId, groupId } = input;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!group) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Group not found');
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { userId: true },
  });
  if (!membership) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a member of this group');
  }

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });

  logger.info({ groupId, userId }, 'member left group');
}

// ---------------------------------------------------------------------------
// Find-or-create by member set
// ---------------------------------------------------------------------------

/**
 * Build the canonical "member set signature" for a group: a sorted,
 * comma-joined string of every member's user id (with the creator
 * included). The creator is always part of the set — even when the caller
 * only passes invitee ids, the creator is folded in before sorting, so
 * a post authored by user X to invitees {A,B,C} and one authored by X
 * to {B,C,A} hit the same signature and therefore the same row.
 *
 * Public so the posts service (and tests) can reuse it without
 * recomputing.
 */
export function buildMemberSignature(creatorId: string, memberIds: string[]): string {
  const set = new Set<string>([creatorId, ...memberIds]);
  return Array.from(set).sort().join(',');
}

/**
 * Resolve a group to a member set, creating one if no group exists yet
 * with that exact membership.
 *
 * This is the post-creation entrypoint: instead of the client picking
 * a group, it picks a member list, and we either reuse an existing group
 * with the same members or create a new one. A group's identity is its
 * member set, not its name — so {A,B,C,D} reused twice in a row maps to
 * one group, while {A,B} (a subset that wasn't a group before) creates a
 * fresh row.
 *
 * Race handling: if two concurrent calls find no match and both try to
 * create, the unique partial index on `groups.memberSignature` will let
 * exactly one create succeed; the loser catches a P2002 and re-reads the
 * now-existing row.
 *
 * Derived name: when creating, we name the group from its members'
 * display names ("A, B, C") so the legacy `Group.name NOT NULL` column
 * stays satisfied. Empty names fall back to "Untitled".
 */
export async function findOrCreateGroupByMembers(
  input: FindOrCreateGroupByMembersInput,
): Promise<FindOrCreateGroupByMembersResult> {
  const { creatorId, memberIds } = input;

  // Build the unique signature for this member set.
  const memberSignature = buildMemberSignature(creatorId, memberIds);

  // Fast path — group already exists with this signature. We use findFirst
  // (not findUnique) because memberSignature is nullable in the schema, and
  // Prisma only generates findUnique shortcuts for non-nullable @unique
  // columns. The lookup is still constant-time because of the partial
  // UNIQUE index in the migration.
  const existing = await prisma.group.findFirst({
    where: { memberSignature },
    select: {
      id: true,
      name: true,
      lastActivityAt: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  if (existing) {
    return {
      group: {
        id: existing.id,
        name: existing.name,
        lastActivityAt: existing.lastActivityAt,
        createdAt: existing.createdAt,
        memberCount: existing._count.members,
        latestPost: null,
      },
      created: false,
    };
  }

  // Slow path — derive a display name for the new group. We only need the
  // members listed in `memberIds` plus the creator; everyone gets a row in
  // the same create call.
  const allIds = Array.from(new Set<string>([creatorId, ...memberIds]));
  const memberRows = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map<string, string | null>(
    memberRows.map((u: { id: string; name: string | null }) => [u.id, u.name]),
  );
  const namesForLabel = allIds
    .map((id: string) => nameById.get(id) ?? null)
    .filter((n: string | null): n is string => typeof n === 'string' && n.length > 0);
  const derivedName =
    namesForLabel.length > 0 ? namesForLabel.join(', ') : 'Untitled';

  // Validate every invitee id resolves to a real user before we attempt
  // the create. If any are missing, surface a per-id NOT_FOUND so the
  // caller knows exactly which id is bad.
  const cleanedMemberIds = memberIds.filter((id: string) => id !== creatorId);
  if (cleanedMemberIds.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: cleanedMemberIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((u: { id: string }) => u.id));
    const missing = cleanedMemberIds.filter((id: string) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError(
        404,
        ErrorCode.NOT_FOUND,
        `Unknown user id(s): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
      );
    }
  }

  let createdRow: {
    id: string;
    name: string;
    lastActivityAt: Date;
    createdAt: Date;
    _count: { members: number };
  };
  try {
    createdRow = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: derivedName,
          memberSignature,
          members: {
            create: [
              { userId: creatorId },
              ...cleanedMemberIds.map((userId) => ({ userId })),
            ],
          },
        },
        select: {
          id: true,
          name: true,
          lastActivityAt: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      });
      return created;
    });
  } catch (err) {
    // P2002 = unique violation on the partial-unique memberSignature index.
    // Another caller raced us and created the group first — re-read it and
    // return that as the "existing" path. This is the only race worth
    // handling here: a parallel create would otherwise leave two callers
    // each holding their own group row for the same member set.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.group.findFirst({
        where: { memberSignature },
        select: {
          id: true,
          name: true,
          lastActivityAt: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      });
      if (raced) {
        return {
          group: {
            id: raced.id,
            name: raced.name,
            lastActivityAt: raced.lastActivityAt,
            createdAt: raced.createdAt,
            memberCount: raced._count.members,
            latestPost: null,
          },
          created: false,
        };
      }
    }
    throw err;
  }

  logger.info(
    { groupId: createdRow.id, creatorId, memberCount: allIds.length },
    'group auto-created by member set',
  );

  return {
    group: {
      id: createdRow.id,
      name: createdRow.name,
      lastActivityAt: createdRow.lastActivityAt,
      createdAt: createdRow.createdAt,
      memberCount: createdRow._count.members,
      latestPost: null,
    },
    created: true,
  };
}
