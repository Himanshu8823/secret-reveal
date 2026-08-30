/**
 * Cold-start auth state machine.
 *
 * Goal: closing the app and reopening must NOT log the user out.
 *
 * Flow:
 *   1. Read the persisted refresh token from secure storage.
 *   2. If absent → unauthenticated, show login.
 *   3. If present → call the refresh endpoint to mint a new access token
 *      (and typically a rotated refresh token).
 *   4. Persist the rotated refresh token BEFORE clearing the old one, so
 *      a crash mid-rotation leaves us authenticated, not signed out.
 *   5. If the server says the refresh is invalid → unauthenticated,
 *      wipe the token, show login.
 *   6. Anything else (network down, server 5xx) → offline, preserve the
 *      token so the next boot can retry.
 */

import {
  getRefreshToken,
  setRefreshToken,
  clearRefreshToken,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
} from '../../utils/secureStorage';
import { useAuthStore } from '../../store/authStore';
import { refresh } from '../../api/auth.api';

export type AuthBootState =
  | { state: 'loading' }
  | { state: 'authenticated' }
  | { state: 'unauthenticated' }
  | { state: 'offline'; error: unknown };

export async function bootstrapAuth(): Promise<AuthBootState> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    // No persisted token AND no persisted user means this is a genuinely
    // fresh install. If we have a token, the standard flow above handles
    // it; if we don't, the user lands at login.
    const cachedUser = await getStoredUser();
    if (cachedUser) {
      // No refresh token but we do have a cached user — token was wiped
      // but the user record survived. Safest move: clear the orphan and
      // return unauthenticated so login shows.
      await clearStoredUser();
    }
    return { state: 'unauthenticated' };
  }

  try {
    const { accessToken, refreshToken: newRefresh, user } =
      await refresh({ refreshToken });
    // CRITICAL: write the new refresh token BEFORE clearing the old one.
    // A crash mid-rotation leaves us with the new (valid) token, not signed out.
    await setRefreshToken(newRefresh);
    await setStoredUser(user);
    useAuthStore.getState().setSession({
      accessToken,
      user,
      isNewUser: false,
    });
    return { state: 'authenticated' };
  } catch (e) {
    if (isAuthError(e)) {
      await clearRefreshToken();
      await clearStoredUser();
      return { state: 'unauthenticated' };
    }
    return { state: 'offline', error: e };
  }
}

function isAuthError(e: unknown): boolean {
  // Only 401/403 auth failures should wipe the persisted token.
  // 400 validation, 404, 422 etc must NOT clear — they are transient
  // and should go to `offline` so the next boot can retry with the same token.
  // Kill → login bug was because any 4xx (e.g. 404 when backend was down)
  // was treated as auth error and wiped the token.
  if (typeof e !== 'object' || e === null) return false;
  const err = e as {
    code?: string;
    response?: { status?: number; data?: { error?: { code?: string } } };
    status?: number;
  };
  const status = err.response?.status ?? err.status;
  const errorCode = err.response?.data?.error?.code ?? err.code;

  // Explicit token codes — always wipe
  if (
    errorCode === 'TOKEN_INVALID' ||
    errorCode === 'TOKEN_EXPIRED' ||
    errorCode === 'UNAUTHENTICATED' ||
    err.code === 'TOKEN_INVALID' ||
    err.code === 'TOKEN_EXPIRED' ||
    err.code === 'UNAUTHENTICATED'
  ) {
    return true;
  }

  // HTTP 401 only — not 404/400/422
  if (status === 401) return true;

  return false;
}
