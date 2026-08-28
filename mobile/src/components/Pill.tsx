import { View, Text } from 'react-native';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type Props = { label: string; tone?: Tone };

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-text-primary',
  info: 'bg-pill-infoBg text-info',
  success: 'bg-pill-successBg text-success',
  warning: 'bg-pill-warningBg text-warning',
  danger: 'bg-pill-dangerBg text-danger',
};

/**
 * Throwaway primitive used to validate NativeWind compiles cleanly.
 * Will graduate to a real shared primitive as we build it out — keep
 * around in src/components/ for reuse on screens 3, 6, 9, 14, 16, 17.
 */
export function Pill({ label, tone = 'neutral' }: Props) {
  return (
    <View className={`self-start rounded-md px-3 py-1 ${toneClass[tone]}`}>
      <Text className="text-xs font-medium">{label}</Text>
    </View>
  );
}