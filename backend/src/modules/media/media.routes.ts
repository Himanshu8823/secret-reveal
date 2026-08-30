import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { avatarUpload, postUploadSizeGuard } from '../../middlewares/upload.js';
import { postUpload } from './media.controller.js';
import { rateLimit } from '../../middlewares/rateLimiter.js';
import { redis } from '../../config/redis.js';
import { RateLimiterRedis } from 'rate-limiter-flexible';

/**
 * Media routes. Mounted at /api/v1/media in app.ts.
 *
 * POST /upload — proxied upload to S3. Single file (multipart/form-data,
 * field "file"), MIME allow-list enforced in the middleware, per-type
 * size cap from env.UPLOAD_MAX_{IMAGE,VIDEO,PDF,AUDIO}_BYTES.
 *
 * Optional `?kind=avatar|post` query param sets the S3 key prefix.
 * Defaults to 'post' (the composer is the primary caller today).
 *
 * Per CLAUDE.md, every public endpoint that accepts user input gets
 * rate-limited. We key the limiter on the authenticated user id so an
 * attacker can't bypass by rotating IPs. Limits are intentionally loose
 * — uploads are expensive for the client too, so the limit mainly caps
 * "upload-many-files-via-script" abuse.
 */

const TEN_MIN = 10 * 60;

const uploadLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:media:upload:user',
  points: 30,
  duration: TEN_MIN,
  blockDuration: 0,
});

export const mediaRouter = Router();

mediaRouter.post(
  '/upload',
  requireAuth,
  rateLimit(uploadLimiter, (req) => req.user?.id ?? 'unknown'),
  avatarUpload.single('file'),
  postUploadSizeGuard,
  postUpload,
);
