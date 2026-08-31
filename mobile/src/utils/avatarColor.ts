import { colors } from '../theme';

/**
 * Light pastel badge backgrounds for initials avatars (used when there's
 * no profile image). Weighted so light orange shows up most often — the
 * duplicate 'lightOrange' entries below are the weighting mechanism, not
 * a mistake.
 */
const LIGHT_PALETTE = [
  '#FFE8CC', // light orange (derived from brand.accentAmber)
  '#FFE8CC',
  '#FFE8CC',
  colors.pill.successBg, // light green
  colors.pill.infoBg, // light blue
  colors.pill.warningBg, // light yellow
];

/** Deterministic pick from the light palette, stable per seed (e.g. user id). */
export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LIGHT_PALETTE[h % LIGHT_PALETTE.length] as string;
}
