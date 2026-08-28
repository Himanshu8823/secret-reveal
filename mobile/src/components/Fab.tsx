import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Floating action button. Phase 2: opens Create Post flow via the Create tab.
 * Visually identical to reference image 02's FAB — circular, primary fill,
 * centred + icon, soft elevation.
 */
export function Fab({ onPress, accessibilityLabel = 'Create' }: Props) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 96, // clears the tab bar (~83 px) + gives breathing room
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: '#0B49FA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B49FA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: '#0940D6',
  },
});
