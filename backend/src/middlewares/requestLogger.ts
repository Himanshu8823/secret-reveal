import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { maskPhone } from '../lib/phone.js';

/**
 * HTTP request logger. We customize the `serializers` to:
 *   - never log Authorization headers (defense-in-depth even though pino redact covers it)
 *   - mask any phone-shaped fields that might appear in request bodies
 *     (currently only /auth/otp/*, but cheap insurance)
 *
 * `genReqId` is a defense-in-depth fallback: the `requestId` middleware
 * (mounted before us in app.ts) sets `req.id` for every request, but if
 * the order ever changes pino-http still produces a usable id here.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
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
