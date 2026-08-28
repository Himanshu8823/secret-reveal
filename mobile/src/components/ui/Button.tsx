import { ActivityIndicator, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { radius, spacing } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

type ButtonSizeConfig = {
  py: keyof typeof spacing;
  px: keyof typeof spacing;
  text: 'button' | 'body' | 'bodyStrong';
};

const sizeConfig: Record<ButtonSize, ButtonSizeConfig> = {
  // py-1 / px-2 — tight, for inline / chip-style actions (Cancel, Edit).
  sm: { py: 1, px: 2, text: 'bodyStrong' },
  // py-2 / px-3 — default. Top/bottom 8 px, left/right 12 px.
  md: { py: 2, px: 3, text: 'button' },
  // py-3 / px-4 — primary CTA (Send OTP, Next). More presence on screen.
  lg: { py: 3, px: 4, text: 'button' },
};

/**
 * The only Button component the app should reach for.
 *
 * Variants map to documented actions:
 *   - primary   : the main CTA on a screen (Send OTP, Next, Continue)
 *   - secondary : an action paired with a primary, or a "use Google instead"
 *   - ghost     : text-only action inside a screen (Cancel, Learn more)
 *   - danger    : destructive action (Delete, Report, Reject)
 *
 * Variants choose their own colours; sizes only adjust padding and font.
 * The component owns loading and disabled state so callers can stay terse.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  leftSlot,
  rightSlot,
  className = '',
  style,
  ...rest
}: ButtonProps) {
  const sz = sizeConfig[size];
  const isDisabled = disabled || loading;

  const variantClass: Record<ButtonVariant, string> = {
    primary: 'bg-primary active:bg-primary-pressed',
    secondary: 'bg-surface-muted active:bg-surface-divider border border-border',
    ghost: 'bg-transparent active:bg-surface-muted',
    danger: 'bg-danger active:opacity-90',
  };
  const textTone: Record<ButtonVariant, 'onDark' | 'primary' | 'danger' | 'secondary'> = {
    primary: 'onDark',
    secondary: 'primary',
    ghost: 'primary',
    danger: 'onDark',
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={[
        { borderRadius: radius.md, opacity: isDisabled ? 0.55 : 1 },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}
      className={[
        'flex-row items-center justify-center',
        `py-${sz.py}`,
        `px-${sz.px}`,
        variantClass[variant],
        isDisabled ? '' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textTone[variant] === 'onDark' ? '#FFFFFF' : '#111111'}
        />
      ) : (
        <>
          {leftSlot ? <>{leftSlot}</> : null}
          <Text variant={sz.text} tone={textTone[variant]} className={leftSlot || rightSlot ? 'mx-2' : ''}>
            {label}
          </Text>
          {rightSlot ? <>{rightSlot}</> : null}
        </>
      )}
    </Pressable>
  );
}
