import { View, Image, Pressable, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

/**
 * AvatarWithCamera — WhatsApp-style profile picture + camera-overlay
 * button. The avatar (image or fallback icon) sits on top; a small
 * circular primary-fill button is anchored at the bottom-right with a
 * pencil / camera icon.
 *
 * Tap on the camera button calls `onCameraPress`. The avatar itself
 * is decorative — taps don't navigate anywhere (the parent screen
 * owns any "view profile" UX). `busy` shows a spinner over the camera
 * button during the upload.
 *
 * Tokens only: bg-surface-muted for the avatar background, radius.full
 * for both the avatar and the camera chip, elevation tokens are not
 * applied here because the inner image already provides visual weight.
 */
type Props = {
  avatarUrl?: string | null;
  size?: number;
  cameraSize?: number;
  busy?: boolean;
  onCameraPress?: () => void;
};

export function AvatarWithCamera({
  avatarUrl,
  size = 110,
  cameraSize = 36,
  busy = false,
  onCameraPress,
}: Props) {
  const cameraOffset = cameraSize * 0.65;

  return (
    <View
      style={{
        width: size,
        height: size,
        position: 'relative',
      }}
    >
      <View
        className="items-center justify-center bg-surface-muted overflow-hidden"
        style={{ width: size, height: size, borderRadius: radius.full }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size, borderRadius: radius.full }}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <MaterialCommunityIcons
            name="account-circle"
            size={size * 0.72}
            color={colors.text.tertiary}
          />
        )}
      </View>

      {/* Camera chip — bottom-right. The white border ring makes it
          pop against the avatar regardless of avatar background colour. */}
      {onCameraPress ? (
        <Pressable
          onPress={onCameraPress}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          className="absolute items-center justify-center active:opacity-80"
          style={{
            width: cameraSize,
            height: cameraSize,
            borderRadius: radius.full,
            right: -cameraOffset / 4,
            bottom: -cameraOffset / 4,
            backgroundColor: colors.brand.primary,
            borderWidth: 3,
            borderColor: colors.surface.bg,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.brand.onPrimary} />
          ) : (
            <Ionicons
              name="camera"
              size={cameraSize * 0.5}
              color={colors.brand.onPrimary}
            />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
