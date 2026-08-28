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
  memberIds: string[];
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
