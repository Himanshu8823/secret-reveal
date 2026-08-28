import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Per-request correlation id.
 *
 * If the client sent an `x-request-id` header we trust it as-is (so an
 * upstream gateway / mobile client can carry an id through). Otherwise we
 * mint a fresh UUID. The id is attached to `req.id` (so pino-http picks it
 * up automatically and downstream code can read it) and echoed back on the
 * response header so callers can correlate failures with our logs.
 *
 * Mounted BEFORE requestLogger in app.ts so the id appears in every line
 * the request logger emits.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
}
