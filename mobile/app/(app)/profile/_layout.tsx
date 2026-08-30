import { Stack } from 'expo-router';

/**
 * Nested Stack inside the Profile tab.
 *
 * The Profile tab in the parent Tabs layout is declared as `name="profile"`
 * (a folder, not a literal index file). expo-router auto-resolves that to
 * this Stack's `index.tsx`. `edit.tsx` is the only nested route — pushed
 * via `router.push('/(app)/profile/edit')` from the Profile screen and
 * popped with `router.back()` (or `router.replace('/(app)/profile')` from
 * the Edit screen's close/save handlers) when the user is done.
 *
 * No headers — each screen paints its own top bar (the Profile screen
 * has no top bar at all, the Edit screen renders a 56-px close + save
 * row). `animation: 'slide_from_right'` matches the native push feel
 * the rest of the app uses.
 *
 * Why a nested Stack rather than declaring both screens as hidden
 * Tabs.Screen entries: the previous approach leaked a literal
 * `profile/index` route into the tab bar because expo-router auto-
 * registers every file inside a Tabs folder. The folder's own
 * `_layout.tsx` is the canonical expo-router pattern for "tab with
 * one or more child screens" — it scopes the auto-registration to
 * this folder's children, which only `index.tsx` and `edit.tsx` are.
 */
export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
    </Stack>
  );
}
