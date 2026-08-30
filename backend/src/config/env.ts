import 'dotenv/config';
import { z } from 'zod';

// Refuse to start if required secrets are missing — fail loud, not confusing later.
// Optional values fall back to dev defaults; production deployment must override them.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  OTP_PROVIDER: z.enum(['mock']).default('mock'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  APP_NAME: z.string().min(1).default('Secretsuper'),

  // S3-compatible object storage. Supabase Storage uses the S3 API at a
  // custom endpoint; native AWS S3 omits S3_ENDPOINT. Both work without
  // code changes — only .env differs.
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Bloom filter sizing for username uniqueness front-line check.
  // The bloom filter is a Redis-backed probabilistic structure that
  // catches "obviously taken" usernames in sub-ms before we hit Postgres
  // UNIQUE. Postgres UNIQUE remains the authoritative source of truth —
  // the bloom filter is only an optimization, never an authority.
  // Sizing math (https://hur.st/bloomfilter/): capacity=1M, error=0.01
  // gives ~9.59M bits (~1.14 MB) and 7 hash functions.
  BLOOM_CAPACITY: z.coerce.number().int().positive().default(1_000_000),
  BLOOM_ERROR_RATE: z.coerce.number().positive().max(0.1).default(0.01),

  // Uploads.
  //
  // S3_ENABLED gates the upload route itself — when the operator hasn't
  // configured credentials/bucket, the service surfaces a clean 503
  // instead of letting the AWS SDK explode with a credential error. The
  // route is still mounted so the client contract (POST /media/upload)
  // is stable across environments.
  S3_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((v) => v === true || v === 'true'),

  // Hard ceiling at the multer buffer level — set to the largest of the
  // per-type limits below so multer doesn't reject a valid upload before
  // our per-type check sees it. Anything larger is rejected as 413.
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),

  // Per-type size limits, in bytes. The mobile composer ships image /
  // video / pdf / audio. We enumerate each so a 1 GB audio upload doesn't
  // slip through an "image" gate. Defaults match common mobile limits:
  //   - image: 10 MB (matches the old avatar cap)
  //   - video: 50 MB (short clips; longer clips would need chunked uploads)
  //   - pdf:   25 MB (most receipts / docs sit comfortably under this)
  //   - audio: 25 MB (voice memos)
  UPLOAD_MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  UPLOAD_MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  UPLOAD_MAX_PDF_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  UPLOAD_MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),

  // Comma-separated allowlist. Empty list => no browser origins allowed.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  PROFILE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Intentional console.error here: this runs before pino is initialized.
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
