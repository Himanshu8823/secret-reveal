import type { TextStyle } from 'react-native';

/**
 * Typography scale — see `docs/planning/00-DESIGN-TOKENS-EXTRACTION.md` §5.
 *
 * System font stack for v1. Swapping in a custom face later (e.g. Inter via
 * `expo-font`) is a token-only change: keep the same keys so screens don't
 * have to migrate.
 *
 * Letter-spacing is given in px (RN's `letterSpacing` is unitless px).
 */
export const typography = {
  displaySplash: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '800',
  } satisfies TextStyle,

  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.4,
  } satisfies TextStyle,

  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.2,
  } satisfies TextStyle,

  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  } satisfies TextStyle,

  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  } satisfies TextStyle,

  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  } satisfies TextStyle,

  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  } satisfies TextStyle,

  meta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  } satisfies TextStyle,

  metaStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  } satisfies TextStyle,

  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  } satisfies TextStyle,

  button: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  } satisfies TextStyle,

  monoTimer: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '700',
  } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
