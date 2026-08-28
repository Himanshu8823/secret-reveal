/**
 * Spacing scale — see `docs/planning/00-DESIGN-TOKENS-EXTRACTION.md` §3.
 *
 * 4-pt grid. `space.6` (24 px) is the default page-edge padding; reach for
 * other values deliberately.
 *
 * Use these via NativeWind classes (`p-4`, `gap-3`, `mt-6`) or the
 * `spacing[name]` constant for inline styles.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Page-edge padding used for full-screen pages (login, splash, etc). */
export const PAGE_PADDING = spacing[6];
