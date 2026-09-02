import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

// NOTE: no `createdById` here. A group IS its member set — there is no
// owner or creator column in the schema, and the API never sent one. The
// field was declared as a non-optional string but always arrived
// undefined, so anything trusting it would have read a lie.
export type GroupSummary = {
  id: string;
  name: string;
  lastActivityAt: string;
  createdAt: string;
  memberCount: number;
  postCount: number;
  latestPost: null;
};

export type ListGroupsResponse = {
  groups: GroupSummary[];
  nextCursor: string | null;
};

export type GroupDetail = {
  id: string;
  name: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Number of non-deleted posts in the group. The backend has always sent
   * this (groups.service.getGroup); it was missing from this type, so the
   * detail screen reached it through an `as unknown as` cast and fell back
   * to the length of the currently-loaded page — showing "0 posts" until
   * the first page arrived, and undercounting once it did.
   */
  postCount: number;
  members: Array<{
    userId: string;
    name: string | null;
    phone: string;
    role: string;
    joinedAt: string;
  }>;
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

export type ListInvitesResponse = {
  invites: InviteSummary[];
};

export type CreateGroupInput = {
  name: string;
  /** E.164 phone numbers to invite. Max 10 per request. */
  phoneNumbers: string[];
};

export type SendInvitesInput = {
  /** E.164 phone numbers to invite. Max 10 per request. */
  phoneNumbers: string[];
};

export type SendInvitesResult = {
  /** Count actually created (existing members / pending invites skipped). */
  created: number;
};

export async function listMyGroups(cursor?: string): Promise<ListGroupsResponse> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  return unwrap<ListGroupsResponse>(
    apiClient.get<ApiEnvelope<ListGroupsResponse>>('/groups', { params }),
  );
}

export async function getGroup(groupId: string): Promise<GroupDetail> {
  return unwrap<GroupDetail>(
    apiClient.get<ApiEnvelope<GroupDetail>>(`/groups/${groupId}`),
  );
}

export async function createGroup(input: CreateGroupInput): Promise<GroupDetail> {
  return unwrap<GroupDetail>(
    apiClient.post<ApiEnvelope<GroupDetail>>('/groups', input),
  );
}

export async function sendInvites(
  groupId: string,
  input: SendInvitesInput,
): Promise<SendInvitesResult> {
  return unwrap<SendInvitesResult>(
    apiClient.post<ApiEnvelope<SendInvitesResult>>(
      `/groups/${groupId}/invites`,
      input,
    ),
  );
}

export async function listPendingInvites(): Promise<ListInvitesResponse> {
  return unwrap<ListInvitesResponse>(
    apiClient.get<ApiEnvelope<ListInvitesResponse>>('/groups/invites/pending'),
  );
}

export async function acceptInvite(inviteId: string): Promise<InviteSummary> {
  return unwrap<InviteSummary>(
    apiClient.post<ApiEnvelope<InviteSummary>>(`/invites/${inviteId}/accept`),
  );
}

export async function rejectInvite(inviteId: string): Promise<InviteSummary> {
  return unwrap<InviteSummary>(
    apiClient.post<ApiEnvelope<InviteSummary>>(`/invites/${inviteId}/reject`),
  );
}

export async function leaveGroup(groupId: string): Promise<void> {
  await unwrap<null>(
    apiClient.delete<ApiEnvelope<null>>(`/groups/${groupId}/members/me`),
  );
}