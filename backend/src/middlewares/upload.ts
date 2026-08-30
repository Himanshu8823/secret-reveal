import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError, ErrorCode } from '../lib/AppError.js';
import { env } from '../config/env.js';

/**
 * Multer middleware for media uploads.
 *
 * Storage: memory only. The buffer is held in req.file for the duration
 * of the request and then handed to the S3 client (see lib/s3.ts).
 * We never touch the local filesystem — production deployments are
 * horizontally scalable and serverless-friendly, so a shared disk is
 * not in the picture. With the per-type ceilings below, in-memory
 * buffering briefly spikes backend RAM but AWS SDK's multipart upload
 * handles chunks fine; switch to @aws-sdk/lib-storage if we ever need to
 * stream multi-GB uploads without buffering.
 *
 * Filename is irrelevant — multer.memoryStorage doesn't write a name
 * and we generate the S3 key ourselves in lib/s3.ts + the service layer.
 * Keeping the original filename out of the upload path also closes
 * any path-traversal vector that would otherwise apply to disk writes.
 *
 * MIME allow-list: explicit per-kind enumeration — we do NOT use wildcards
 * like `video/*`. Enumerating real types means a malicious `video/x-msdownload`
 * can't slip through a "looks like video" gate. The composer ships
 * image / video / pdf / audio so all four kinds are covered.
 *
 * Per-type size caps: a 1 GB audio file is not the same as a 1 GB image.
 * We gate at the boundary (this middleware) instead of deeper in the
 * service so a bad payload never reaches S3. The multer buffer ceiling
 * (env.UPLOAD_MAX_BYTES) is set to the largest of the per-type caps so
 * multer never rejects a valid upload before our per-type check sees it;
 * the per-type check then throws AppError(413) with a clear message.
 *
 * Multer's @types package isn't installed — there's a minimal local
 * declaration at ./multer.d.ts to keep strict mode honest. Replace
 * with `@types/multer` from npm when package.json is next touched.
 */

/** MIME types the upload route accepts. Grouped by media kind for the size-cap lookup. */
const ALLOWED_MIME = new Set<string>([
  // images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // video — short clips; transcoding is out of scope
  'video/mp4',
  'video/quicktime',
  'video/webm',
  // documents
  'application/pdf',
  // audio — voice memos
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
]);

type MediaKind = 'image' | 'video' | 'pdf' | 'audio';

function kindOf(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

/** Per-type byte ceiling — looked up by the post-multer size check. */
function maxBytesFor(mime: string): number {
  const kind = kindOf(mime);
  if (kind === 'image') return env.UPLOAD_MAX_IMAGE_BYTES;
  if (kind === 'video') return env.UPLOAD_MAX_VIDEO_BYTES;
  if (kind === 'pdf') return env.UPLOAD_MAX_PDF_BYTES;
  if (kind === 'audio') return env.UPLOAD_MAX_AUDIO_BYTES;
  // Should be unreachable: fileFilter rejects before we ever look up
  // the size. Defensive default to UPLOAD_MAX_BYTES.
  return env.UPLOAD_MAX_BYTES;
}

const storage = multer.memoryStorage();

// fileFilter and the per-type size check intentionally live OUTSIDE the
// multer factory — multer's `limits.fileSize` is a single global cap,
// but the product rule needs per-type caps (10 MB image vs 50 MB video).
// We set multer's cap to the largest of the per-type sizes (so a valid
// upload never trips multer's own reject) and enforce the per-type cap
// ourselves immediately after, where we know the actual mimeType.
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(
      new AppError(
        415,
        ErrorCode.VALIDATION_FAILED,
        `Unsupported media type: ${file.mimetype}. Allowed: ${Array.from(ALLOWED_MIME).join(', ')}.`,
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

export const avatarUpload = multer({
  storage,
  fileFilter,
  // Multer's cap is the largest per-type limit so a valid upload never
  // trips it. The post-multer check (below) enforces the real per-type
  // cap.
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
});

/**
 * Enforce the per-type size cap AFTER multer has buffered the file.
 * Multer's single global cap would let a 50 MB image slip through under
 * the video cap; this middleware closes that hole.
 *
 * Mounted as `postUploadSizeGuard` directly after `avatarUpload.single(...)`
 * on each upload route.
 */
export function postUploadSizeGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // `multer.Multer.File` exposes `size` and `mimetype` — both we need.
  const f = (req as unknown as { file?: multer.File }).file;
  if (!f) {
    // No file on the request → multer didn't accept it. Let the controller
    // surface its own "Missing file" 400 rather than us double-handling.
    next();
    return;
  }
  const cap = maxBytesFor(f.mimetype);
  if (f.size > cap) {
    next(
      new AppError(
        413,
        ErrorCode.VALIDATION_FAILED,
        `File too large for ${f.mimetype}: ${f.size} bytes (max ${cap}).`,
      ),
    );
    return;
  }
  next();
}
