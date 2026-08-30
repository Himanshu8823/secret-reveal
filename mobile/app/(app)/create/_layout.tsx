import { Stack } from 'expo-router';

/**
 * Modal stack wrapping the Create Post flow. Slides up over the tab bar
 * so the user can dismiss with the native gesture or the X button each
 * screen renders. No header — each screen paints its own 56-px top bar
 * with close / back / next controls.
 */
export default function CreateLayout() {
  return (
    <Stack
      screenOptions={{
        presentation: 'modal',
        headerShown: false,
        animation: 'slide_from_bottom',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="timer" />
      <Stack.Screen name="groups" />
      <Stack.Screen name="invites" />
    </Stack>
  );
}
