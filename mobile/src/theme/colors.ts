/**
 * Design tokens sampled from the Login reference. Treat as close
 * approximations; exact hex should be confirmed against the Figma file
 * before final polish.
 */
export const colors = {
  primary: '#0B49FA',
  primaryPressed: '#0940D6',
  background: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#8A8D93',
  border: '#E4E5E7',
  googleButtonBorder: '#D0D2D6',
} as const;

export type ColorToken = keyof typeof colors;
