import { Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, elevation } from '../theme';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Floating action button. Phase 3.1: bottom-right of the menu area, just
 * above the tab bar. Opens the Create Post flow (modal stack push).
 *
 * Uses nativeWind classes that read from `tailwind.config.cjs` /
 * `src/theme/*` — no hardcoded colors or magic numbers here. Spacing is
 * `p-5` (20) on the right and `bottom-20` (80 px) to clear the 64 px tab
 * bar with breathing room. Elevation token `3` is the brand-tinted lift
 * that matches the design system.
 */
export function Fab({ onPress, accessibilityLabel = 'Create post' }: Props) {
  return (
    <View
      pointerEvents="box-none"
      className="absolute right-5 bottom-6 z-10"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className="h-14 w-14 rounded-full bg-primary items-center justify-center active:bg-primary-pressed"
        style={elevation[3]}
      >
        <MaterialCommunityIcons name="plus" size={28} color={colors.brand.onPrimary} />
      </Pressable>
    </View>
  );
}
