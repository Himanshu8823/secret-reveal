import { create } from 'zustand';
import type { AuthUser } from '../features/auth/types';

/**
 * In-memory auth state. Access token lives here (zustand) and is gone on
 * app restart; the refresh token persists in expo-secure-store and is used
 * on cold-start to fetch a new access token via the refresh endpoint.
 *
 * The persisted user is rehydrated from expo-secure-store on boot via
 * bootstrapAuth() in src/features/auth/boot.ts.
 */

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  isNewUser: boolean;
  setSession: (input: {
    /**
     * Null is legal: a cold start with no network restores the user from
     * secure storage without a fresh access token. The axios interceptor
     * mints one on the first call once the server is reachable again.
     */
    accessToken: string | null;
    user: AuthUser;
    isNewUser: boolean;
  }) => void;
  /**
   * Updates ONLY the access token. Used after a silent refresh where the
   * user/isNewUser haven't changed — keeps the rest of the session
   * intact without re-issuing a full setSession call.
   */
  setAccessToken: (token: string | null) => void;
  /**
   * Wipes in-memory auth state. Callers that also need to clear
   * persisted data (refresh token, user) should call clearAllAuthData
   * from utils/secureStorage first. The composition lives in the auth
   * flow, not here, so the store stays a pure memory concern.
   */
  clear: () => void;
  /**
   * Alias for clear() kept for readability at the call site. The store
   * exposes both — pick whichever reads better where it's used.
   */
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isNewUser: false,
  setSession: ({ accessToken, user, isNewUser }) =>
    set({ accessToken, user, isNewUser }),
  setAccessToken: (token) => set({ accessToken: token }),
  clear: () => set({ accessToken: null, user: null, isNewUser: false }),
  signOut: () => set({ accessToken: null, user: null, isNewUser: false }),
}));
