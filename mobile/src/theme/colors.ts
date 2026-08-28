/**
 * Design tokens — colors.
 *
 * Source of truth: `docs/planning/00-DESIGN-TOKENS-EXTRACTION.md`.
 * All values are sampled from the reference screens and may be tightened
 * after a real-device pass. Do not introduce new tokens mid-sprint — open
 * a token PR instead.
 *
 * Structure mirrors the doc's section numbering so reviewers can cross-check
 * in seconds:
 *   2.1  brand    — primary, accent.*
 *   2.2  surface  — bg, muted, divider, overlay
 *   2.3  text     — primary, secondary, tertiary, onDark, link
 *   2.4  semantic — success, warning, danger, info
 *   2.5  border   — DEFAULT, strong, focus
 *   2.6  pill     — successBg, warningBg, dangerBg, infoBg
 */

export const colors = {
  brand: {
    primary: '#0B49FA',
    primaryPressed: '#0940D6',
    primarySubtle: '#E8EEFE',
    onPrimary: '#FFFFFF',
    accentViolet: '#7A4DFF',
    accentPink: '#FF3D7F',
    accentAmber: '#FFB020',
    accentTeal: '#22C7B7',
  },
  surface: {
    bg: '#FFFFFF',
    muted: '#F5F6F8',
    divider: '#E4E5E7',
    overlay: 'rgba(17,17,17,0.55)',
  },
  text: {
    primary: '#111111',
    secondary: '#8A8D93',
    tertiary: '#B6B9BF',
    onDark: '#FFFFFF',
    link: '#0B49FA',
  },
  semantic: {
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#0EA5E9',
  },
  border: {
    DEFAULT: '#E4E5E7',
    strong: '#D0D2D6',
    focus: '#0B49FA',
  },
  pill: {
    successBg: '#DCFCE7',
    warningBg: '#FEF3C7',
    dangerBg: '#FEE2E2',
    infoBg: '#E8EEFE',
  },
} as const;

/**
 * Back-compat flat exports. Existing screens / Tailwind config still read
 * `colors.primary`, `colors.primaryPressed`, etc. — keep them working.
 */
export const {
  brand: {
    primary,
    primaryPressed,
    primarySubtle,
    onPrimary,
    accentViolet,
    accentPink,
    accentAmber,
    accentTeal,
  },
  surface: { bg: background, muted: surfaceMuted, divider: surfaceDivider, overlay },
  text: { primary: textPrimary, secondary: textSecondary, tertiary: textTertiary, onDark, link: textLink },
  semantic: { success, warning, danger, info },
  border: { DEFAULT: borderDefault, strong: borderStrong, focus: borderFocus },
  pill: { successBg, warningBg, dangerBg, infoBg },
} = colors;

export type ColorToken = keyof typeof colors;
