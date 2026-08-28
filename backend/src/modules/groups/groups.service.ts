import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import type {
  CreateGroupInput,
  GroupMemberSummary,
  GroupSummary,
  GroupWithMembers,
  ListMyGroupsInput,
  ListMyGroupsResult,
} from './groups.types.js';

/**
 * Groups service — business logic lives here per CLAUDE.md. Controllers
 * stay thin and only translate HTTP <-> service inputs.
 */

/**
 * Create a group, auto-add the creator as a member, and optionally add
 * the requested memberIds as members too — all in one transaction so we
 * never end up with a group that has no members.
 *
 * We verify that every requested memberId corresponds to an existing user
 * before inserting, so the FK on group_members.userId can't fail. Missing
 * users are surfaced as a single NOT_FOUND error.
 */
export async function createGroup(input: CreateGroupInput): Promise<GroupWithMembers> {
  const { creatorId, name, memberIds } = input;

  // Trim whitespace defensively. The validation layer also trims, but doing
  // it here too means duplicate-name detection works whether or not the
  // controller is the caller.
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Name is required');
  }

  // Reject duplicate names per creator. We don't enforce uniqueness globally
  // (two different users can both have a "Friends" group) but a single user
  // can't create two groups with the same name.
  const dup = await prisma.group.findFirst({
    where: { createdById: creatorId, name: trimmedName },
    select: { id: true },
  });
  if (dup) {
    throw new AppError(
      409,
      ErrorCode.VALIDATION_FAILED,
      'You already have a group with this name',
    );
  }

  // Validate that every requested member exists. We do this OUTSIDE the
  // transaction because it's a read, and doing it inside would hold the
  // transaction open for nothing.
  if (memberIds.length > 0) {
    const found = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true },
    });
    if (found.length !== memberIds.length) {
      const foundIds = new Set(found.map((u) => u.id));
      const missing = memberIds.find((id) => !foundIds.has(id));
      throw new AppError(404, ErrorCode.NOT_FOUND, `User not found: ${missing}`);
    }
  }

  // Compose the full member list: creator + invited. Dedupe defensively
  // (the schema already dedupes, but if a client sends the creator id
  // here we still want exactly one row).
  const allMemberIds = Array.from(new Set([creatorId, ...memberIds]));

  // Build the membership rows for createMany. The creator's role is 'owner';
  // every invited member's role is 'member'.
  const memberRows = allMemberIds.map((userId) => ({
    userId,
    role: userId === creatorId ? 'owner' : 'member',
  }));

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        name: trimmedName,
        createdById: creatorId,
        members: {
          create: memberRows,
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    return created;
  });

  logger.info(
    { groupId: group.id, creatorId, memberCount: allMemberIds.length },
    'group created',
  );

  return {
    id: group.id,
    name: group.name,
    createdById: group.createdById,
    lastActivityAt: group.lastActivityAt,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map<GroupMemberSummary>((m) => ({
      userId: m.userId,
      name: m.user.name,
      phone: m.user.phone,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}

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
    createdById: g.createdById,
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
    createdById: group.createdById,
    lastActivityAt: group.lastActivityAt,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map<GroupMemberSummary>((m) => ({
      userId: m.userId,
      name: m.user.name,
      phone: m.user.phone,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}
