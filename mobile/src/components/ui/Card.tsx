import { Pressable, View, type PressableProps, type ViewProps, type ViewStyle } from 'react-native';
import { elevation, radius, spacing } from '@/theme';

export type CardVariant = 'elevated' | 'flat' | 'outlined';

export interface CardProps extends Omit<ViewProps, 'style'> {
  variant?: CardVariant;
  /** Use Pressable semantics — becomes pressable on tap. */
  onPress?: PressableProps['onPress'];
  /** Pads the inner content. Defaults to `space.4` (16). */
  padding?: keyof typeof spacing;
  className?: string;
  style?: ViewStyle;
}

const variantClass: Record<CardVariant, string> = {
  elevated: 'bg-surface shadow-1',
  flat: 'bg-surface-muted',
  outlined: 'bg-surface border border-border',
};

/**
 * Surface container for grouped content — post cards, list rows, sheets.
 *
 * Variants:
 *   - elevated : default card. `elevation.1`, used for posts / list rows.
 *   - flat     : muted background, no shadow. For nested groups.
 *   - outlined : bordered, no fill. For inline callouts.
 */
export function Card({
  variant = 'elevated',
  onPress,
  padding = 4,
  className = '',
  style,
  children,
  ...rest
}: CardProps) {
  const containerStyle: ViewStyle = {
    borderRadius: radius.lg,
    padding: spacing[padding],
    ...(variant === 'elevated' ? elevation[1] : null),
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[containerStyle, style]}
        className={[variantClass[variant], className].filter(Boolean).join(' ')}
        {...(rest as PressableProps)}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      style={[containerStyle, style]}
      className={[variantClass[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </View>
  );
}
