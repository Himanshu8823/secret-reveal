import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { GroupSummary } from '../api/groups.api';
import { Text } from './ui';
import { formatRelative } from '../utils/formatRelative';
import { avatarColorFor } from '../utils/avatarColor';

type Props = {
  group: GroupSummary;
  onPress?: (group: GroupSummary) => void;
};

/**
 * One row in the Home groups list. Matches reference image 02 feel:
 *
 *   [AvatarStack: 3 overlapping circles]  [GroupName]   [3h]
 *                                            [last post preview]
 *
 * The stack renders the group's actual first members (`memberPreview`),
 * one circle per real person — colour keyed off their user id via
 * `avatarColorFor`, same as every other avatar in the app, not a
 * name-derived guess repeated three times. Member avatar photo URLs
 * aren't in the API yet, so each circle still falls back to initials.
 */
export function GroupRow({ group, onPress }: Props) {
  // Defensive fallback: memberPreview is always populated server-side (a
  // group always has at least the viewer), but a stale cached response
  // from before this field existed would otherwise render an empty stack.
  const previewMembers =
    group.memberPreview.length > 0
      ? group.memberPreview.slice(0, 3)
      : [{ userId: group.id, name: group.name, phone: null, joinedAt: group.createdAt }];
  const overflowCount = group.memberCount - previewMembers.length;
  const offsets = [0, 14, 28];

  return (
    <Pressable
      onPress={onPress ? () => onPress(group) : undefined}
      className="flex-row items-center bg-surface border border-border rounded-lg p-4 mb-3 active:bg-surface-muted"
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
    >
      <View className="relative w-16 h-8 mr-3">
        {previewMembers.map((member, i) => {
          const isLast = i === previewMembers.length - 1;
          const label = isLast && overflowCount > 0 ? `+${overflowCount}` : nameInitials(member.name)[0];
          return (
            <View
              key={member.userId}
              className="absolute top-0 w-8 h-8 rounded-full border-2 border-surface items-center justify-center"
              style={{ left: offsets[i], backgroundColor: avatarColorFor(member.userId) }}
            >
              <Text variant="caption" tone="onDark" bold>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-center mb-0.5">
          <Text variant="title" tone="primary" className="flex-1 mr-2" numberOfLines={1}>
            {group.name}
          </Text>
          <Text variant="meta" tone="secondary" numberOfLines={1}>
            {formatRelative(group.lastActivityAt)}
          </Text>
        </View>
        <Text variant="meta" tone="secondary" numberOfLines={1}>
          {previewFor(group)}
        </Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        className="ml-2 text-text-secondary"
      />
    </Pressable>
  );
}

/** Up to two initials for one avatar circle. */
function nameInitials(name: string | null): string[] {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return ['?'];
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return [parts[0][0]?.toUpperCase() ?? '?'];
  return [(parts[0][0] ?? '?').toUpperCase(), (parts[1][0] ?? '?').toUpperCase()];
}

/**
 * Sub-line under the group name: post count · member count.
 *
 * This used to branch on `group.latestPost`, but the API hardcodes that to
 * null for every group (Phase 3a will populate it), so the "No posts yet"
 * branch was unreachable-by-default and every group claimed to be empty
 * regardless of how many posts it actually had. `postCount` is real data,
 * so we drive the line off that instead and keep "No posts yet" for the
 * case it actually describes.
 */
function previewFor(group: GroupSummary): string {
  const members = `${group.memberCount} member${group.memberCount === 1 ? '' : 's'}`;
  if (group.postCount === 0) return `No posts yet · ${members}`;
  return `${group.postCount} post${group.postCount === 1 ? '' : 's'} · ${members}`;
}
