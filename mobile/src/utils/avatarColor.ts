import { colors } from '../theme';

/**
 * Light pastel badge backgrounds for initials avatars (used when there's
 * no profile image). Weighted so light orange shows up most often — the
 * duplicate 'lightOrange' entries below are the weighting mechanism, not
 * a mistake.
 */
const LIGHT_PALETTE = [
  '#FFB020', // orange
  '#7A4DFF', // purple
  '#1B5E20', // dark green
];

/** Deterministic pick from the light palette, stable per seed (e.g. user id). */
export function avatarColorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LIGHT_PALETTE[h % LIGHT_PALETTE.length] as string;
}
