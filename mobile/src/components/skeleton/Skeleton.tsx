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
    <View className="p-4 mb-2 rounded-lg border border-border bg-surface" style={{ borderRadius: radius.lg }}>
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
    <View className="p-4 mb-3 rounded-lg border border-border bg-surface" style={{ borderRadius: radius.lg }}>
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
