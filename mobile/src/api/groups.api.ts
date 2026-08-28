import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

export type GroupSummary = {
  id: string;
  name: string;
  createdById: string;
  lastActivityAt: string;
  createdAt: string;
  memberCount: number;
  latestPost: null;
};

export type ListGroupsResponse = {
  groups: GroupSummary[];
  nextCursor: string | null;
};

export async function listMyGroups(cursor?: string): Promise<ListGroupsResponse> {
  const params: Record<string, string> = { mine: 'true' };
  if (cursor) params.cursor = cursor;
  return unwrap<ListGroupsResponse>(
    apiClient.get<ApiEnvelope<ListGroupsResponse>>('/groups', { params }),
  );
}
