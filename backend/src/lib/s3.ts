import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

/**
 * AWS S3 client wrapper.
 *
 * Why a singleton client: the AWS SDK maintains its own HTTP keep-alive
 * pool internally. Constructing a new client per request would defeat
 * the pool and tank throughput. The global trick (`globalThis`) is the
 * same pattern we use for Prisma and Redis — survives HMR in dev, single
 * instance in prod.
 *
 * Credentials come from env vars. AWS SDK's default credential chain
 * also checks the EC2 / ECS / Lambda IAM role, so in production we just
 * leave S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY unset and the SDK picks
 * up the instance role automatically. For local dev, set them in .env.
 *
 * The region is forced to env.S3_REGION so a misconfigured bucket in
 * a different region surfaces as a 400 from S3 (PermanentRedirect) —
 * better signal than a silent retry storm.
 */

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export const s3 =
  globalForS3.s3 ??
  new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT, // Supabase: https://<ref>.supabase.co/storage/v1/s3 | AWS: undefined
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined, // fall back to the default credential provider chain
  });

if (process.env.NODE_ENV !== 'production') {
  globalForS3.s3 = s3;
}

/**
 * The canonical public URL for an S3 object. If the operator configured
 * a CDN (CloudFront, R2 public dev URL, etc.) we use that as the base —
 * otherwise we fall back to the standard virtual-hosted-style URL
 * `https://{bucket}.s3.{region}.amazonaws.com/{key}`.
 *
 * We never expose presigned URLs here — uploads are proxied through
 * this server, so the returned Media.url is always the public form
 * that the mobile client can hand straight to <Image>.
 */
export function publicUrlForKey(key: string): string {
  if (env.S3_PUBLIC_BASE_URL) {
    const base = env.S3_PUBLIC_BASE_URL.replace(/\/+$/, '');
    return `${base}/${key}`;
  }
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Stream a buffer to S3 with the right Content-Type so the object
 * serves as an image (not a generic octet-stream download) when the
 * mobile client GETs it.
 */
export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      // Cache aggressively — avatars change rarely. 7 days is a balance
      // between CDN hit-rate and the staleness window if the user swaps
      // their photo (the mobile client always passes a cache-buster via
      // updated timestamp on the Media row, so this isn't a problem).
      CacheControl: 'public, max-age=604800',
    }),
  );
}
