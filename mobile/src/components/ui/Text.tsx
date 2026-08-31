import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { typography, type TypographyToken } from '@/theme';

export type TextVariant = TypographyToken;
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'onDark' | 'link' | 'danger' | 'success' | 'warning' | 'info' | 'inherit';

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** Typography token. Defaults to `body`. */
  variant?: TextVariant;
  /** Color tone. Defaults to `primary`. */
  tone?: TextTone;
  /** Shorthand for `variant="bodyStrong"`. */
  bold?: boolean;
  /** Optional className merged via NativeWind (e.g. "text-center mt-2"). */
  className?: string;
  style?: TextStyle | TextStyle[];
}

const toneClass: Record<TextTone, string> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  tertiary: 'text-text-tertiary',
  onDark: 'text-text-onDark',
  link: 'text-text-link',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  inherit: '',
};

/**
 * The only Text component the app should reach for. All other
 * screen-level <Text> usages should migrate to this so that typography
 * stays consistent and the variant scale is the single source of truth.
 *
 * @example
 *   <Text variant="h1">Welcome Back</Text>
 *   <Text variant="body" tone="secondary">+91 98XXX 12345</Text>
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  bold = false,
  className = '',
  style,
  children,
  ...rest
}: TextProps) {
  const resolvedVariant: TextVariant = bold && variant === 'body' ? 'bodyStrong' : variant;
  const styleForVariant = typography[resolvedVariant];
  const toneCls = tone === 'inherit' ? '' : toneClass[tone];
  const mergedClassName = [toneCls, className].filter(Boolean).join(' ');

  return (
    <RNText
      className={mergedClassName}
      style={[styleForVariant, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
