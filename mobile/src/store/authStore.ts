import { create } from 'zustand';
import type { AuthUser } from '../features/auth/types';

/**
 * In-memory auth state. Access token lives here (zustand) and is gone on
 * app restart; the refresh token persists in expo-secure-store and would
 * be used to fetch a new access token via a refresh endpoint (out of scope
 * for this session per the kickoff).
 *
 * We do NOT persist `user` to disk yet — that's a separate decision and
 * out of scope for this phase.
 */

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  isNewUser: boolean;
  setSession: (input: {
    accessToken: string;
    user: AuthUser;
    isNewUser: boolean;
  }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isNewUser: false,
  setSession: ({ accessToken, user, isNewUser }) =>
    set({ accessToken, user, isNewUser }),
  clear: () => set({ accessToken: null, user: null, isNewUser: false }),
}));
