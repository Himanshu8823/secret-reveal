import { useState } from 'react';
import { View, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors, spacing, radius } from '../../../src/theme';
import { uploadImage } from '../../../src/api/media.api';
import { useDiscardComposer } from '../../../src/features/composer/useDiscardComposer';
import {
  useComposerStore,
  type InteractionType,
  type MediaKind,
  validateInteractions,
} from '../../../src/store/composerStore';

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
  const attachments = useComposerStore((s) => s.attachments);
  const addAttachment = useComposerStore((s) => s.addAttachment);
  const updateAttachment = useComposerStore((s) => s.updateAttachment);
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const interactionTypes = useComposerStore((s) => s.interactionTypes);
  const ratingScale = useComposerStore((s) => s.ratingScale);
  const toggleInteraction = useComposerStore((s) => s.toggleInteraction);
  const setRatingScale = useComposerStore((s) => s.setRatingScale);
  const [localCaption, setLocalCaption] = useState(caption);
  // The caption only reaches the store on "Next", so pass the in-progress
  // local text in — otherwise typing then closing skips the prompt.
  const { confirmDiscard } = useDiscardComposer(localCaption);
  const dialog = useDialog();

  const captionOk = localCaption.trim().length >= 1 && localCaption.length <= CAPTION_MAX;
  const interactionError = validateInteractions(interactionTypes);
  const canContinue = captionOk && !interactionError;

  const atLimit = () => {
    if (attachments.length >= 5) {
      dialog.show({ variant: 'warning', title: 'Max 5 attachments', message: 'You can add up to 5 files.', actions: [{ label: 'OK' }] });
      return true;
    }
    return false;
  };

  const mintId = () =>
    `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /**
   * Add the file to the store immediately (so the chip shows with a
   * spinner), then upload it. Only after the upload resolves do we get a
   * real server `mediaId` — that is the ONLY value the create-post API
   * accepts. Posting the local `file://` uri is what produced a 400.
   */
  const startUpload = async (input: {
    uri: string;
    kind: MediaKind;
    filename: string;
    mimeType: string;
  }) => {
    const localId = mintId();
    const added = addAttachment({
      localId,
      kind: input.kind,
      localUri: input.uri,
      mediaId: null,
      url: null,
      status: 'uploading',
    });
    if (!added) return;

    try {
      const res = await uploadImage({
        uri: input.uri,
        filename: input.filename,
        mimeType: input.mimeType,
      });
      updateAttachment(localId, { status: 'uploaded', mediaId: res.mediaId, url: res.url });
    } catch (e) {
      updateAttachment(localId, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : 'Upload failed',
      });
    }
  };

  const pickFromLibrary = async (kind: 'image' | 'video') => {
    if (atLimit()) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      dialog.show({ variant: 'warning', title: 'Permission needed', message: 'Allow media access to attach files.', actions: [{ label: 'OK' }] });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: true,
      selectionLimit: 5 - attachments.length,
      quality: 0.8,
    });
    if (res.canceled) return;
    for (const asset of res.assets) {
      const fallbackExt = kind === 'image' ? 'jpg' : 'mp4';
      const name = asset.fileName ?? `${kind}_${Date.now()}.${fallbackExt}`;
      await startUpload({
        uri: asset.uri,
        kind,
        filename: name.replace(/[^a-zA-Z0-9._-]/g, '_'),
        mimeType: asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
      });
    }
  };

  const pickDocument = async (kind: 'audio' | 'pdf') => {
    if (atLimit()) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: kind === 'audio' ? 'audio/*' : 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset) return;
    await startUpload({
      uri: asset.uri,
      kind,
      filename: (asset.name ?? `${kind}_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_'),
      mimeType: asset.mimeType ?? (kind === 'audio' ? 'audio/mpeg' : 'application/pdf'),
    });
  };

  const retryUpload = async (localId: string) => {
    const att = attachments.find((a) => a.localId === localId);
    if (!att) return;
    updateAttachment(localId, { status: 'uploading', errorMessage: undefined });
    try {
      const res = await uploadImage({
        uri: att.localUri,
        filename: `${att.kind}_${Date.now()}`,
        mimeType:
          att.kind === 'image' ? 'image/jpeg'
          : att.kind === 'video' ? 'video/mp4'
          : att.kind === 'audio' ? 'audio/mpeg'
          : 'application/pdf',
      });
      updateAttachment(localId, { status: 'uploaded', mediaId: res.mediaId, url: res.url });
    } catch (e) {
      updateAttachment(localId, {
        status: 'error',
        errorMessage: e instanceof Error ? e.message : 'Upload failed',
      });
    }
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

  const onClose = confirmDiscard;

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
              <Text variant="caption" tone="secondary">{attachments.length}/5</Text>
            </View>

            {/* Four explicit pickers */}
            <View className="flex-row -mx-1 mb-1">
              {([
                { kind: 'image', label: 'Image', icon: 'image-outline', onPress: () => pickFromLibrary('image') },
                { kind: 'video', label: 'Video', icon: 'videocam-outline', onPress: () => pickFromLibrary('video') },
                { kind: 'audio', label: 'Audio', icon: 'musical-notes-outline', onPress: () => pickDocument('audio') },
                { kind: 'pdf', label: 'File', icon: 'document-text-outline', onPress: () => pickDocument('pdf') },
              ] as const).map((opt) => (
                <View key={opt.kind} className="w-1/4 px-1">
                  <Pressable
                    onPress={opt.onPress}
                    disabled={attachments.length >= 5}
                    accessibilityRole="button"
                    accessibilityLabel={`Attach ${opt.label}`}
                    className={['py-3 rounded-md border border-border bg-surface items-center active:opacity-70', attachments.length >= 5 ? 'opacity-40' : ''].join(' ')}
                    style={{ borderRadius: radius.md }}
                  >
                    <Ionicons name={opt.icon as never} size={20} color={colors.text.primary} />
                    <Text variant="caption" tone="secondary" className="mt-1">{opt.label}</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {/* Picked files */}
            <View className="flex-row flex-wrap -mx-1.5">
              {attachments.map((att) => (
                <View key={att.localId} className="w-1/4 px-1.5 my-1.5">
                  <View className="aspect-square rounded-md bg-surface-muted border border-border items-center justify-center overflow-hidden" style={{ borderRadius: radius.md }}>
                    {att.kind === 'image' ? (
                      <Image source={{ uri: att.localUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <Ionicons
                        name={att.kind === 'video' ? 'videocam' : att.kind === 'audio' ? 'musical-notes' : 'document-text'}
                        size={20}
                        color={colors.text.secondary}
                      />
                    )}
                    {att.status === 'uploading' ? (
                      <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}>
                        <ActivityIndicator size="small" color={colors.brand.primary} />
                      </View>
                    ) : null}
                    {att.status === 'error' ? (
                      <Pressable
                        onPress={() => retryUpload(att.localId)}
                        accessibilityLabel="Retry upload"
                        className="absolute inset-0 items-center justify-center"
                        style={{ backgroundColor: 'rgba(255,255,255,0.75)' }}
                      >
                        <Ionicons name="refresh" size={20} color={colors.semantic.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable onPress={() => removeAttachment(att.localId)} accessibilityLabel="Remove attachment" className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-danger items-center justify-center">
                    <Ionicons name="close" size={14} color={colors.text.onDark} />
                  </Pressable>
                  <Text
                    variant="caption"
                    tone={att.status === 'error' ? 'danger' : 'secondary'}
                    numberOfLines={1}
                    className="mt-1"
                  >
                    {att.status === 'uploading' ? 'Uploading…' : att.status === 'error' ? 'Failed' : att.kind}
                  </Text>
                </View>
              ))}
            </View>
            {attachments.length >= 5 ? (
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
