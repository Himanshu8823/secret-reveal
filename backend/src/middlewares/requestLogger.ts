import pinoHttp from 'pino-http';
import { logger } from '../lib/logger.js';
import { maskPhone } from '../lib/phone.js';

/**
 * HTTP request logger. We customize the `serializers` to:
 *   - never log Authorization headers (defense-in-depth even though pino redact covers it)
 *   - mask any phone-shaped fields that might appear in request bodies
 *     (currently only /auth/otp/*, but cheap insurance)
 */
export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        // Mask phone in body if present. Shallow-only — fine for our flat OTP bodies.
        body: maskPhonesInBody(req.raw?.body),
        remoteAddress: req.remoteAddress,
      };
    },
  },
});

function maskPhonesInBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (k === 'phone' && typeof v === 'string') {
      out[k] = maskPhone(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
