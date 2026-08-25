import pino from 'pino';
import { env } from '../config/env.js';

// In dev, pretty-print; in prod, structured JSON for log aggregators.
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // Production logs must NEVER contain OTPs, tokens, or full phone numbers.
  // Redaction is a defense-in-depth: callers should also avoid logging them.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.otp',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
