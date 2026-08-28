import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.topBarRight}>
            <Text style={styles.stepLabel}>Step 2 of 3</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close create post"
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Set Result Timer</Text>
          <Text style={styles.subtitle}>
            After this time, responses become visible to everyone.
          </Text>

          <View style={styles.optionList}>
            {PRESETS.map((p) => {
              const isSelected = selected === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setSelected(p.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.optionRow,
                    isSelected && styles.optionRowSelected,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>{p.label}</Text>
                    <Text style={styles.optionSub}>{p.sub}</Text>
                  </View>
                  <View
                    style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}
                  >
                    {isSelected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}

            {selected === 'custom' ? (
              <View style={styles.customWrap}>
                <Text style={styles.customLabel}>Minutes</Text>
                <TextInput
                  style={styles.customInput}
                  value={customValue}
                  onChangeText={setCustomValue}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 90"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
                <Text style={styles.customHint}>
                  Between {CUSTOM_MIN} and {CUSTOM_MAX} minutes.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={onNext}
            disabled={!canContinue}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              !canContinue && styles.primaryButtonDisabled,
            ]}
            accessibilityLabel="Continue to invites"
          >
            <Text style={styles.primaryButtonText}>Next →</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
  },
  iconBtnPressed: { backgroundColor: '#F5F6F7' },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  optionList: {
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  optionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: '#E8EEFE',
  },
  optionRowPressed: { opacity: 0.85 },
  optionText: { flex: 1, paddingRight: 12 },
  optionLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  optionSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 9999,
    backgroundColor: colors.primary,
  },
  customWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  customLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  customInput: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  customHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: colors.primaryPressed },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    ...typography.button,
    color: '#FFFFFF',
  },
});
