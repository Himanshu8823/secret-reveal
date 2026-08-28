import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import type { GroupSummary } from '../api/groups.api';

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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
    >
      <View style={styles.avatarStack}>
        <View style={[styles.avatar, styles.avatar0, { backgroundColor: colors3[0] }]}>
          <Text style={styles.avatarText}>{initials[0]}</Text>
        </View>
        <View style={[styles.avatar, styles.avatar1, { backgroundColor: colors3[1] }]}>
          <Text style={styles.avatarText}>{initials[1] ?? initials[0]}</Text>
        </View>
        <View style={[styles.avatar, styles.avatar2, { backgroundColor: colors3[2] }]}>
          <Text style={styles.avatarText}>
            {group.memberCount > 3 ? `+${group.memberCount - 2}` : initials[2] ?? initials[0]}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.name} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatRelative(group.lastActivityAt)}
          </Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {previewFor(group)}
        </Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={20}
        color={colors.textSecondary}
        style={styles.chevron}
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

/** Lightweight "2h ago" formatter — no extra utils dep yet. */
function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  return `${wk}w`;
}

const AVATAR_SIZE = 32;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: '#F5F6F8',
  },
  avatarStack: {
    width: 64,
    height: AVATAR_SIZE,
    marginRight: 12,
  },
  avatar: {
    position: 'absolute',
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar0: { left: 0 },
  avatar1: { left: 16 },
  avatar2: { left: 32 },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: 8,
  },
  meta: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  preview: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  chevron: {
    marginLeft: 8,
  },
});
