import { View } from 'react-native';
import { Text } from './Text';
import { radius, spacing } from '@/theme';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface PillProps {
  label: string;
  tone?: PillTone;
  /** Render a small leading dot in the tone's solid color. */
  withDot?: boolean;
  className?: string;
}

const toneClass: Record<PillTone, { bg: string; text: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'secondary'; dot: string }> = {
  success: { bg: 'bg-pill-success', text: 'success', dot: 'bg-success' },
  warning: { bg: 'bg-pill-warning', text: 'warning', dot: 'bg-warning' },
  danger: { bg: 'bg-pill-danger', text: 'danger', dot: 'bg-danger' },
  info: { bg: 'bg-pill-info', text: 'info', dot: 'bg-info' },
  neutral: { bg: 'bg-surface-muted', text: 'primary', dot: 'bg-text-tertiary' },
};

/**
 * Inline status chip — used for "Accepted", "Pending", "Hidden Discussion",
 * "Locked responses", etc. Always self-sized, never full-width.
 */
export function Pill({ label, tone = 'neutral', withDot = false, className = '' }: PillProps) {
  const t = toneClass[tone];
  return (
    <View
      className={['self-start flex-row items-center', `px-${spacing[3] / 4}`, `py-${spacing[1] / 4}`, t.bg, className]
        .filter(Boolean)
        .join(' ')}
      style={{ borderRadius: radius.sm }}
    >
      {withDot ? <View className={`h-1.5 w-1.5 rounded-full mr-1.5 ${t.dot}`} /> : null}
      <Text variant="caption" tone={t.text} bold>
        {label}
      </Text>
    </View>
  );
}
