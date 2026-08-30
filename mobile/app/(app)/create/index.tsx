import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors, spacing } from '../../../src/theme';
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
  const dialog = useDialog();

  const canContinue = localCaption.trim().length >= 1 && localCaption.length <= CAPTION_MAX;

  const onNext = () => {
    if (!canContinue) {
      dialog.show({
        variant: 'warning',
        title: 'Add a caption',
        message: 'Write something (1 to 2000 characters).',
        actions: [{ label: 'OK' }],
      });
      return;
    }
    setCaption(localCaption.trim());
    router.push('/(app)/create/timer');
  };

  const onClose = () => {
    router.replace('/(app)');
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — 56 px, close + next */}
        <View
          className="h-14 px-4 flex-row items-center justify-between border-b border-border"
          style={{ borderBottomWidth: 0.5 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="Close create post"
            className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"
          >
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
          <View className="flex-row items-center gap-3">
            <Text variant="caption" tone="secondary">Step 1 of 3</Text>
            <Pressable
              onPress={onNext}
              hitSlop={8}
              accessibilityLabel="Next step"
              disabled={!canContinue}
              className={[
                'px-3 py-2 rounded-full active:opacity-90',
                canContinue ? 'bg-primary' : 'bg-border',
              ].join(' ')}
            >
              <Text
                variant="bodyStrong"
                tone={canContinue ? 'onDark' : 'secondary'}
              >
                Next
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-1 p-4">
          <TextInput
            className="min-h-[180px] text-text-primary"
            style={{
              fontSize: 18,
              fontWeight: '500',
              lineHeight: 26,
              paddingTop: spacing[1],
            }}
            placeholder="What do you want to discuss?"
            placeholderTextColor={colors.text.secondary}
            multiline
            autoFocus
            maxLength={CAPTION_MAX}
            value={localCaption}
            onChangeText={setLocalCaption}
            textAlignVertical="top"
          />

          <View className="flex-row flex-wrap mt-4 -mx-1.5">
            {MEDIA_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  // Inert in this slice — surface a hint so the tap is
                  // visibly acknowledged without breaking the layout.
                  dialog.show({
                    variant: 'info',
                    title: 'Coming soon',
                    message: `${opt.label} upload lands in Phase 3b.`,
                    actions: [{ label: 'OK' }],
                  });
                }}
                accessibilityLabel={opt.label}
                className="w-1/4 aspect-square items-center justify-center px-1.5 my-1.5 active:opacity-70"
              >
                <Ionicons name={opt.icon as never} size={22} color={colors.text.primary} />
                <Text variant="caption" tone="secondary" className="mt-1.5">
                  {opt.label}
                </Text>
              </Pressable>
            ))}
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
            accessibilityLabel="Continue to timer"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
