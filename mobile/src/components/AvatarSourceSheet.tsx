import { Modal, Pressable, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from './ui';
import { colors, elevation, radius, spacing } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseFromLibrary: () => void;
};

/**
 * "Update photo" source picker — a small centred card with a close (X) in
 * the top-right corner and two full-width, stacked rows (Camera / Library)
 * instead of a row of buttons. Deliberately its own component rather than
 * routed through the generic Dialog: Dialog's action row is shared by every
 * confirm/cancel dialog in the app (Leave group, delete confirmations,
 * etc.), and this needed a different shape (icon rows, no cancel button)
 * that isn't worth bending that shared component for.
 */
export function AvatarSourceSheet({ visible, onClose, onTakePhoto, onChooseFromLibrary }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.surface.overlay }}
      >
        <Pressable onPress={() => {}}>
          <View
            className="bg-surface p-5"
            style={{ borderRadius: radius.lg, width: 300, maxWidth: '100%', ...elevation[2] }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text variant="h3" tone="primary">
                Update photo
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-8 h-8 items-center justify-center rounded-full active:bg-surface-muted"
              >
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </Pressable>
            </View>

            <View style={{ gap: spacing[2] }}>
              <SourceRow
                icon="camera-outline"
                label="Take Photo"
                onPress={() => {
                  onClose();
                  onTakePhoto();
                }}
              />
              <SourceRow
                icon="image-outline"
                label="Choose from Library"
                onPress={() => {
                  onClose();
                  onChooseFromLibrary();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SourceRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center p-3 rounded-md bg-primary active:bg-primary-pressed"
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.text.onDark} />
      <Text variant="bodyStrong" tone="onDark" className="ml-3">
        {label}
      </Text>
    </Pressable>
  );
}
