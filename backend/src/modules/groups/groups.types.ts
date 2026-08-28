/**
 * Public types of the groups module. Narrow on purpose: only what crosses
 * module boundaries (controller output, service inputs).
 *
 * Per CLAUDE.md: TypeScript everywhere, strict mode. No `any` without a
 * comment explaining why it's unavoidable.
 */

export type CreateGroupInput = {
  creatorId: string;
  name: string;
  /** E.164 phone numbers (with leading "+"). Existing users are matched by
   *  phone; unknown phones get a placeholder User row so the invitee can
   *  claim the invite after they sign up via OTP. */
  phoneNumbers: string[];
};

export type GroupMemberSummary = {
  userId: string;
  name: string | null;
  phone: string;
  role: string;
  joinedAt: Date;
};

export type GroupSummary = {
  id: string;
  name: string;
  createdById: string;
  lastActivityAt: Date;
  createdAt: Date;
  memberCount: number;
  // Phase 3a populates this; for now the column is null.
  latestPost: null;
};

export type GroupWithMembers = {
  id: string;
  name: string;
  createdById: string;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  members: GroupMemberSummary[];
};

export type ListMyGroupsResult = {
  groups: GroupSummary[];
  nextCursor: string | null;
};

export type ListMyGroupsInput = {
  userId: string;
  cursor?: string;
  limit: number;
};

export type InviteSummary = {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterName: string | null;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
};

export type ListPendingInvitesInput = {
  userId: string;
};

export type ListPendingInvitesResult = {
  invites: InviteSummary[];
};

export type SendInvitesInput = {
  inviterId: string;
  groupId: string;
  /** E.164 phone numbers; max 10 per call (zod-enforced). */
  phoneNumbers: string[];
};

export type SendInvitesResult = {
  /** Number of invites actually created (skips already-pending/in-group). */
  created: number;
};

export type AcceptInviteInput = {
  inviteId: string;
  userId: string;
};

export type RejectInviteInput = {
  inviteId: string;
  userId: string;
};

export type LeaveGroupInput = {
  userId: string;
  groupId: string;
};