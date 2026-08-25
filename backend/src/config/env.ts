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
