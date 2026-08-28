import { forwardRef, useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { colors, radius, spacing } from '@/theme';

export type InputState = 'default' | 'error' | 'success';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorText?: string;
  /** Optional element rendered at the start (icon, country picker, etc). */
  leftSlot?: React.ReactNode;
  /** Optional element rendered at the end (clear button, etc). */
  rightSlot?: React.ReactNode;
  containerClassName?: string;
  className?: string;
  style?: ViewStyle;
}

const stateToBorder: Record<InputState, string> = {
  default: 'border-border focus:border-border-focus',
  error: 'border-danger',
  success: 'border-success',
};

/**
 * Single-line text input. Owns label / helper / error layout so screens
 * don't have to repeat it.
 *
 *   <Input
 *     label="Phone number"
 *     placeholder="98XXX 12345"
 *     keyboardType="phone-pad"
 *     helperText="OTP will be sent to this number"
 *   />
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    helperText,
    errorText,
    leftSlot,
    rightSlot,
    containerClassName = '',
    className = '',
    onFocus,
    onBlur,
    editable = true,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const state: InputState = errorText ? 'error' : focused ? 'default' : 'default';

  const borderClass = stateToBorder[state];

  return (
    <View className={containerClassName}>
      {label ? (
        <Text variant="bodyStrong" tone="primary" className="mb-1.5">
          {label}
        </Text>
      ) : null}

      <View
        className={[
          'flex-row items-center bg-surface',
          'border rounded-md',
          borderClass,
          editable ? '' : 'opacity-60',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          borderRadius: radius.md,
          paddingHorizontal: spacing[3],
          minHeight: 48,
        }}
      >
        {leftSlot ? <View className="mr-2">{leftSlot}</View> : null}

        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={colors.text.tertiary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={[
            'flex-1 py-3 text-text-primary',
            editable ? '' : 'opacity-60',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ fontSize: 15, lineHeight: 22 }}
          {...rest}
        />

        {rightSlot ? <View className="ml-2">{rightSlot}</View> : null}
      </View>

      {errorText ? (
        <Text variant="caption" tone="danger" className="mt-1">
          {errorText}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="secondary" className="mt-1">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});
