import { apiClient, unwrap } from './client';
import type { ApiEnvelope } from '../features/auth/types';

/**
 * Users API surface. The backend envelope is unwrapped here; callers see
 * only the typed `data` payload.
 *
 * User shape returned from /users/me is a subset of AuthUser — same fields
 * (id, phone, name). We reuse AuthUser here to avoid a parallel type for
 * what is structurally identical.
 */

export async function updateProfile(input: { name: string }): Promise<{
  id: string;
  phone: string;
  name: string | null;
}> {
  return unwrap<{ id: string; phone: string; name: string | null }>(
    apiClient.patch<ApiEnvelope<{ id: string; phone: string; name: string | null }>>(
      '/users/me',
      input,
    ),
  );
}