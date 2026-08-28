import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors } from '../../../src/theme';
import { useComposerStore } from '../../../src/store/composerStore';
import { createGroup, createPost } from '../../../src/api/posts.api';

// ---------------------------------------------------------------------------
// Fixture invitees — contact sync lands later. Five fake users with stable
// ids so the create-group request can carry real-shape memberIds.
// ---------------------------------------------------------------------------

type Fixture = { id: string; name: string };

const FIXTURE_INVITEES: Fixture[] = [
  { id: 'u_fx_anya', name: 'Anya Sharma' },
  { id: 'u_fx_dev', name: 'Dev Patel' },
  { id: 'u_fx_meera', name: 'Meera Iyer' },
  { id: 'u_fx_rohan', name: 'Rohan Mehta' },
  { id: 'u_fx_zara', name: 'Zara Khan' },
];

const GROUP_NAME_MAX = 60;

export default function CreateInvitesScreen() {
  const queryClient = useQueryClient();

  const caption = useComposerStore((s) => s.caption);
  const timerMinutes = useComposerStore((s) => s.timerMinutes);
  const groupName = useComposerStore((s) => s.groupName);
  const invitees = useComposerStore((s) => s.invitees);
  const setGroupName = useComposerStore((s) => s.setGroupName);
  const toggleInvitee = useComposerStore((s) => s.toggleInvitee);
  const reset = useComposerStore((s) => s.reset);

  const [localGroupName, setLocalGroupName] = useState(groupName);
  const [submitting, setSubmitting] = useState(false);
  const dialog = useDialog();

  const canPublish =
    !submitting &&
    localGroupName.trim().length >= 1 &&
    localGroupName.trim().length <= GROUP_NAME_MAX &&
    invitees.length >= 1 &&
    timerMinutes !== null;

  const onBack = () => router.back();
  const onClose = () => router.dismissTo('/(app)/home');

  const onPublish = async () => {
    if (!canPublish) return;
    if (timerMinutes === null) {
      // Defensive — the timer screen enforces this, but never trust state.
      dialog.show({
        variant: 'warning',
        title: 'Pick a timer',
        message: 'Go back and choose how long this discussion should run.',
        actions: [{ label: 'OK' }],
      });
      return;
    }
    setSubmitting(true);
    try {
      const inviteeIds = invitees.map((i) => i.id);
      const group = await createGroup({
        name: localGroupName.trim(),
        memberIds: inviteeIds,
      });
      await createPost({
        groupId: group.id,
        caption,
        mediaIds: [],
        timerMinutes,
        // Pre-accepted invitees — these were already added as group
        // members in the call above. Passing them again as inviteeIds
        // persists the accepted GroupInvite rows in the same tx.
        inviteeIds,
      });
      // Invalidate groups + posts caches so Home refetches when we land
      // there and the new post appears in the "Recent discussions"
      // feed.
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      reset();
      router.dismissTo('/(app)/home');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not publish the post.';
      dialog.show({
        variant: 'danger',
        title: 'Publish failed',
        message,
        actions: [{ label: 'OK' }],
      });
    } finally {
      setSubmitting(false);
    }
  };

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
            <Text variant="caption" tone="secondary">Step 3 of 3</Text>
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

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-6 pb-6"
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="h2" className="mb-6">Group Invitation</Text>

          {/* Group name */}
          <View className="mb-6">
            <Text variant="bodyStrong" className="mb-2.5">Group name</Text>
            <View className="border border-border rounded-md bg-surface py-3 px-4">
              <TextInput
                placeholder="Group name"
                placeholderTextColor={colors.text.secondary}
                value={localGroupName}
                onChangeText={(v) => {
                  setLocalGroupName(v);
                  // Persist into the store as the user types so the back-nav
                  // round-trip preserves the value.
                  setGroupName(v);
                }}
                maxLength={GROUP_NAME_MAX}
                autoCorrect={false}
                className="text-text-primary"
                style={{ fontSize: 15, fontWeight: '500' }}
              />
            </View>
          </View>

          {/* Selected chips */}
          {invitees.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mb-4 -mt-2">
              {invitees.map((inv) => (
                <View
                  key={inv.id}
                  className="flex-row items-center px-3 py-1.5 rounded-full max-w-full bg-primary-subtle"
                >
                  <Text
                    variant="caption"
                    bold
                    tone="primary"
                    numberOfLines={1}
                    className="mr-1.5"
                  >
                    {inv.name}
                  </Text>
                  <Pressable
                    onPress={() => toggleInvitee(inv.id, inv.name)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${inv.name}`}
                    className="w-5 h-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'rgba(17,17,17,0.08)' }}
                  >
                    <Ionicons name="close" size={14} color={colors.text.primary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Invite list */}
          <View className="mb-6">
            <Text variant="bodyStrong" className="mb-2.5">Invite people</Text>
            <View className="rounded-lg bg-surface border border-border overflow-hidden">
              {FIXTURE_INVITEES.map((person) => {
                const isAdded = invitees.some((i) => i.id === person.id);
                return (
                  <View
                    key={person.id}
                    className="flex-row items-center py-3 px-3.5 border-b border-border"
                    style={{ borderBottomWidth: 0.5 }}
                  >
                    <View className="w-9 h-9 rounded-full items-center justify-center mr-3 bg-primary-subtle">
                      <Text variant="bodyStrong" tone="primary">
                        {person.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text
                      variant="body"
                      bold
                      numberOfLines={1}
                      className="flex-1 mr-3"
                    >
                      {person.name}
                    </Text>
                    <Pressable
                      onPress={() => toggleInvitee(person.id, person.name)}
                      accessibilityLabel={
                        isAdded ? `Remove ${person.name}` : `Add ${person.name}`
                      }
                      className={[
                        'px-3 py-2 rounded-sm border active:opacity-70',
                        isAdded
                          ? 'bg-primary-subtle border-primary'
                          : 'bg-surface border-border',
                      ].join(' ')}
                    >
                      <Text variant="caption" bold tone="primary">
                        {isAdded ? 'Added' : 'Add'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <Text variant="caption" tone="secondary" className="mt-2.5">
              Contact sync arrives in a later release. For now, pick from this list.
            </Text>
          </View>
        </ScrollView>

        <View
          className="px-4 pt-3 pb-2 border-t border-border bg-surface"
          style={{ borderTopWidth: 0.5 }}
        >
          <Button
            label="Publish"
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={!canPublish}
            onPress={onPublish}
            accessibilityLabel="Publish post"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
