const {
  brand,
  surface,
  text,
  semantic,
  border,
  pill,
  typography,
  spacing,
  radius,
  elevation,
} = require('./src/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class', // reserved for v2 — class-based toggle

  theme: {
    // Reset everything Tailwind ships by default so only our tokens are
    // available. Prevents accidental use of off-palette colors, magic
    // numbers, or system radii.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      primary: {
        DEFAULT: brand.primary,
        pressed: brand.primaryPressed,
        subtle: brand.primarySubtle,
        on: brand.onPrimary,
      },
      accent: {
        violet: brand.accentViolet,
        pink: brand.accentPink,
        amber: brand.accentAmber,
        teal: brand.accentTeal,
      },
      surface: {
        DEFAULT: surface.bg,
        bg: surface.bg,
        muted: surface.muted,
        divider: surface.divider,
        overlay: surface.overlay,
      },
      text: {
        DEFAULT: text.primary,
        primary: text.primary,
        secondary: text.secondary,
        tertiary: text.tertiary,
        onDark: text.onDark,
        link: text.link,
      },
      success: semantic.success,
      warning: semantic.warning,
      danger: semantic.danger,
      info: semantic.info,
      border: {
        DEFAULT: border.DEFAULT,
        strong: border.strong,
        focus: border.focus,
      },
      pill: {
        success: pill.successBg,
        warning: pill.warningBg,
        danger: pill.dangerBg,
        info: pill.infoBg,
      },
    },

    borderRadius: {
      none: 0,
      sm: radius.sm,
      md: radius.md,
      lg: radius.lg,
      full: radius.full,
    },

    padding: spacing,
    margin: spacing,
    gap: spacing,
    space: spacing,

    fontSize: Object.fromEntries(
      Object.entries(typography).map(([k, v]) => [
        k,
        [v.fontSize, v],
      ]),
    ),

    boxShadow: {
      none: 'none',
      0: 'none',
      1: '0px 1px 2px rgba(17,17,17,0.06)',
      2: '0px 4px 12px rgba(17,17,17,0.08)',
      3: '0px 12px 32px rgba(11,73,250,0.18)',
    },

    // Tailwind's default ring color now tracks `border.focus` (used by
    // inputs on focus).
    ringColor: {
      DEFAULT: border.focus,
      focus: border.focus,
    },
    ringOffsetColor: {
      DEFAULT: surface.bg,
    },
  },

  plugins: [],
};
