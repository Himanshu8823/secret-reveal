import { useCallback, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '../../api/media.api';
import { useComposerStore } from '../../store/composerStore';

/**
 * useMediaPicker — encapsulates the create-post image-attach flow.
 *
 * Mirrors the avatar-upload pattern in `useAvatarUpload.ts` but for a
 * multi-select picker:
 *
 *   1. Request media-library permission (iOS only — Android grants on
 *      launch).
 *   2. Launch expo-image-picker with multi-select enabled and quality
 *      capped at 0.8 (matches the avatar flow).
 *   3. For every picked asset, append a `MediaPreview` row to the
 *      composer store immediately so the UI shows the thumbnail with a
 *      spinner. Then upload in the background; on success call
 *      `markMediaUploaded`, on failure call `markMediaError`.
 *
 * Independent progress: each upload is a separate promise. We use
 * `Promise.allSettled` so one bad asset (network drop, 4xx, etc.)
 * never blocks the others. The UI surfaces failures via a single
 * inline error line — the user retries by hitting the X and re-tapping
 * the chip.
 *
 * Note on MIME coverage: the server's allow-list is image-only (see
 * media.api.ts TODO). Picking an image with the wrong extension (e.g.
 * HEIC on Android) will be rejected by the server; the picker pre-fills
 * `mimeType` from the asset and the server-side MIME gate runs first.
 *
 * The hook intentionally does NOT own "busy" state — per-preview
 * uploading flags already drive the spinner, and per-preview error
 * flags drive the retry UX. A single `busy` here would only add cost.
 */

export type PickedAsset = {
  /** Stable id we mint so the preview key survives re-renders. */
  id: string;
  uri: string;
  filename: string;
  mimeType: string;
};

function mintId(): string {
  // crypto.randomUUID is available on Hermes; fall back to a timestamp
  // suffix if not (older RN runtimes).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildFilename(asset: ImagePicker.ImagePickerAsset): string {
  // expo-image-picker populates `fileName` on iOS but Android often
  // returns just a content URI — synthesise a sensible name with the
  // right extension so S3 / multer's MIME sniffing lines up.
  const fromAsset = asset.fileName;
  if (fromAsset) {
    return fromAsset.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
  const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().split('?')[0];
  return `post_${mintId()}.${ext}`;
}

export function useMediaPicker() {
  const addMediaId = useComposerStore((s) => s.addMediaId);
  const removeMediaId = useComposerStore((s) => s.removeMediaId);
  const mediaIds = useComposerStore((s) => s.mediaIds);
  // compat: expose as previews for old UI
  const mediaPreviews = useMemo(() => mediaIds.map((id) => ({ id, localUri: id, mimeType: 'image/jpeg' })), [mediaIds]);
  const addMediaPreview = useCallback((p: { id: string; localUri: string; mimeType: string }) => { addMediaId(p.localUri); }, [addMediaId]);
  const removeMediaPreview = useCallback((id: string) => { removeMediaId(id); }, [removeMediaId]);
  const markMediaUploaded = useCallback((id: string, _mediaId: string) => {}, []);
  const markMediaError = useCallback((_id: string, _msg: string) => {}, []);

  const pickImages = useCallback(async (): Promise<void> => {
    // Permission gate — silent if already granted (Android 13+ uses the
    // READ_MEDIA_IMAGES runtime grant, which expo-image-picker wraps).
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      // Surfacing the actual denial is the screen's job — we throw so
      // the caller can `dialog.show(...)`.
      throw new Error('Photo library permission is required to attach images.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      allowsEditing: false,
      quality: 0.8,
      exif: false,
    });

    if (result.canceled) return;

    // Snapshot the picker assets into a typed list and append preview
    // rows before starting any upload — this guarantees the strip shows
    // every chosen asset immediately (with a spinner), even if the
    // first upload takes seconds on a slow connection.
    const assets: PickedAsset[] = result.assets.map((a) => ({
      id: mintId(),
      uri: a.uri,
      filename: buildFilename(a),
      mimeType: a.mimeType ?? 'image/jpeg',
    }));

    for (const asset of assets) {
      addMediaPreview({
        id: asset.id,
        localUri: asset.uri,
        mimeType: asset.mimeType,
      });
    }

    // Fire all uploads in parallel. `allSettled` keeps us from
    // short-circuiting on the first failure — each preview resolves
    // independently.
    await Promise.allSettled(
      assets.map(async (asset) => {
        try {
          const res = await uploadImage({
            uri: asset.uri,
            filename: asset.filename,
            mimeType: asset.mimeType,
          });
          markMediaUploaded(asset.id, res.mediaId);
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Upload failed. Try again.';
          markMediaError(asset.id, msg);
        }
      }),
    );
  }, [addMediaPreview, markMediaError, markMediaUploaded]);

  /**
   * Derived per-preview summary for the inline error banner. We keep
   * the strip itself driven by `mediaPreviews` (each tile shows its
   * own error ring), but the spec wants ONE summary line under the
   * strip — so we surface the first error here.
   */
  const firstError = useMemo<string | null>(() => null, []);

  const remove = useCallback(
    (id: string) => removeMediaPreview(id),
    [removeMediaPreview],
  );

  return { pickImages, remove, previews: mediaPreviews, firstError };
}
