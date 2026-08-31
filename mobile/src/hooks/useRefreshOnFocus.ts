import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Invalidate a React Query cache entry every time the screen gains focus.
 *
 * Why this exists: `refetchOnWindowFocus` only fires when the *whole app*
 * comes back to foreground (background → active). It does NOT fire when
 * the user navigates between screens inside the app — Expo Router
 * mounts/unmounts screens as the user moves through the stack, and React
 * Query has no visibility into that. So users coming back to the Groups
 * tab after creating a post elsewhere would see stale data unless we
 * explicitly invalidate.
 *
 * The `firstTimeRef` guard skips the very first focus event — that's the
 * initial mount, and the query is already fetching on mount. Without the
 * guard every screen would fire two refetches back-to-back on entry
 * (once via mount, once via focus).
 *
 * Usage:
 *   useRefreshOnFocus(['groups', 'mine']);
 *   useRefreshOnFocus(['users', 'me', 'stats']);
 *
 * Pair with `staleTime` > 0 so the focus invalidation triggers a real
 * refetch instead of a no-op (staleTime: 0 would force a refetch on
 * mount, but `refetchOnMount` already handles that — this hook covers
 * focus after mount).
 */
export function useRefreshOnFocus<T extends QueryKey>(queryKey: T): void {
  const queryClient = useQueryClient();
  const firstTimeRef = useRef(true);
  // Callers pass an inline array literal (e.g. `['group', groupId]`), which
  // is a new reference every render. Serializing it to a string gives
  // useCallback's dep array a stable primitive to compare, so the
  // memoized callback (and the effect useFocusEffect derives from it)
  // isn't recreated — and re-run — on every render while the screen stays
  // focused. Without this, invalidateQueries fires each render, which
  // triggers a refetch, a state update, a re-render, and repeats forever.
  const queryKeyString = JSON.stringify(queryKey);

  useFocusEffect(
    useCallback(() => {
      if (firstTimeRef.current) {
        firstTimeRef.current = false;
        return;
      }
      void queryClient.invalidateQueries({ queryKey });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, queryKeyString]),
  );
}