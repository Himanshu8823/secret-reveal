/**
 * Tailwind config. Plain CJS so it can be required by `jiti` inside
 * `withNativeWind` without resolving the TypeScript source from
 * `src/theme/`. All design tokens are mirrored here as plain JS literals,
 * kept in sync with `src/theme/colors.ts`, `src/theme/typography.ts`,
 * `src/theme/spacing.ts`, and `src/theme/radius.ts`. If you change a
 * token there, change it here too.
 *
 * Why a separate literal copy: `tailwind.config.js` is consumed by
 * `jiti` (the loader nativewind uses), and on Windows jiti cannot
 * resolve the `src/theme/index.ts` re-export through the TS source. The
 * source of truth for the values is still the `src/theme/*` modules;
 * the literals below just mirror them.
 */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',

  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      primary: {
        DEFAULT: '#0B49FA',
        pressed: '#0940D6',
        subtle: '#E8EEFE',
        on: '#FFFFFF',
      },
      accent: {
        violet: '#7A4DFF',
        pink: '#FF3D7F',
        amber: '#FFB020',
        teal: '#22C7B7',
      },
      surface: {
        DEFAULT: '#FFFFFF',
        bg: '#FFFFFF',
        muted: '#F5F6F8',
        divider: '#E4E5E7',
        overlay: 'rgba(17,17,17,0.55)',
      },
      text: {
        DEFAULT: '#111111',
        primary: '#111111',
        secondary: '#8A8D93',
        tertiary: '#B6B9BF',
        onDark: '#FFFFFF',
        link: '#0B49FA',
      },
      success: '#16A34A',
      warning: '#F59E0B',
      danger: '#EF4444',
      info: '#0EA5E9',
      border: {
        DEFAULT: '#E4E5E7',
        strong: '#D0D2D6',
        focus: '#0B49FA',
      },
      pill: {
        success: '#DCFCE7',
        warning: '#FEF3C7',
        danger: '#FEE2E2',
        info: '#E8EEFE',
      },
    },

    borderRadius: {
      none: 0,
      sm: 8,
      md: 12,
      lg: 16,
      full: 9999,
    },

    padding: {
      0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
    },
    margin: {
      0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
    },
    gap: {
      0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
    },
    space: {
      0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48,
    },

    fontSize: {
      'displaySplash': [40, { lineHeight: 48, fontWeight: '800' }],
      'h1':             [28, { lineHeight: 34, fontWeight: '800', letterSpacing: '-0.4' }],
      'h2':             [22, { lineHeight: 28, fontWeight: '700', letterSpacing: '-0.2' }],
      'h3':             [18, { lineHeight: 24, fontWeight: '700' }],
      'title':          [16, { lineHeight: 22, fontWeight: '700' }],
      'body':           [15, { lineHeight: 22, fontWeight: '400' }],
      'bodyStrong':     [15, { lineHeight: 22, fontWeight: '600' }],
      'meta':           [13, { lineHeight: 18, fontWeight: '400' }],
      'metaStrong':     [13, { lineHeight: 18, fontWeight: '600' }],
      'caption':        [12, { lineHeight: 16, fontWeight: '400' }],
      'button':         [15, { lineHeight: 22, fontWeight: '600' }],
      'monoTimer':      [48, { lineHeight: 56, fontWeight: '700' }],
    },

    boxShadow: {
      none: 'none',
      0: 'none',
      1: '0px 1px 2px rgba(17,17,17,0.06)',
      2: '0px 4px 12px rgba(17,17,17,0.08)',
      3: '0px 12px 32px rgba(11,73,250,0.18)',
    },

    ringColor: {
      DEFAULT: '#0B49FA',
      focus: '#0B49FA',
    },
    ringOffsetColor: {
      DEFAULT: '#FFFFFF',
    },
  },

  plugins: [],
};
