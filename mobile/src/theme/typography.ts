import { TextStyle } from 'react-native';

/**
 * Typography tokens. System font for now; if a custom face is decided on
 * later, swap in via `expo-font` and keep the token shape identical so
 * screens don't change.
 */
export const typography = {
  h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 } satisfies TextStyle,
  h2: { fontSize: 22, fontWeight: '700' } satisfies TextStyle,
  body: { fontSize: 16, fontWeight: '400' } satisfies TextStyle,
  bodyStrong: { fontSize: 16, fontWeight: '600' } satisfies TextStyle,
  caption: { fontSize: 13, fontWeight: '400' } satisfies TextStyle,
  button: { fontSize: 16, fontWeight: '600' } satisfies TextStyle,
} as const;
