import 'dotenv/config';
import { z } from 'zod';

// Refuse to start if required secrets are missing — fail loud, not confusing later.
// Optional values fall back to dev defaults; production deployment must override them.

/**
 * An optional credential that may also be present-but-blank in .env.
 * `.optional()` alone only covers an absent key; `KEY=` parses as "" and
 * would satisfy a naive `.optional()` while being useless at runtime.
 */
const emptyAsUndefined = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Must be DIFFERENT values. requireAuth verifies the access token with
  // JWT_ACCESS_SECRET only, so identical secrets would let a refresh token
  // pass as an access token. The cross-check is enforced by a .refine()
  // below rather than trusted as a convention.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  OTP_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  // Only governs the mock provider's own key TTL. Twilio Verify owns the
  // real expiry (~10 min) and ignores this.
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Twilio Verify. Required only when OTP_PROVIDER=twilio — enforced by a
  // .refine() below so a production deploy can't start with the OTP path
  // half-configured and fail at the first login instead.
  // `KEY=` (present but blank, the shape .env.example ships) must read the
  // same as an absent key, so normalize "" to undefined rather than letting
  // an empty credential reach the Twilio client.
  TWILIO_ACCOUNT_SID: emptyAsUndefined,
  TWILIO_AUTH_TOKEN: emptyAsUndefined,
  TWILIO_VERIFY_SERVICE_SID: emptyAsUndefined,

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
})
  // Identical JWT secrets would collapse the access/refresh distinction:
  // requireAuth would happily verify a refresh token as an access token,
  // because the `type` claim only guards against this as a second line of
  // defence. Refuse to boot instead of trusting the two .env values to
  // differ by convention.
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values',
    path: ['JWT_REFRESH_SECRET'],
  })
  // The mock provider delivers no SMS and accepts a fixed code, so outside
  // development it would mean "anyone can sign in as anyone". NODE_ENV
  // itself defaults to 'development', so a deploy that forgets to set it
  // would otherwise land on exactly that. Refuse to boot instead.
  .refine((e) => e.NODE_ENV === 'development' || e.NODE_ENV === 'test' || e.OTP_PROVIDER !== 'mock', {
    message:
      'OTP_PROVIDER=mock is development-only — set OTP_PROVIDER=twilio (and its credentials) for staging/production',
    path: ['OTP_PROVIDER'],
  })
  .refine(
    (e) =>
      e.OTP_PROVIDER !== 'twilio' ||
      Boolean(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SERVICE_SID),
    {
      message:
        'OTP_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID',
      path: ['TWILIO_VERIFY_SERVICE_SID'],
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Intentional console.error here: this runs before pino is initialized.
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
