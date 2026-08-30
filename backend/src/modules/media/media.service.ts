import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';
import { putObject, publicUrlForKey } from '../../lib/s3.js';

/**
 * Media upload service.
 *
 * The upload is proxied: the mobile client POSTs the file to
 * /media/upload (multipart/form-data, field name "file"), we stream the
 * buffer to S3, and return the canonical public URL + a Media row id.
 *
 * Why proxy instead of pre-signed URLs:
 *   - Single API call from the mobile client — simpler error path
 *   - One place to enforce MIME / size limits (the multer middleware)
 *   - The S3 key is generated server-side with no user input, closing
 *     path-traversal / object-name squatting entirely
 *   - Trade-off: backend bandwidth scales with upload volume. When we
 *     need to drop that, switch to pre-signed URLs and the service
 *     signature below stays stable — only the controller changes.
 *
 * The Media row is the source of truth for "what URL is this image at"
 * for the rest of the app. The User.avatarUrl column stores the same
 * URL inline (denormalised) so the profile endpoint doesn't have to
 * join Media on every read. The two values are kept in sync inside
 * the same transaction.
 *
 * Key prefix: the caller specifies what kind of object this is. We
 * namespace under `avatars/` for user profile photos and `posts/` for
 * post attachments so the bucket stays organised. UUIDs prevent
 * collisions; the original extension is preserved so the served
 * Content-Type matches the bytes (we set it explicitly in the upload
 * anyway, but the extension helps debugging via S3 UI).
 */

export type MediaKind = 'avatar' | 'post';

export type UploadImageInput = {
  uploaderId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  /** Which bucket prefix to use — 'avatar' for profile photos, 'post' for post media. */
  kind: MediaKind;
};

export type UploadImageResult = {
  mediaId: string;
  url: string;
};

const KEY_PREFIX_BY_KIND: Record<MediaKind, string> = {
  avatar: 'avatars',
  post: 'posts',
};

function buildKey(kind: MediaKind, originalName: string): string {
  const prefix = KEY_PREFIX_BY_KIND[kind];
  const ext = extname(originalName).toLowerCase() || '.bin';
  return `${prefix}/${randomUUID()}${ext}`;
}

export async function uploadImage(input: UploadImageInput): Promise<UploadImageResult> {
  if (!env.S3_ENABLED) {
    throw new AppError(
      503,
      ErrorCode.INTERNAL,
      'Media uploads are temporarily disabled. Set S3_ENABLED=true in backend env.',
    );
  }

  const key = buildKey(input.kind, input.originalName);
  await putObject({ key, body: input.buffer, contentType: input.mimeType });

  const url = publicUrlForKey(key);

  // Persist the Media row so future code can join against it (e.g.
  // moderation, deletion when a user is banned, analytics on storage
  // per-user). The URL is denormalised onto the row for convenience
  // even though we have it in publicUrlForKey.
  const row = await prisma.media.create({
    data: {
      uploaderId: input.uploaderId,
      url,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
    },
    select: { id: true },
  });

  return { mediaId: row.id, url };
}
