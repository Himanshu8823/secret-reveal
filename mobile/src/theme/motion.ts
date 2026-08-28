/**
 * Motion tokens — see `00-DESIGN-TOKENS-EXTRACTION.md` §7.
 *
 * Durations are in ms. Pair with Reanimated's default easing
 * `Easing.out(Easing.cubic)` which matches the spec's
 * `cubic-bezier(0.2, 0.8, 0.2, 1)`.
 */
export const motion = {
  fast: 120,
  base: 220,
  slow: 320,
} as const;

export type MotionToken = keyof typeof motion;
