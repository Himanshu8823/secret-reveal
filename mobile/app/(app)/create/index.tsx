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

const CAPTION_MAX = 2000;

type MediaOption = {
  key: 'image' | 'video' | 'audio' | 'more';
  label: string;
  icon: string;
};

// Present but inert in this slice — Phase 3b will wire actual uploads.
const MEDIA_OPTIONS: MediaOption[] = [
  { key: 'image', label: 'Image', icon: 'image-outline' },
  { key: 'video', label: 'Video', icon: 'videocam-outline' },
  { key: 'audio', label: 'Audio', icon: 'mic-outline' },
  { key: 'more', label: 'More', icon: 'add' },
];

export default function CreateCaptionScreen() {
  const caption = useComposerStore((s) => s.caption);
  const setCaption = useComposerStore((s) => s.setCaption);
  const [localCaption, setLocalCaption] = useState(caption);

  const canContinue = localCaption.trim().length >= 1 && localCaption.length <= CAPTION_MAX;

  const onNext = () => {
    if (!canContinue) {
      Alert.alert('Add a caption', 'Write something (1 to 2000 characters).');
      return;
    }
    setCaption(localCaption.trim());
    router.push('/(app)/create/timer');
  };

  const onClose = () => {
    router.dismissTo('/(app)/home');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — 56 px, close + next */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close create post"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.topBarRight}>
            <Text style={styles.stepLabel}>Step 1 of 3</Text>
            <Pressable
              onPress={onNext}
              hitSlop={8}
              accessibilityLabel="Next step"
              style={({ pressed }) => [
                styles.nextPill,
                pressed && styles.nextPillPressed,
                !canContinue && styles.nextPillDisabled,
              ]}
            >
              <Text style={[styles.nextPillText, !canContinue && styles.nextPillTextDisabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <TextInput
            style={styles.captionInput}
            placeholder="What do you want to discuss?"
            placeholderTextColor={colors.textSecondary}
            multiline
            autoFocus
            maxLength={CAPTION_MAX}
            value={localCaption}
            onChangeText={setLocalCaption}
            textAlignVertical="top"
          />

          <View style={styles.mediaGrid}>
            {MEDIA_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  // Inert in this slice — surface a hint so the tap is
                  // visibly acknowledged without breaking the layout.
                  Alert.alert('Coming soon', `${opt.label} upload lands in Phase 3b.`);
                }}
                accessibilityLabel={opt.label}
                style={({ pressed }) => [styles.mediaTile, pressed && styles.mediaTilePressed]}
              >
                <Ionicons name={opt.icon as never} size={22} color={colors.textPrimary} />
                <Text style={styles.mediaLabel}>{opt.label}</Text>
              </Pressable>
            ))}
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
            accessibilityLabel="Continue to timer"
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
  nextPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: colors.primary,
  },
  nextPillPressed: { backgroundColor: colors.primaryPressed },
  nextPillDisabled: { backgroundColor: '#E4E5E7' },
  nextPillText: {
    ...typography.bodyStrong,
    fontSize: 14,
    color: '#FFFFFF',
  },
  nextPillTextDisabled: { color: colors.textSecondary },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  captionInput: {
    minHeight: 180,
    fontSize: 18,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 26,
    paddingTop: 4,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    marginHorizontal: -6,
  },
  mediaTile: {
    width: '25%',
    aspectRatio: 1,
    marginVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTilePressed: { opacity: 0.7 },
  mediaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 6,
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
