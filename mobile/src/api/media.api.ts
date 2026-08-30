import { apiClient, unwrap } from './client';

/**
 * Media API client.
 *
 * The mobile app uploads files by sending a multipart/form-data POST to
 * /media/upload with a single `file` field. The server proxies the
 * bytes to S3 (see backend/src/modules/media/) and returns the canonical
 * public URL + a Media row id.
 *
 * FormData + fetch: axios handles multipart natively — no need to set
 * Content-Type, the browser/runtime does it from the FormData boundary.
 */

export type UploadResponse = {
  mediaId: string;
  url: string;
};

/**
 * Upload a single image to S3 via the backend.
 *
 * Kept as the named entry point because (a) every existing caller
 * (`useAvatarUpload`) imports it by name, and (b) the MIME allow-list on
 * the server is currently image-only:
 *
 *   backend/src/middlewares/upload.ts
 *     ALLOWED_MIME = { image/jpeg, image/png, image/webp }
 *
 * The composer wants to ship video / audio / PDF soon, but the server
 * would 415 anything outside that set. Do NOT widen this client without
 * widening the server's allow-list first — the create-post chips will
 * silently 415 and the user will see a confusing upload failure.
 *
 * TODO: when backend/src/middlewares/upload.ts grows `video/mp4`,
 *       `audio/mpeg`, `application/pdf`, etc., expose `uploadMedia()`
 *       as the unified entry point and switch `useAvatarUpload` over to
 *       it. The shape stays identical — only the MIME gate changes.
 *
 * @param uri  Local file URI from expo-image-picker (e.g.
 *             "file:///.../photo.jpg")
 * @param filename  Original filename with extension (used for MIME
 *                  sniffing + S3 key suffix)
 * @param mimeType  e.g. "image/jpeg"
 */
export async function uploadImage(input: {
  uri: string;
  filename: string;
  mimeType: string;
}): Promise<UploadResponse> {
  const form = new FormData();
  // React Native's FormData accepts {uri, name, type} objects as file
  // entries — axios serialises them as multipart/form-data.
  form.append('file', {
    // The cast is because RN's FormData typings don't include the file
    // shape; the runtime accepts it. The `as unknown` keeps TS strict
    // mode honest without `any`.
    uri: input.uri,
    name: input.filename,
    type: input.mimeType,
  } as unknown as Blob);

  return unwrap<UploadResponse>(
    apiClient.post<{ success: true; data: UploadResponse }>(
      '/media/upload',
      form,
      {
        // Let axios / the runtime compute Content-Type with boundary.
        headers: { 'Content-Type': 'multipart/form-data' },
        // 1 GB cap — must be >= UPLOAD_MAX_BYTES on the server.
        timeout: 5 * 60 * 1000, // 5 min for slow uplinks
      },
    ),
  );
}
