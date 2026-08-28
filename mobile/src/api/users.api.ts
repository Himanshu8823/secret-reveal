import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

/**
 * Users API surface. The backend envelope is unwrapped here; callers see
 * only the typed `data` payload.
 *
 * `UserProfile` mirrors the backend `users.types.ts` UserProfile: full
 * profile shape returned by GET /users/me and PATCH /users/me.
 */

export type UserProfile = {
  id: string;
  phone: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
};

export type UserStats = {
  posts: number;
  activeGroups: number;
};

/**
 * PATCH /users/me payload. All fields are optional; the service uses
 * `undefined` vs `null` to decide which columns to write.
 */
export type UpdateProfilePayload = {
  name?: string;
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
};

/**
 * GET /users/me — current user's full profile. Used by the profile screen
 * on mount via TanStack Query.
 */
export async function getMe(): Promise<UserProfile> {
  return unwrap<UserProfile>(
    apiClient.get<ApiEnvelope<UserProfile>>('/users/me'),
  );
}

/**
 * GET /users/me/stats — aggregate counts for the profile stats row.
 */
export async function getMyStats(): Promise<UserStats> {
  return unwrap<UserStats>(
    apiClient.get<ApiEnvelope<UserStats>>('/users/me/stats'),
  );
}

/**
 * PATCH /users/me — update the caller's profile. Returns the updated
 * `UserProfile` so callers can mirror it back into the auth store and
 * secure storage without a second GET round-trip.
 */
export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<UserProfile> {
  return unwrap<UserProfile>(
    apiClient.patch<ApiEnvelope<UserProfile>>('/users/me', payload),
  );
}
