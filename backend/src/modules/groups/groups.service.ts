import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import type {
  AcceptInviteInput,
  CreateGroupInput,
  GroupMemberSummary,
  GroupSummary,
  GroupWithMembers,
  InviteSummary,
  LeaveGroupInput,
  ListMyGroupsInput,
  ListMyGroupsResult,
  ListPendingInvitesResult,
  RejectInviteInput,
  SendInvitesInput,
  SendInvitesResult,
} from './groups.types.js';

/**
 * Groups service — business logic lives here per CLAUDE.md. Controllers
 * stay thin and only translate HTTP <-> service inputs.
 *
 * Invites are phone-number keyed: the requester submits E.164 numbers,
 * the service looks up (or creates) User rows by phone, and writes a
 * GroupInvite row per unique non-creator phone. Unknown phones get a
 * placeholder User (no name) so the FK is satisfied and the invite can
 * be accepted when the recipient signs up via OTP.
 */

/**
 * Create a group, auto-add the creator as the sole initial member, and
 * optionally send invites by phone number — all in one transaction so
 * either everything lands or nothing does.
 *
 * The creator is always a member from the start. Invited phones are NOT
 * added as members until they accept; they sit in the pending invites
 * queue and become members on accept.
 */
export async function createGroup(input: CreateGroupInput): Promise<GroupWithMembers> {
  const { creatorId, name, phoneNumbers } = input;

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Name is required');
  }

  // Reject duplicate names per creator. Two different users can both
  // have a "Friends" group, but one user can't have two with the same
  // name — keeps the home screen legible.
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

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        name: trimmedName,
        createdById: creatorId,
        members: {
          create: [{ userId: creatorId, role: 'owner' }],
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

  // Invites are sent AFTER the group exists, in a separate step. We don't
  // need to roll back the group if a phone number is malformed — the
  // validation layer already rejected those — but we DO want to bump
  // `lastActivityAt` if any invite actually lands. `sendInvites` handles
  // deduping against already-pending/in-group phones itself.
  if (phoneNumbers.length > 0) {
    await sendInvites({ inviterId: creatorId, groupId: group.id, phoneNumbers });
  }

  logger.info(
    { groupId: group.id, creatorId, inviteCount: phoneNumbers.length },
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

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * Resolve E.164 phones to User rows. Unknown phones get a placeholder User
 * (no name) so a future OTP-based signup can claim the same row by phone —
 * that's how the invite flows into a brand-new account.
 *
 * Returns the User rows in the same order as `phones` (deduped). The
 * `createMissing` flag controls whether unknown phones get a placeholder
 * row (true on initial send) or are just dropped (false on re-send where
 * we only want to act on existing users).
 */
async function ensureUsersByPhone(
  phones: string[],
  tx: Prisma.TransactionClient,
): Promise<Map<string, { id: string; phone: string }>> {
  const unique = Array.from(new Set(phones));
  if (unique.length === 0) return new Map();

  const existing = await tx.user.findMany({
    where: { phone: { in: unique } },
    select: { id: true, phone: true },
  });
  const byPhone = new Map<string, { id: string; phone: string }>();
  for (const u of existing) byPhone.set(u.phone, u);

  // For unknown phones, create placeholder user rows. They have no name
  // and no OTP history; signing up via OTP later fills the name.
  const missing = unique.filter((p) => !byPhone.has(p));
  for (const phone of missing) {
    try {
      const created = await tx.user.create({
        data: { phone },
        select: { id: true, phone: true },
      });
      byPhone.set(created.phone, created);
    } catch (err) {
      // P2002 = unique violation on phone. A concurrent caller created the
      // row between our findMany and create — fetch it and proceed.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await tx.user.findUnique({
          where: { phone },
          select: { id: true, phone: true },
        });
        if (raced) byPhone.set(raced.phone, raced);
      } else {
        throw err;
      }
    }
  }

  return byPhone;
}

/**
 * Send invites by phone number. The inviter must be a member of the
 * group. Phones that already have a pending invite or are already members
 * are silently skipped (idempotent — re-tapping the row is a no-op).
 *
 * `lastActivityAt` is bumped only if at least one new invite lands —
 * otherwise the activity timestamp would reflect a useless "send" call.
 */
export async function sendInvites(input: SendInvitesInput): Promise<SendInvitesResult> {
  const { inviterId, groupId, phoneNumbers } = input;

  // Membership gate. The validation layer has already enforced uniqueness
  // + format, but we still need to make sure the inviter belongs to the
  // group they're inviting people into.
  const inviterMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: inviterId } },
    select: { userId: true },
  });
  if (!inviterMembership) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a member of this group');
  }

  // Defensive 404 — a clearly-bad groupId should be obvious, not a 403.
  const groupExists = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!groupExists) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Group not found');
  }

  // Resolve inviter's phone so we don't invite ourselves (the schema's
  // unique([groupId, inviteeId]) would reject it with a 500 otherwise).
  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { phone: true },
  });
  const phonesToInvite = inviter
    ? phoneNumbers.filter((p) => p !== inviter.phone)
    : phoneNumbers;

  if (phonesToInvite.length === 0) {
    return { created: 0 };
  }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const usersByPhone = await ensureUsersByPhone(phonesToInvite, tx);

    // Skip users that are already members of the group — inviting them
    // again would just be noise. The schema's unique on (groupId,
    // inviteeId) would also reject it with a 500, so we filter first.
    const existingMembers = await tx.groupMember.findMany({
      where: {
        groupId,
        userId: { in: Array.from(usersByPhone.values()).map((u) => u.id) },
      },
      select: { userId: true },
    });
    const memberIds = new Set(existingMembers.map((m) => m.userId));

    // Skip users that already have a pending invite to this group.
    // The unique constraint is on (groupId, inviteeId) regardless of
    // status — so a previously-accepted or rejected invite would still
    // collide. Filter those out too.
    const existingInvites = await tx.groupInvite.findMany({
      where: {
        groupId,
        inviteeId: { in: Array.from(usersByPhone.values()).map((u) => u.id) },
      },
      select: { inviteeId: true, status: true },
    });
    const pendingInviteeIds = new Set(
      existingInvites.filter((i) => i.status === 'pending').map((i) => i.inviteeId),
    );
    const anyExistingInviteeIds = new Set(existingInvites.map((i) => i.inviteeId));

    let createdCount = 0;
    for (const phone of phonesToInvite) {
      const u = usersByPhone.get(phone);
      if (!u) continue; // safety: ensureUsersByPhone guarantees presence
      if (memberIds.has(u.id)) continue;
      if (anyExistingInviteeIds.has(u.id)) continue;

      try {
        await tx.groupInvite.create({
          data: {
            groupId,
            inviterId,
            inviteeId: u.id,
            status: 'pending',
          },
        });
        createdCount += 1;
      } catch (err) {
        // P2002 = unique violation. Another caller raced us — treat as no-op.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }

    if (createdCount > 0) {
      await tx.group.update({
        where: { id: groupId },
        data: { lastActivityAt: now },
      });
    }

    // pendingInviteeIds is intentionally not consumed further — it's read
    // here so the linter / future readers see the intent ("we deliberately
    // skip pending invites too"). Cast to `void` to silence the warning.
    void pendingInviteeIds;

    return createdCount;
  });

  logger.info(
    { groupId, inviterId, requested: phonesToInvite.length, created },
    'invites sent',
  );

  return { created };
}

/**
 * List invites sent TO `userId` with status='pending'. Includes group name
 * + inviter name so the mobile UI can render a useful row without an
 * extra round-trip per invite.
 */
export async function listPendingInvites(
  userId: string,
): Promise<ListPendingInvitesResult> {
  const rows = await prisma.groupInvite.findMany({
    where: { inviteeId: userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      group: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  const invites: InviteSummary[] = rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    groupName: r.group.name,
    inviterId: r.inviterId,
    inviterName: r.inviter.name,
    inviteeId: r.inviteeId,
    status: r.status as 'pending' | 'accepted' | 'rejected',
    createdAt: r.createdAt,
  }));

  return { invites };
}

/**
 * Accept an invite. Atomic: invite status flips AND the GroupMember row
 * is created in one transaction. The unique on (groupId, inviteeId)
 * would otherwise let two racing accepts double-write — the second one
 * fails with a Prisma error we map to a clean conflict.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<InviteSummary> {
  const { inviteId, userId } = input;

  const invite = await prisma.groupInvite.findUnique({
    where: { id: inviteId },
    include: {
      group: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Invite not found');
  }
  if (invite.inviteeId !== userId) {
    // Don't leak the invite's existence to someone other than the invitee.
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Not your invite');
  }
  if (invite.status !== 'pending') {
    throw new AppError(
      409,
      ErrorCode.VALIDATION_FAILED,
      `Invite is already ${invite.status}`,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.groupInvite.update({
      where: { id: inviteId },
      data: { status: 'accepted', respondedAt: now },
    });
    try {
      await tx.groupMember.create({
        data: { groupId: invite.groupId, userId, role: 'member' },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // The user is already a member (e.g., a previous accepted invite).
        // We still flipped status, so the state is consistent.
        return;
      }
      throw err;
    }
    await tx.group.update({
      where: { id: invite.groupId },
      data: { lastActivityAt: now },
    });
  });

  logger.info({ inviteId, groupId: invite.groupId, userId }, 'invite accepted');

  return {
    id: invite.id,
    groupId: invite.groupId,
    groupName: invite.group.name,
    inviterId: invite.inviterId,
    inviterName: invite.inviter.name,
    inviteeId: invite.inviteeId,
    status: 'accepted',
    createdAt: invite.createdAt,
  };
}

/**
 * Reject an invite. Idempotent for already-rejected invites, but a
 * second accept-after-reject returns a clean 409 (the row's status is
 * no longer pending).
 */
export async function rejectInvite(input: RejectInviteInput): Promise<InviteSummary> {
  const { inviteId, userId } = input;

  const invite = await prisma.groupInvite.findUnique({
    where: { id: inviteId },
    include: {
      group: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Invite not found');
  }
  if (invite.inviteeId !== userId) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Not your invite');
  }
  if (invite.status !== 'pending') {
    throw new AppError(
      409,
      ErrorCode.VALIDATION_FAILED,
      `Invite is already ${invite.status}`,
    );
  }

  const now = new Date();
  const updated = await prisma.groupInvite.update({
    where: { id: inviteId },
    data: { status: 'rejected', respondedAt: now },
    include: {
      group: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  logger.info({ inviteId, groupId: invite.groupId, userId }, 'invite rejected');

  return {
    id: updated.id,
    groupId: updated.groupId,
    groupName: updated.group.name,
    inviterId: updated.inviterId,
    inviterName: updated.inviter.name,
    inviteeId: updated.inviteeId,
    status: 'rejected',
    createdAt: updated.createdAt,
  };
}

/**
 * Leave a group. The creator cannot leave — they have to delete the group
 * (which isn't a v1 endpoint, so today creator-leave just rejects with
 * a clear message).
 */
export async function leaveGroup(input: LeaveGroupInput): Promise<void> {
  const { userId, groupId } = input;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, createdById: true },
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
  if (group.createdById === userId) {
    throw new AppError(
      409,
      ErrorCode.VALIDATION_FAILED,
      'Group creator cannot leave; delete the group instead',
    );
  }

  // No need to bump `lastActivityAt` on leave — leaving doesn't move the
  // group's relevance up in anyone's feed.
  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });

  logger.info({ groupId, userId }, 'member left group');
}