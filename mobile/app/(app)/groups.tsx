import { useCallback } from 'react';
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  acceptInvite,
  listMyGroups,
  listPendingInvites,
  rejectInvite,
  type InviteSummary,
} from '../../src/api/groups.api';
import { GroupRow } from '../../src/components/GroupRow';
import { Fab } from '../../src/components/Fab';
import { EmptyState } from '../../src/components/EmptyState';
import { Button, Text, useDialog } from '../../src/components/ui';
import { useRefreshOnFocus } from '../../src/hooks/useRefreshOnFocus';
import { colors, elevation, radius } from '../../src/theme';

/**
 * Groups tab.
 *
 * Two stacked sections:
 *   1. Pending invites — a flat list of InviteSummary rows with Accept/Reject.
 *      New users see this first so they can join the groups they've been
 *      pulled into.
 *   2. Your groups — same list as Home, but here so the tab is useful in
 *      its own right. Section headers separate them visually.
 *
 * If both lists are empty, a single EmptyState fills the screen with a
 * pointer to the FAB. Pull-to-refresh refreshes both queries.
 *
 * The FAB stays bottom-right (unchanged from the Phase 2 placeholder) and
 * opens the create-group route at /(app)/groups/new.
 */
export default function GroupsScreen() {
  const queryClient = useQueryClient();
  const dialog = useDialog();

  const groupsQuery = useQuery({
    queryKey: ['groups', 'mine'],
    queryFn: () => listMyGroups(),
  });

  const invitesQuery = useQuery({
    queryKey: ['invites', 'pending'],
    queryFn: () => listPendingInvites(),
  });

  // Refresh when this tab regains focus (e.g. user came back from
  // creating a post that auto-added them to a new group, or accepted an
  // invite elsewhere). Skip the first focus — already handled by the
  // initial mount + refetchOnMount path.
  useRefreshOnFocus(['groups', 'mine']);
  useRefreshOnFocus(['invites', 'pending']);

  const onRefresh = useCallback(() => {
    groupsQuery.refetch();
    invitesQuery.refetch();
  }, [groupsQuery, invitesQuery]);

  const groups = groupsQuery.data?.groups ?? [];
  const invites = invitesQuery.data?.invites ?? [];

  const isInitialLoad = groupsQuery.isLoading && !groupsQuery.data;
  const showEmptyState =
    !isInitialLoad &&
    !groupsQuery.error &&
    groups.length === 0 &&
    invites.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="px-4 py-3">
        <Text variant="h1">Groups</Text>
        <Text variant="meta" tone="secondary" className="mt-1">
          {isInitialLoad
            ? 'Loading…'
            : `${groups.length} group${groups.length === 1 ? '' : 's'}${invites.length > 0 ? ` · ${invites.length} pending invite${invites.length === 1 ? '' : 's'}` : ''}`}
        </Text>
      </View>

      {showEmptyState ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            iconName="account-group-outline"
            title="No groups yet"
            subtitle="Tap + to start a new group, or wait for someone to invite you."
          />
        </View>
      ) : (
        <FlatList
          data={[
            // Render pending invites first, then groups. We tag each row
            // so the renderer knows which kind to draw.
            ...invites.map((i) => ({ kind: 'invite' as const, invite: i })),
            ...(invites.length > 0 && groups.length > 0
              ? [{ kind: 'header' as const, key: 'groups-header', label: 'Your groups' }]
              : []),
            ...groups.map((g) => ({ kind: 'group' as const, group: g })),
          ]}
          keyExtractor={(item, idx) => {
            if (item.kind === 'header') return item.key;
            if (item.kind === 'invite') return `inv-${item.invite.id}`;
            return `grp-${item.group.id}-${idx}`;
          }}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <Text
                  variant="caption"
                  tone="secondary"
                  className="mt-4 mb-2 uppercase"
                >
                  {item.label}
                </Text>
              );
            }
            if (item.kind === 'invite') {
              return (
                <InviteRow
                  invite={item.invite}
                  onAccepted={() => {
                    queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] });
                  }}
                  onChanged={() => {
                    queryClient.invalidateQueries({ queryKey: ['invites', 'pending'] });
                  }}
                  showError={(msg) =>
                    dialog.show({
                      variant: 'danger',
                      title: 'Could not respond',
                      message: msg,
                      actions: [{ label: 'OK' }],
                    })
                  }
                />
              );
            }
            return (
              <GroupRow
                group={item.group}
                onPress={() => router.push({ pathname: '/(app)/group/[id]', params: { id: item.group.id } })}
              />
            );
          }}
          contentContainerClassName="px-4 pb-24"
          ListEmptyComponent={
            isInitialLoad ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={colors.brand.primary} />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={
                (groupsQuery.isFetching && !groupsQuery.isLoading) ||
                (invitesQuery.isFetching && !invitesQuery.isLoading)
              }
              onRefresh={onRefresh}
              tintColor={colors.brand.primary}
            />
          }
        />
      )}

      <Fab
        onPress={() => router.push('/(app)/groups/new')}
        accessibilityLabel="Create group"
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Inline invite row — kept local until reused elsewhere (per CLAUDE.md).
// ---------------------------------------------------------------------------

type InviteRowProps = {
  invite: InviteSummary;
  onAccepted: () => void;
  onChanged: () => void;
  showError: (msg: string) => void;
};

function InviteRow({ invite, onAccepted, onChanged, showError }: InviteRowProps) {
  const acceptMut = useMutation({
    mutationFn: () => acceptInvite(invite.id),
    onSuccess: () => {
      onAccepted();
      onChanged();
    },
    onError: (e) => {
      showError(e instanceof Error ? e.message : 'Try again');
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectInvite(invite.id),
    onSuccess: () => {
      onChanged();
    },
    onError: (e) => {
      showError(e instanceof Error ? e.message : 'Try again');
    },
  });

  const busy = acceptMut.isPending || rejectMut.isPending;
  const inviterLabel = invite.inviterName ?? 'Someone';

  return (
    <View
      className="bg-surface border border-border rounded-lg p-4 mb-3"
      style={{ borderRadius: radius.lg, ...elevation[1] }}
    >
      <View className="flex-row items-center mb-3">
        <View
          className="w-9 h-9 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.brand.primary }}
        >
          <MaterialCommunityIcons
            name="account-multiple-plus-outline"
            size={18}
            color={colors.brand.onPrimary}
          />
        </View>
        <View className="flex-1 min-w-0">
          <Text variant="bodyStrong" numberOfLines={1}>
            {invite.groupName}
          </Text>
          <Text variant="meta" tone="secondary" numberOfLines={1}>
            {`${inviterLabel} invited you`}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Accept"
            variant="primary"
            size="md"
            fullWidth
            loading={acceptMut.isPending}
            disabled={busy}
            onPress={() => acceptMut.mutate()}
            accessibilityLabel={`Accept invite to ${invite.groupName}`}
          />
        </View>
        <View className="flex-1">
          <Button
            label="Reject"
            variant="secondary"
            size="md"
            fullWidth
            loading={rejectMut.isPending}
            disabled={busy}
            onPress={() => rejectMut.mutate()}
            accessibilityLabel={`Reject invite to ${invite.groupName}`}
          />
        </View>
      </View>
    </View>
  );
}