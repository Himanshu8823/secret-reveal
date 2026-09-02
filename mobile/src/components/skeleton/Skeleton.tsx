import { View } from 'react-native';
import { colors, radius } from '../../theme';

type Props = {
  width?: number | string;
  height?: number;
  rounded?: number;
  className?: string;
};

export function Skeleton({ width = '100%', height = 12, rounded, className }: Props) {
  return (
    <View
      className={className}
      style={{
        width: width as never,
        height,
        borderRadius: rounded ?? radius.md,
        backgroundColor: colors.surface.muted,
        borderWidth: 0.5,
        borderColor: colors.border.DEFAULT,
        opacity: 0.9,
      }}
    />
  );
}

export function GroupRowSkeleton() {
  return (
    <View
      className="p-4 mb-2 rounded-lg border border-border bg-surface"
      style={{ borderRadius: radius.lg }}
    >
      <View className="flex-row items-center">
        <Skeleton width={40} height={40} rounded={9999} />
        <View className="flex-1 ml-3 gap-2">
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={10} />
        </View>
      </View>
    </View>
  );
}

export function PostCardSkeleton() {
  return (
    <View
      className="p-4 mb-3 rounded-lg border border-border bg-surface"
      style={{ borderRadius: radius.lg }}
    >
      <View className="flex-row items-center mb-3">
        <Skeleton width={36} height={36} rounded={9999} />
        <View className="flex-1 ml-3 gap-2">
          <Skeleton width="40%" height={12} />
          <Skeleton width="25%" height={10} />
        </View>
      </View>
      <Skeleton height={16} className="mb-2" />
      <Skeleton height={16} width="80%" className="mb-3" />
      <Skeleton height={160} rounded={radius.lg} />
    </View>
  );
}

/**
 * Profile screen placeholder.
 *
 * Mirrors app/(app)/profile/index.tsx block-for-block so the swap to real
 * content doesn't shift anything vertically. Every measurement below is
 * derived from the real components rather than eyeballed:
 *
 *   avatar      110      — AvatarWithCamera size prop
 *   name         28      — typography.h2.lineHeight
 *   username     16      — typography.caption.lineHeight
 *   edit button  38      — spacing[2] * 2 (py-2) + typography.button.lineHeight
 *   stat value   28      — h2 lineHeight, inside a p-4 card
 *   stat label   16      — caption lineHeight
 *   body line    22      — typography.body.lineHeight
 *
 * Widths are percentages, not fixed px, so the shapes stay proportional
 * across phone widths. The avatar and button are centred to match the
 * real `items-center` column.
 */
export function ProfileSkeleton() {
  return (
    <View>
      {/* Avatar + identity — mirrors the items-center pt-8 pb-4 block. */}
      <View className="items-center pt-8 pb-4">
        <Skeleton width={110} height={110} rounded={radius.full} />
        <View className="mt-4 items-center">
          <Skeleton width={160} height={28} />
        </View>
        <View className="mt-1 items-center">
          <Skeleton width={110} height={16} />
        </View>
        <View className="mt-5">
          <Skeleton width={132} height={38} rounded={radius.md} />
        </View>
      </View>

      {/* Stats row — two equal cards, same padding as the real ones. */}
      <View className="flex-row px-4 gap-3 mt-2">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </View>

      {/* About Me — heading, two bio lines, and the "Joined" meta row. */}
      <View className="px-4 mt-6">
        <Skeleton width={96} height={22} className="mb-2" />
        <Skeleton height={22} className="mb-2" />
        <Skeleton height={22} width="70%" />
        <View className="flex-row items-center mt-3">
          <Skeleton width={14} height={14} rounded={radius.sm} />
          <View className="ml-1.5">
            <Skeleton width={128} height={16} />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * One stat card. Split out only because it renders twice in the row above —
 * not a shared primitive, so it stays private to this file.
 */
function StatCardSkeleton() {
  return (
    <View className="flex-1 bg-surface-muted rounded-lg p-4 items-center">
      <Skeleton width={40} height={28} />
      <View className="mt-1">
        <Skeleton width={72} height={16} />
      </View>
    </View>
  );
}
