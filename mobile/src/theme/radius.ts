/**
 * Border-radius — see `docs/planning/00-DESIGN-TOKENS-EXTRACTION.md` §4.
 *
 * **Four radii, no more.** If a designer wants a different one, push back —
 * there must be a reason. Anything else gets `radius.full` (perfect circles)
 * or one of the four below.
 *
 *   sm   = 8   — chips, tag pills, secondary buttons inside cards
 *   md   = 12  — inputs, primary buttons (Send OTP, Google, Next)
 *   lg   = 16  — cards, modals, bottom sheets, post cards, list cards
 *   full = ∞   — avatars, story rings, FAB, circular icon buttons
 */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

export type RadiusToken = keyof typeof radius;
