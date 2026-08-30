import type { Request, Response, NextFunction } from 'express';
import type multer from 'multer';
import { z } from 'zod';
import { uploadImage } from './media.service.js';
import { AppError, ErrorCode } from '../../lib/AppError.js';

/**
 * Thin controller. The multer middleware (avatarUpload) populates
 * `req.file`; if it's missing the request shape was wrong (no file
 * field, or wrong field name) — surface a clean 400 rather than letting
 * a NPE leak into the service.
 *
 * requireAuth (mounted on the route) guarantees req.user is present.
 *
 * The `kind` query param controls the S3 key prefix. The composer uses
 * 'post' for post media; the profile screen uses 'avatar'. Default is
 * 'post' since this endpoint is no longer the avatar-only path — it
 * hosts every kind of media the mobile app uploads.
 */

const kindQuerySchema = z
  .object({
    kind: z.enum(['avatar', 'post']).optional(),
  })
  .strict();

export async function postUpload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }
    // `multer.Multer.File` exposes buffer / originalname / mimetype / size.
    const file = (req as unknown as { file?: multer.File }).file;
    if (!file) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_FAILED,
        'Missing file. POST a multipart/form-data body with field name "file".',
      );
    }
    // Validate the optional kind query param at the boundary. Unknown
    // values fail with a clean 400 instead of silently landing on the
    // default prefix.
    const kindParsed = kindQuerySchema.safeParse(req.query);
    if (!kindParsed.success) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_FAILED,
        `Invalid kind: ${kindParsed.error.issues[0]?.message ?? 'unknown'}`,
      );
    }
    const kind: 'avatar' | 'post' = kindParsed.data.kind ?? 'post';

    const result = await uploadImage({
      uploaderId: req.user.id,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      kind,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
