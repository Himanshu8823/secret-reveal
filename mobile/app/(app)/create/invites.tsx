import { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors } from '../../../src/theme';
import { useComposerStore } from '../../../src/store/composerStore';
import { createPost } from '../../../src/api/posts.api';
import { listUsers } from '../../../src/api/users.api';

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

  const usersQuery = useQuery({
    queryKey: ['users', 'picker'],
    queryFn: () => listUsers({ limit: 50 }),
  });
  const pickerUsers = usersQuery.data?.users ?? [];

  const trimmedGroupName = localGroupName.trim();
  const [groupNameError, setGroupNameError] = useState<string | null>(null);
  const canPublish =
    !submitting &&
    trimmedGroupName.length >= 1 &&
    trimmedGroupName.length <= GROUP_NAME_MAX &&
    invitees.length >= 1 &&
    timerMinutes !== null;

  const onBack = () => router.back();
  const onClose = () => router.replace('/(app)');

  const onPublish = async () => {
    if (!canPublish) {
      if (trimmedGroupName.length === 0) {
        setGroupNameError('Group name is required');
        dialog.show({
          variant: 'warning',
          title: 'Group name required',
          message: 'Please enter a group name to publish.',
          actions: [{ label: 'OK' }],
        });
      }
      return;
    }
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
      const memberIds = invitees.map((i) => i.id);
      // Backend resolves / materialises the Group from the member-set
      // signature — same memberIds → existing group, new subset → new
      // group. The optional `groupName` is currently unused on the wire;
      // it's still persisted on the store for the future when the
      // backend can accept a name override (see flagged UX note).
      await createPost({
        memberIds,
        caption,
        mediaIds: [],
        timerMinutes,
        groupName: trimmedGroupName,
      });
      // Invalidate groups + posts + stats so Home, Group detail and
      // Profile stats refresh without manual pull.
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      reset();
      router.replace('/(app)');
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

          {/* Group name — compulsory */}
          <View className="mb-6">
            <Text variant="bodyStrong" className="mb-2.5">Group name *</Text>
            <View
              className={`border rounded-md bg-surface py-3 px-4 ${groupNameError ? 'border-danger' : 'border-border'}`}
            >
              <TextInput
                placeholder="Group name *"
                placeholderTextColor={colors.text.secondary}
                value={localGroupName}
                onChangeText={(v) => {
                  setLocalGroupName(v);
                  if (groupNameError) setGroupNameError(null);
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
            {groupNameError ? (
              <Text variant="caption" tone="danger" className="mt-1.5">
                {groupNameError}
              </Text>
            ) : (
              <Text variant="caption" tone="secondary" className="mt-1.5">
                Required — 1 to {GROUP_NAME_MAX} characters
              </Text>
            )}
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

          {/* Invite list — real users from DB */}
          <View className="mb-6">
            <Text variant="bodyStrong" className="mb-2.5">Invite people</Text>
            {usersQuery.isLoading ? (
              <View className="py-8 items-center rounded-lg bg-surface border border-border">
                <ActivityIndicator color={colors.brand.primary} />
                <Text variant="caption" tone="secondary" className="mt-2">
                  Loading users…
                </Text>
              </View>
            ) : usersQuery.error ? (
              <View className="py-6 items-center rounded-lg bg-surface border border-border px-4">
                <Text variant="body" tone="secondary" className="text-center">
                  Couldn't load users.
                </Text>
                <View className="mt-3">
                  <Button
                    label={usersQuery.isFetching ? 'Retrying…' : 'Refresh'}
                    variant="secondary"
                    size="md"
                    loading={usersQuery.isFetching}
                    onPress={() => usersQuery.refetch()}
                    accessibilityLabel="Refresh users"
                  />
                </View>
              </View>
            ) : pickerUsers.length === 0 ? (
              <View className="py-8 items-center rounded-lg bg-surface border border-border px-4">
                <Text variant="bodyStrong" className="text-center">
                  No users yet
                </Text>
                <Text variant="caption" tone="secondary" className="text-center mt-1">
                  No one to invite right now.
                </Text>
                <View className="mt-4">
                  <Button
                    label={usersQuery.isFetching ? 'Refreshing…' : 'Refresh'}
                    variant="secondary"
                    size="md"
                    loading={usersQuery.isFetching}
                    onPress={() => usersQuery.refetch()}
                    accessibilityLabel="Refresh users"
                  />
                </View>
              </View>
            ) : (
              <View className="rounded-lg bg-surface border border-border overflow-hidden">
                {pickerUsers.map((person) => {
                  const displayName = person.name ?? person.username ?? 'Unknown';
                  const isAdded = invitees.some((i) => i.id === person.id);
                  return (
                    <View
                      key={person.id}
                      className="flex-row items-center py-3 px-3.5 border-b border-border"
                      style={{ borderBottomWidth: 0.5 }}
                    >
                      <View className="w-9 h-9 rounded-full items-center justify-center mr-3 bg-primary-subtle">
                        <Text variant="bodyStrong" tone="primary">
                          {displayName.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        variant="body"
                        bold
                        numberOfLines={1}
                        className="flex-1 mr-3"
                      >
                        {displayName}
                      </Text>
                      <Pressable
                        onPress={() => toggleInvitee(person.id, displayName)}
                        accessibilityLabel={
                          isAdded ? `Remove ${displayName}` : `Add ${displayName}`
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
            )}
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
