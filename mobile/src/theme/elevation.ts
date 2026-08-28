import type { ViewStyle } from 'react-native';

/**
 * Elevation / shadow tokens — see `00-DESIGN-TOKENS-EXTRACTION.md` §6.
 *
 * RN's `shadow*` props only work on iOS; Android uses `elevation`. We
 * emit a `ViewStyle` so the same object can be spread into either side.
 */
export const elevation = {
  0: { elevation: 0, shadowOpacity: 0 } satisfies ViewStyle,
  1: {
    elevation: 1,
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  } satisfies ViewStyle,
  2: {
    elevation: 8,
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  } satisfies ViewStyle,
  3: {
    elevation: 12,
    shadowColor: '#0B49FA',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
  } satisfies ViewStyle,
} as const;

export type ElevationToken = keyof typeof elevation;
