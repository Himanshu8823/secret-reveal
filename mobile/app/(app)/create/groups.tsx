import { useState, useMemo } from 'react';
import { View, TextInput, Pressable, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Text, useDialog } from '../../../src/components/ui';
import { colors, radius } from '../../../src/theme';
import { useComposerStore } from '../../../src/store/composerStore';
import { createPost } from '../../../src/api/posts.api';
import { listUsers } from '../../../src/api/users.api';
import { listMyGroups } from '../../../src/api/groups.api';
import { useDiscardComposer } from '../../../src/features/composer/useDiscardComposer';
import { PublishOverlay, type PublishPhase } from '../../../src/components/PublishOverlay';

const GROUP_NAME_MAX = 60;

/**
 * How long the success tick stays up before we navigate away. Long enough
 * to register as confirmation, short enough not to feel like a wait — on a
 * fast network the request itself can finish in well under 200ms, and
 * without this the overlay would flash by unread.
 */
const SUCCESS_HOLD_MS = 900;

const holdSuccess = () => new Promise<void>((r) => setTimeout(r, SUCCESS_HOLD_MS));

export default function CreateGroupsScreen() {
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const caption = useComposerStore((s) => s.caption);
  const uploadedMediaIds = useComposerStore((s) => s.uploadedMediaIds);
  const { confirmDiscard } = useDiscardComposer();
  const hasPendingUploads = useComposerStore((s) => s.hasPendingUploads);
  const timerMinutes = useComposerStore((s) => s.timerMinutes);
  const interactionTypes = useComposerStore((s) => s.interactionTypes);
  const isPoll = interactionTypes.includes('poll');
  const pollMultiSelect = useComposerStore((s) => s.pollMultiSelect);
  const filledPollOptions = useComposerStore((s) => s.filledPollOptions);
  const groupName = useComposerStore((s) => s.groupName);
  const invitees = useComposerStore((s) => s.invitees);
  const selectedExistingGroupId = useComposerStore((s) => s.selectedExistingGroupId);
  const setGroupName = useComposerStore((s) => s.setGroupName);
  const toggleInvitee = useComposerStore((s) => s.toggleInvitee);
  const setSelectedExistingGroupId = useComposerStore((s) => s.setSelectedExistingGroupId);
  const reset = useComposerStore((s) => s.reset);

  const [activeTab, setActiveTab] = useState<'create' | 'existing'>('create');
  const [localGroupName, setLocalGroupName] = useState(groupName);
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Drives the publish overlay: spinner while the request runs, then a
  // tick that is held briefly so the confirmation is actually seen.
  const [publishPhase, setPublishPhase] = useState<PublishPhase>('idle');

  const usersQuery = useQuery({ queryKey: ['users', 'picker'], queryFn: () => listUsers({ limit: 50 }) });
  const groupsQuery = useQuery({ queryKey: ['groups', 'mine'], queryFn: () => listMyGroups() });

  const pickerUsers = usersQuery.data?.users ?? [];
  const groups = groupsQuery.data?.groups ?? [];

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return pickerUsers;
    const q = userSearch.trim().toLowerCase();
    return pickerUsers.filter((u) => {
      const n = (u.name ?? u.username ?? '').toLowerCase();
      return n.includes(q);
    });
  }, [pickerUsers, userSearch]);

  const filteredGroups = useMemo(() => {
    if (!groupSearch.trim()) return groups;
    const q = groupSearch.trim().toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const canPublishCreate = localGroupName.trim().length >= 1 && localGroupName.trim().length <= GROUP_NAME_MAX && invitees.length >= 1 && timerMinutes !== null && !submitting;
  const canPublishExisting = selectedExistingGroupId != null && timerMinutes !== null && !submitting;

  const onBack = () => router.back();
  const onClose = confirmDiscard;

  const publishCreate = async () => {
    if (!canPublishCreate) {
      if (!localGroupName.trim()) dialog.show({ variant: 'warning', title: 'Group name required', message: 'Enter group name', actions: [{ label: 'OK' }] });
      return;
    }
    if (timerMinutes === null) {
      dialog.show({ variant: 'warning', title: 'Pick a timer', message: 'Go back and choose timer', actions: [{ label: 'OK' }] });
      return;
    }
    if (hasPendingUploads()) {
      dialog.show({ variant: 'warning', title: 'Attachments uploading', message: 'Wait for the uploads to finish, then publish.', actions: [{ label: 'OK' }] });
      return;
    }
    setSubmitting(true);
    setPublishPhase('publishing');
    try {
      const memberIds = invitees.map((i) => i.id);
      await createPost({
        memberIds,
        caption,
        // Only server-issued ids — never the local file:// uri.
        mediaIds: uploadedMediaIds(),
        timerMinutes,
        groupName: localGroupName.trim(),
        allowedInteractions: interactionTypes.length ? interactionTypes : ['textComment'],
        // Poll fields go only with a poll — the backend rejects them
        // otherwise. Blank answer slots are stripped before sending.
        ...(isPoll
          ? { pollOptions: filledPollOptions(), pollMultiSelect }
          : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['group'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      reset();
      // Confirmation now lives in the overlay, not a dialog the user has to
      // dismiss — they published, so an extra OK tap is friction.
      setPublishPhase('published');
      await holdSuccess();
      router.replace('/(app)');
    } catch (e) {
      setPublishPhase('idle');
      dialog.show({ variant: 'danger', title: 'Publish failed', message: e instanceof Error ? e.message : 'Could not publish', actions: [{ label: 'OK' }] });
    } finally {
      setSubmitting(false);
    }
  };

  const publishExisting = async () => {
    if (!selectedExistingGroupId) {
      dialog.show({ variant: 'warning', title: 'Select a group', message: 'Pick a group to publish to', actions: [{ label: 'OK' }] });
      return;
    }
    if (timerMinutes === null) return;
    if (hasPendingUploads()) {
      dialog.show({ variant: 'warning', title: 'Attachments uploading', message: 'Wait for the uploads to finish, then publish.', actions: [{ label: 'OK' }] });
      return;
    }
    setSubmitting(true);
    setPublishPhase('publishing');
    try {
      await createPost({
        groupId: selectedExistingGroupId,
        caption,
        // Only server-issued ids — never the local file:// uri.
        mediaIds: uploadedMediaIds(),
        timerMinutes,
        allowedInteractions: interactionTypes.length ? interactionTypes : ['textComment'],
        // Poll fields go only with a poll — the backend rejects them
        // otherwise. Blank answer slots are stripped before sending.
        ...(isPoll
          ? { pollOptions: filledPollOptions(), pollMultiSelect }
          : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      queryClient.invalidateQueries({ queryKey: ['group', selectedExistingGroupId, 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'me', 'stats'] });
      reset();
      setPublishPhase('published');
      await holdSuccess();
      router.replace('/(app)');
    } catch (e) {
      setPublishPhase('idle');
      dialog.show({ variant: 'danger', title: 'Publish failed', message: e instanceof Error ? e.message : 'Could not publish', actions: [{ label: 'OK' }] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="h-14 px-4 flex-row items-center justify-between border-b border-border" style={{ borderBottomWidth: 0.5 }}>
        <Pressable onPress={onBack} hitSlop={12} className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"><Ionicons name="chevron-back" size={22} color={colors.text.primary} /></Pressable>
        <View className="flex-row items-center gap-3">
          <Text variant="caption" tone="secondary">Step 3 of 3</Text>
          <Pressable onPress={onClose} hitSlop={8} className="w-10 h-10 items-center justify-center rounded-full active:bg-surface-muted"><Ionicons name="close" size={24} color={colors.text.primary} /></Pressable>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row px-4 pt-3 gap-2">
        <Pressable onPress={() => setActiveTab('create')} className={['flex-1 py-3 min-h-[48px] rounded-md items-center justify-center border', activeTab === 'create' ? 'bg-primary border-primary' : 'bg-surface border-border'].join(' ')}>
          <Text variant="bodyStrong" tone={activeTab === 'create' ? 'onDark' : 'primary'}>Create group</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('existing')} className={['flex-1 py-3 min-h-[48px] rounded-md items-center justify-center border', activeTab === 'existing' ? 'bg-primary border-primary' : 'bg-surface border-border'].join(' ')}>
          <Text variant="bodyStrong" tone={activeTab === 'existing' ? 'onDark' : 'primary'}>Previous Groups</Text>
        </Pressable>
      </View>

      {activeTab === 'create' ? (
        <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" keyboardShouldPersistTaps="handled">
          <Text variant="h2" className="mb-4">Group Invitation</Text>
          <View className="mb-4">
            <Text variant="bodyStrong" className="mb-2">Group name *</Text>
            <View className="border rounded-md bg-surface py-3 px-4 border-border">
              <TextInput placeholder="Group name *" placeholderTextColor={colors.text.secondary} value={localGroupName} onChangeText={(v) => { setLocalGroupName(v); setGroupName(v); }} maxLength={GROUP_NAME_MAX} className="text-text-primary" style={{ fontSize: 15, fontWeight: '500' }} />
            </View>
          </View>

          <View className="mb-3 border border-border rounded-md bg-surface py-2 px-3 flex-row items-center">
            <Ionicons name="search-outline" size={16} color={colors.text.secondary} />
            <TextInput placeholder="Search users" placeholderTextColor={colors.text.secondary} value={userSearch} onChangeText={setUserSearch} className="flex-1 ml-2 text-text-primary" style={{ fontSize: 14 }} />
            {userSearch ? (
              <Pressable onPress={() => setUserSearch('')}><Ionicons name="close-circle" size={16} color={colors.text.secondary} /></Pressable>
            ) : null}
          </View>

          {invitees.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 mb-3">
              {invitees.map((inv) => (
                <View key={inv.id} className="flex-row items-center px-3 py-1.5 rounded-full bg-primary-subtle">
                  <Text variant="caption" bold tone="primary" className="mr-1.5">{inv.name}</Text>
                  <Pressable onPress={() => toggleInvitee(inv.id, inv.name)} hitSlop={8} className="w-5 h-5 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(17,17,17,0.08)' }}><Ionicons name="close" size={14} color={colors.text.primary} /></Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Text variant="bodyStrong" className="mb-2">Members</Text>
          {usersQuery.isLoading ? (
            <View className="py-8 items-center"><ActivityIndicator color={colors.brand.primary} /></View>
          ) : filteredUsers.length === 0 ? (
            <View className="py-6 items-center border border-border rounded-lg"><Text variant="caption" tone="secondary">No users found</Text></View>
          ) : (
            <View className="rounded-lg border border-border overflow-hidden">
              {filteredUsers.map((person) => {
                const displayName = person.name ?? person.username ?? 'Unknown';
                const isAdded = invitees.some((i) => i.id === person.id);
                return (
                  <View key={person.id} className="flex-row items-center py-3 px-3.5 border-b border-border" style={{ borderBottomWidth: 0.5 }}>
                    <View className="w-9 h-9 rounded-full items-center justify-center mr-3 bg-primary-subtle"><Text variant="bodyStrong" tone="primary">{displayName.slice(0, 1).toUpperCase()}</Text></View>
                    <Text variant="body" bold className="flex-1 mr-3" numberOfLines={1}>{displayName}</Text>
                    <Pressable onPress={() => toggleInvitee(person.id, displayName)} className={['px-3 py-2 rounded-sm border', isAdded ? 'bg-primary-subtle border-primary' : 'bg-surface border-border'].join(' ')}>
                      <Text variant="caption" bold tone="primary">{isAdded ? 'Added' : 'Add'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
          <View className="mt-4">
            <Button label={submitting ? 'Publishing...' : 'Publish'} variant="primary" size="lg" fullWidth loading={submitting} disabled={!canPublishCreate} onPress={publishCreate} />
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 px-4 pt-4">
          <View className="mb-3 border border-border rounded-md bg-surface py-2 px-3 flex-row items-center">
            <Ionicons name="search-outline" size={16} color={colors.text.secondary} />
            <TextInput placeholder="Search groups" placeholderTextColor={colors.text.secondary} value={groupSearch} onChangeText={setGroupSearch} className="flex-1 ml-2 text-text-primary" style={{ fontSize: 14 }} />
          </View>
          {groupsQuery.isLoading ? (
            <View className="py-8 items-center"><ActivityIndicator color={colors.brand.primary} /></View>
          ) : filteredGroups.length === 0 ? (
            <View className="py-8 items-center border border-border rounded-lg"><Text variant="caption" tone="secondary">No groups found</Text></View>
          ) : (
            <FlatList
              data={filteredGroups}
              keyExtractor={(g) => g.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => {
                const selected = selectedExistingGroupId === item.id;
                return (
                  <Pressable onPress={() => setSelectedExistingGroupId(item.id)} className={['p-4 mb-2 rounded-lg border flex-row items-center justify-between', selected ? 'bg-primary-subtle border-primary' : 'bg-surface border-border'].join(' ')} style={{ borderRadius: radius.lg }}>
                    <View className="flex-1 pr-3">
                      <Text variant="bodyStrong" numberOfLines={1}>{item.name}</Text>
                      <Text variant="caption" tone="secondary">{item.memberCount} members · {item.postCount ?? 0} posts</Text>
                    </View>
                    <View className={['w-[22px] h-[22px] rounded-full items-center justify-center border-2', selected ? 'border-primary' : 'border-border'].join(' ')}>
                      {selected ? <View className="w-2.5 h-2.5 rounded-full bg-primary" /> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
          <View className="pt-3 pb-2 border-t border-border bg-surface" style={{ borderTopWidth: 0.5 }}>
            <Button label={submitting ? 'Publishing...' : 'Publish to Group'} variant="primary" size="lg" fullWidth loading={submitting} disabled={!canPublishExisting} onPress={publishExisting} />
          </View>
        </View>
      )}

      <PublishOverlay phase={publishPhase} />
    </SafeAreaView>
  );
}
