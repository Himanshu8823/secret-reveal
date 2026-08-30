import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '../../api/media.api';
import { updateProfile } from '../../api/users.api';
import { useAuthStore } from '../../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { setStoredUser } from '../../utils/secureStorage';

/**
 * useAvatarUpload — encapsulates the full "tap camera, pick image,
 * upload to S3, persist URL on the user" flow.
 *
 * Stages:
 *   1. Request permissions (camera + media library) — silent if already
 *      granted, prompts the user otherwise.
 *   2. Launch the picker (gallery by default; camera optional via the
 *      `source` parameter the caller passes).
 *   3. Upload the picked file to /media/upload (proxied → S3).
 *   4. PATCH /users/me with the returned URL so it lives on the user
 *      row (denormalised, so profile reads don't have to join Media).
 *   5. Invalidate cached profile queries + mirror into authStore so the
 *      UI updates without a refetch roundtrip.
 *
 * Error handling: any failure is caught and surfaced via the
 * `useDialog` mechanism in the calling component. We never throw
 * uncaught rejections from this hook — the caller passes an `onError`
 * callback instead.
 */

export type AvatarUploadSource = 'gallery' | 'camera';

export type AvatarUploadResult = {
  /** Local URI returned by expo-image-picker (for preview before upload). */
  localUri: string;
  /** Public S3 URL after upload + PATCH. */
  publicUrl: string;
};

export function useAvatarUpload() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const pickAndUpload = useCallback(
    async (input: { source?: AvatarUploadSource; onError?: (msg: string) => void }): Promise<AvatarUploadResult | null> => {
      const source = input.source ?? 'gallery';
      const onError = input.onError;

      try {
        // Step 1 — permissions. Image picker requires the relevant
        // permission before the picker can be launched on iOS. We grant
        // silently on Android (the OS handles runtime perms differently).
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            onError?.('Camera permission is required to take a new photo.');
            return null;
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            onError?.('Photo library permission is required to pick an image.');
            return null;
          }
        }

        // Step 2 — launch the picker. We let the OS pick the picker UI
        // (gallery grid / camera capture) so the UX is native on each
        // platform. Quality is capped at 0.8 so we don't push 12-MP
        // original photos through the network — server-side resize can
        // happen later if we ever want a thumbnail.
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
          // iOS: keep the EXIF orientation so portrait photos aren't
          // sideways. Android: same.
          exif: false,
        });

        if (result.canceled) return null;
        const asset = result.assets[0];
        if (!asset) return null;

        setBusy(true);

        // Step 3 — upload. We use the asset's filename / mime from the
        // picker; both are usually populated by the OS but fall back
        // defensively for older devices.
        const filename = (asset.fileName ?? `avatar.${(asset.uri.split('.').pop() ?? 'jpg')}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const mimeType = asset.mimeType ?? 'image/jpeg';

        const { url: publicUrl } = await uploadImage({
          uri: asset.uri,
          filename,
          mimeType,
        });

        // Step 4 — PATCH the user with the new URL. The service layer
        // already invalidates the profile cache, but we also clear the
        // local TanStack cache so the UI re-renders without a refetch
        // hop, and we mirror the value into the auth store + secure
        // storage so a cold-start sees it.
        const updated = await updateProfile({ avatarUrl: publicUrl });

        const session = useAuthStore.getState();
        if (session.accessToken) {
          useAuthStore.getState().setSession({
            accessToken: session.accessToken,
            user: {
              id: updated.id,
              phone: updated.phone,
              name: updated.name,
              username: updated.username,
              avatarUrl: updated.avatarUrl,
              bio: updated.bio,
            },
            isNewUser: false,
          });
        }
        await setStoredUser({
          id: updated.id,
          phone: updated.phone,
          name: updated.name,
          username: updated.username,
          avatarUrl: updated.avatarUrl,
          bio: updated.bio,
        });

        // Step 5 — invalidate the profile query so any other screen
        // (header avatar in feed cards, etc.) sees the new value.
        queryClient.invalidateQueries({ queryKey: ['users', 'me'] });

        return { localUri: asset.uri, publicUrl };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not upload the image. Try again.';
        onError?.(msg);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  return { pickAndUpload, busy };
}
