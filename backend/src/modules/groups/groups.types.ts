/**
 * Public types of the groups module. Narrow on purpose: only what crosses
 * module boundaries (controller output, service inputs).
 *
 * Per CLAUDE.md: TypeScript everywhere, strict mode. No `any` without a
 * comment explaining why it's unavoidable.
 */

export type GroupMemberSummary = {
  userId: string;
  name: string | null;
  // Nullable because the column is; OTP signup always sets it.
  phone: string | null;
  joinedAt: Date;
};

export type GroupSummary = {
  id: string;
  name: string;
  lastActivityAt: Date;
  createdAt: Date;
  memberCount: number;
  postCount: number;
  // Phase 3a populates this; for now the column is null.
  latestPost: null;
  // First few members (by join order), for the avatar-stack preview on the
  // group list row. Real member identities, not a `memberCount`-derived
  // guess — the client used to fake this stack from the group name alone.
  memberPreview: GroupMemberSummary[];
};

export type GroupWithMembers = {
  id: string;
  name: string;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  members: GroupMemberSummary[];
  postCount: number;
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

export type LeaveGroupInput = {
  userId: string;
  groupId: string;
};

/**
 * Input for findOrCreateGroupByMembers — the post-creation entrypoint that
 * treats a group's identity as its member set, not its name. Two posts
 * selecting the same members resolve to the same group row regardless of
 * insertion order. `memberIds` are the other audience members; the author
 * is always added to the group in the same call.
 */
export type FindOrCreateGroupByMembersInput = {
  creatorId: string;
  memberIds: string[];
  customName?: string;
};

export type FindOrCreateGroupByMembersResult = {
  group: GroupSummary;
  created: boolean;
};

export type InviteSummary = {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterName: string | null;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
};

export type ListInvitesResult = {
  invites: InviteSummary[];
};

export type SendInvitesInput = {
  groupId: string;
  inviterId: string;
  phoneNumbers: string[];
};

export type SendInvitesResult = {
  created: number;
};
