import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '../../../src/components/ui';
import { colors } from '../../../src/theme';
import { useComposerStore } from '../../../src/store/composerStore';

type PresetKey = '30m' | '1h' | '3h' | 'custom';

type Preset = {
  key: PresetKey;
  minutes: number | null; // null for custom
  label: string;
  sub: string;
};

const PRESETS: Preset[] = [
  { key: '30m', minutes: 30, label: '30 Minutes', sub: 'Best for quick discussions' },
  { key: '1h', minutes: 60, label: '1 Hour', sub: 'Perfect for short talks' },
  { key: '3h', minutes: 180, label: '3 Hours', sub: 'Deep thoughts take time' },
  { key: 'custom', minutes: null, label: 'Custom', sub: 'Set your own duration' },
];

const CUSTOM_MIN = 5;
const CUSTOM_MAX = 1440;

export default function CreateTimerScreen() {
  const stored = useComposerStore((s) => s.timerMinutes);
  const setTimer = useComposerStore((s) => s.setTimer);

  // Initial selection derives from the store when we revisit the screen.
  const initialKey: PresetKey =
    stored === 30 ? '30m' : stored === 60 ? '1h' : stored === 180 ? '3h' : 'custom';
  const [selected, setSelected] = useState<PresetKey>(initialKey);
  const [customValue, setCustomValue] = useState<string>(
    stored && stored !== 30 && stored !== 60 && stored !== 180 ? String(stored) : '',
  );

  const canContinue =
    selected !== 'custom' ||
    (customValue.trim() !== '' &&
      Number.isFinite(Number(customValue)) &&
      Number(customValue) >= CUSTOM_MIN &&
      Number(customValue) <= CUSTOM_MAX);

  const onNext = () => {
    if (selected === 'custom') {
      const n = Number(customValue);
      if (!Number.isFinite(n) || n < CUSTOM_MIN || n > CUSTOM_MAX) {
        Alert.alert('Invalid duration', `Enter between ${CUSTOM_MIN} and ${CUSTOM_MAX} minutes.`);
        return;
      }
      setTimer(Math.floor(n));
    } else {
      const preset = PRESETS.find((p) => p.key === selected);
      if (!preset || preset.minutes === null) return;
      setTimer(preset.minutes);
    }
    router.push('/(app)/create/invites');
  };

  const onBack = () => router.back();
  const onClose = () => router.dismissTo('/(app)/home');

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          className="h-14 px-4 flex-row items-center justify-between border-b border-border"
          style={{ borderBottomWidth: 0.5 }}
        >
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityLabel="Back"
            className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
          >
            <Ionicons name="chevron-back" size={22} color={colors.text.primary} />
          </Pressable>
          <View className="flex-row items-center gap-3">
            <Text variant="caption" tone="secondary">Step 2 of 3</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close create post"
              className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
            >
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </Pressable>
          </View>
        </View>

        <View className="flex-1 p-4 pt-6">
          <Text variant="h2" className="mb-1.5">Set Result Timer</Text>
          <Text variant="body" tone="secondary" className="mb-6">
            After this time, responses become visible to everyone.
          </Text>

          <View className="gap-3">
            {PRESETS.map((p) => {
              const isSelected = selected === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setSelected(p.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  className={[
                    'flex-row items-center justify-between p-4 rounded-md border active:opacity-85',
                    isSelected
                      ? 'bg-primary-subtle border-primary'
                      : 'bg-surface border-border',
                  ].join(' ')}
                >
                  <View className="flex-1 pr-3">
                    <Text variant="bodyStrong" tone="primary">{p.label}</Text>
                    <Text variant="caption" tone="secondary" className="mt-1">{p.sub}</Text>
                  </View>
                  <View
                    className={[
                      'w-[22px] h-[22px] rounded-full items-center justify-center border-2',
                      isSelected ? 'border-primary' : 'border-border',
                    ].join(' ')}
                  >
                    {isSelected ? (
                      <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}

            {selected === 'custom' ? (
              <View className="px-4 pt-2">
                <Text variant="caption" tone="secondary" className="mb-2">Minutes</Text>
                <View className="border border-primary rounded-md bg-surface py-3 px-4">
                  <TextInput
                    value={customValue}
                    onChangeText={setCustomValue}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 90"
                    placeholderTextColor={colors.text.secondary}
                    autoFocus
                    className="text-text-primary"
                    style={{ fontSize: 16, fontWeight: '500' }}
                  />
                </View>
                <Text variant="caption" tone="secondary" className="mt-2">
                  Between {CUSTOM_MIN} and {CUSTOM_MAX} minutes.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="px-4 pt-3 pb-2">
          <Button
            label="Next →"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={onNext}
            accessibilityLabel="Continue to invites"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
