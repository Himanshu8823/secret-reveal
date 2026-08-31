import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { GroupSummary } from '../api/groups.api';
import { Text } from './ui';
import { formatRelative } from '../utils/formatRelative';

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
 * Member avatar URLs aren't in the API yet — fall back to initials in
 * deterministically-coloured circles (one colour per row).
 */
export function GroupRow({ group, onPress }: Props) {
  const initials = nameInitials(group.name);
  const colors3 = avatarPalette(group.name);

  return (
    <Pressable
      onPress={onPress ? () => onPress(group) : undefined}
      className="flex-row items-center bg-surface border border-border rounded-lg p-4 mb-3 active:bg-surface-muted"
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
    >
      <View className="relative w-16 h-8 mr-3">
        <View
          className="absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-surface items-center justify-center"
          style={{ backgroundColor: colors3[0] }}
        >
          <Text variant="caption" tone="onDark" bold>
            {initials[0]}
          </Text>
        </View>
        <View
          className="absolute top-0 left-4 w-8 h-8 rounded-full border-2 border-surface items-center justify-center"
          style={{ backgroundColor: colors3[1] }}
        >
          <Text variant="caption" tone="onDark" bold>
            {initials[1] ?? initials[0]}
          </Text>
        </View>
        <View
          className="absolute top-0 left-8 w-8 h-8 rounded-full border-2 border-surface items-center justify-center"
          style={{ backgroundColor: colors3[2] }}
        >
          <Text variant="caption" tone="onDark" bold>
            {group.memberCount > 3 ? `+${group.memberCount - 2}` : initials[2] ?? initials[0]}
          </Text>
        </View>
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

/** Up to two initials for the avatar stack. */
function nameInitials(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return ['?'];
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return [parts[0][0]?.toUpperCase() ?? '?'];
  return [(parts[0][0] ?? '?').toUpperCase(), (parts[1][0] ?? '?').toUpperCase()];
}

/** Deterministic three-colour palette from the group name (stable hash). */
function avatarPalette(name: string): [string, string, string] {
  const palette = [
    ['#0B49FA', '#7A4DFF', '#22C7B7'],
    ['#22C7B7', '#0B49FA', '#FFB020'],
    ['#7A4DFF', '#FF3D7F', '#0B49FA'],
    ['#FFB020', '#0B49FA', '#7A4DFF'],
    ['#FF3D7F', '#22C7B7', '#0B49FA'],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  const pick = palette[h % palette.length];
  return [pick[0], pick[1], pick[2]] as [string, string, string];
}

/**
 * Last-post preview line. In v1 the API returns `latestPost: null` for every
 * group, so we show a sensible placeholder rather than a blank string.
 */
function previewFor(group: GroupSummary): string {
  if (!group.latestPost) return `No posts yet · ${group.memberCount} member${group.memberCount === 1 ? '' : 's'}`;
  return 'Latest post preview';
}
