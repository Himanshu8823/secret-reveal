import { useState } from 'react';
import { View, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors, spacing, radius } from '../../../src/theme';
import { useComposerStore, type InteractionType, validateInteractions } from '../../../src/store/composerStore';

const CAPTION_MAX = 2000;

const INTERACTIONS: { key: InteractionType; label: string; icon: string; desc: string }[] = [
  { key: 'yesNo', label: 'Yes / No', icon: 'checkmark-done-outline', desc: 'Binary poll' },
  { key: 'textComment', label: 'Text', icon: 'chatbubble-outline', desc: 'Free text' },
  { key: 'reaction', label: 'Reaction', icon: 'happy-outline', desc: 'Any emoji' },
  { key: 'rating', label: 'Rating', icon: 'star-outline', desc: '1-5 or 1-10' },
  { key: 'like', label: 'Like', icon: 'heart-outline', desc: 'Heart toggle' },
];

export default function CreateCaptionScreen() {
  const caption = useComposerStore((s) => s.caption);
  const setCaption = useComposerStore((s) => s.setCaption);
  const mediaIds = useComposerStore((s) => s.mediaIds);
  const addMediaId = useComposerStore((s) => s.addMediaId);
  const removeMediaId = useComposerStore((s) => s.removeMediaId);
  const interactionTypes = useComposerStore((s) => s.interactionTypes);
  const ratingScale = useComposerStore((s) => s.ratingScale);
  const toggleInteraction = useComposerStore((s) => s.toggleInteraction);
  const setRatingScale = useComposerStore((s) => s.setRatingScale);
  const [localCaption, setLocalCaption] = useState(caption);
  const dialog = useDialog();

  const captionOk = localCaption.trim().length >= 1 && localCaption.length <= CAPTION_MAX;
  const interactionError = validateInteractions(interactionTypes);
  const canContinue = captionOk && !interactionError;

  const onPickMedia = async () => {
    if (mediaIds.length >= 5) {
      dialog.show({ variant: 'warning', title: 'Max 5 attachments', message: 'You can add up to 5 files.', actions: [{ label: 'OK' }] });
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({ variant: 'warning', title: 'Permission needed', message: 'Allow media access to attach files.', actions: [{ label: 'OK' }] });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, selectionLimit: 5 - mediaIds.length, quality: 0.8 });
    if (res.canceled) return;
    for (const asset of res.assets) {
      const ok = addMediaId(asset.uri);
      if (!ok) break;
    }
    // Note: asset.uri is local; real upload would create Media row and replace with mediaId. For now we store uri as placeholder id.
  };

  const onNext = () => {
    if (!captionOk) {
      dialog.show({ variant: 'warning', title: 'Add a caption', message: 'Write something (1 to 2000 characters).', actions: [{ label: 'OK' }] });
      return;
    }
    if (interactionError) {
      dialog.show({ variant: 'warning', title: 'Pick interaction type', message: interactionError, actions: [{ label: 'OK' }] });
      return;
    }
    setCaption(localCaption.trim());
    router.push('/(app)/create/timer');
  };

  const onClose = () => router.replace('/(app)');

  const hasYesNo = interactionTypes.includes('yesNo');
  const hasRating = interactionTypes.includes('rating');

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="h-14 px-4 flex-row items-center justify-between border-b border-border" style={{ borderBottomWidth: 0.5 }}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close create post" className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted">
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
          <View className="flex-row items-center gap-3">
            <Text variant="caption" tone="secondary">Step 1 of 3</Text>
            <Pressable onPress={onNext} hitSlop={8} accessibilityLabel="Next step" disabled={!canContinue} className={['px-3 py-2 rounded-full active:opacity-90', canContinue ? 'bg-primary' : 'bg-border'].join(' ')}>
              <Text variant="bodyStrong" tone={canContinue ? 'onDark' : 'secondary'}>Next</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="p-4 pb-6" keyboardShouldPersistTaps="handled">
          <TextInput
            className="min-h-[140px] text-text-primary"
            style={{ fontSize: 18, fontWeight: '500', lineHeight: 26, paddingTop: spacing[1] }}
            placeholder="What do you want to discuss?"
            placeholderTextColor={colors.text.secondary}
            multiline
            autoFocus
            maxLength={CAPTION_MAX}
            value={localCaption}
            onChangeText={setLocalCaption}
            textAlignVertical="top"
          />
          <Text variant="caption" tone="secondary" className="mt-1 self-end">
            {localCaption.length}/{CAPTION_MAX}
          </Text>

          {/* Attachments */}
          <View className="mt-5">
            <View className="flex-row items-center justify-between mb-2">
              <Text variant="bodyStrong">Attachments</Text>
              <Text variant="caption" tone="secondary">{mediaIds.length}/5</Text>
            </View>
            <View className="flex-row flex-wrap -mx-1.5">
              {mediaIds.map((id) => (
                <View key={id} className="w-1/4 px-1.5 my-1.5">
                  <View className="aspect-square rounded-md bg-surface-muted border border-border items-center justify-center" style={{ borderRadius: radius.md }}>
                    <Ionicons name="document-outline" size={20} color={colors.text.secondary} />
                  </View>
                  <Pressable onPress={() => removeMediaId(id)} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-danger items-center justify-center">
                    <Ionicons name="close" size={14} color={colors.text.onDark} />
                  </Pressable>
                  <Text variant="caption" tone="secondary" numberOfLines={1} className="mt-1">File</Text>
                </View>
              ))}
              {mediaIds.length < 5 ? (
                <Pressable onPress={onPickMedia} className="w-1/4 px-1.5 my-1.5 active:opacity-70">
                  <View className="aspect-square rounded-md border border-dashed border-border items-center justify-center bg-surface" style={{ borderRadius: radius.md }}>
                    <Ionicons name="add" size={22} color={colors.text.primary} />
                    <Text variant="caption" tone="secondary" className="mt-1">Add</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
            {mediaIds.length >= 5 ? (
              <Text variant="caption" tone="danger" className="mt-1">Max 5 attachments reached</Text>
            ) : null}
          </View>

          {/* Interaction Types */}
          <View className="mt-6">
            <Text variant="bodyStrong">Comment type *</Text>
            <Text variant="caption" tone="secondary" className="mt-1">Pick how people can respond. Like / Text / Reaction can combine with any. Yes/No and Rating cannot be together.</Text>
            <View className="flex-row flex-wrap gap-2 mt-3">
              {INTERACTIONS.map((it) => {
                const selected = interactionTypes.includes(it.key);
                const disabled = (it.key === 'yesNo' && hasRating) || (it.key === 'rating' && hasYesNo);
                return (
                  <Pressable
                    key={it.key}
                    onPress={() => toggleInteraction(it.key)}
                    disabled={disabled}
                    className={[
                      'flex-row items-center px-3 py-2 rounded-full border active:opacity-80',
                      selected ? 'bg-primary-subtle border-primary' : 'bg-surface border-border',
                      disabled ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    <Ionicons name={it.icon as never} size={14} color={selected ? colors.brand.primary : colors.text.secondary} />
                    <Text variant="caption" bold tone={selected ? 'primary' : 'secondary'} className="ml-1.5">{it.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {interactionError ? <Text variant="caption" tone="danger" className="mt-2">{interactionError}</Text> : null}
            {hasYesNo && hasRating ? <Text variant="caption" tone="danger" className="mt-2">Yes/No and Rating cannot be used together</Text> : null}

            {hasRating ? (
              <View className="mt-4">
                <Text variant="caption" tone="secondary" className="mb-2">Rating scale</Text>
                <View className="flex-row gap-2">
                  {[5, 10].map((s) => {
                    const sel = ratingScale === s;
                    return (
                      <Pressable key={s} onPress={() => setRatingScale(s as 5 | 10)} className={['flex-1 py-2.5 rounded-md border items-center', sel ? 'bg-primary border-primary' : 'bg-surface border-border'].join(' ')}>
                        <Text variant="bodyStrong" tone={sel ? 'onDark' : 'primary'}>1–{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View className="px-4 pt-3 pb-2 border-t border-border bg-surface" style={{ borderTopWidth: 0.5 }}>
          <Button label="Next →" variant="primary" size="lg" fullWidth disabled={!canContinue} onPress={onNext} accessibilityLabel="Continue to timer" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
