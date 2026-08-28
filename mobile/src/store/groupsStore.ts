import { create } from 'zustand';

/**
 * Skeleton store. TanStack Query owns the live groups cache; this zustand
 * store exists so the Phase 3 Create flow can read the latest list of the
 * user's groups without re-fetching. Phase 3 will populate it from the
 * query client via setState.
 */
type State = {};

export const useGroupsStore = create<State>(() => ({}));
