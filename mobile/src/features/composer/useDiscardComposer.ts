import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { router } from 'expo-router';
import { useDialog } from '../../components/ui';
import { useComposerStore } from '../../store/composerStore';

/**
 * Leaving the create-post flow throws away whatever the user has typed or
 * attached, so the exit points ask first. Shared by all three steps
 * (caption, timer, groups) so the prompt and the cleanup stay identical.
 *
 * `hasDraft` decides whether the prompt is worth showing: an untouched
 * composer just closes. Android's hardware back button is wired to the
 * same path — otherwise it would bypass the prompt entirely and silently
 * drop the draft.
 */
export function useDiscardComposer(pendingCaption?: string) {
  const dialog = useDialog();
  const reset = useComposerStore((s) => s.reset);
  const storedCaption = useComposerStore((s) => s.caption);
  const attachments = useComposerStore((s) => s.attachments);
  const interactionTypes = useComposerStore((s) => s.interactionTypes);
  const invitees = useComposerStore((s) => s.invitees);
  const groupName = useComposerStore((s) => s.groupName);

  // Step 1 holds the caption in local state until "Next" commits it, so
  // callers there pass the in-progress text explicitly.
  const caption = pendingCaption ?? storedCaption;

  const hasDraft =
    caption.trim().length > 0 ||
    attachments.length > 0 ||
    interactionTypes.length > 0 ||
    invitees.length > 0 ||
    groupName.trim().length > 0;

  const confirmDiscard = useCallback(() => {
    if (!hasDraft) {
      reset();
      router.replace('/(app)');
      return;
    }

    dialog.show({
      variant: 'warning',
      title: 'Discard this post?',
      message: 'Your caption, attachments and settings will be lost.',
      cancelLabel: 'Keep editing',
      actions: [
        {
          label: 'Discard',
          variant: 'danger',
          onPress: () => {
            reset();
            router.replace('/(app)');
          },
        },
      ],
    });
  }, [dialog, hasDraft, reset]);

  // Android hardware back — same prompt, same cleanup.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmDiscard();
      return true; // we handled it; don't let the default pop through
    });
    return () => sub.remove();
  }, [confirmDiscard]);

  return { confirmDiscard, hasDraft };
}
