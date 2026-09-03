import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../lib/AppError.js';
import { verifyAccessToken } from '../lib/jwt.js';

/**
 * Augment Express's Request with the auth context. Modules downstream of
 * this middleware can read `req.user` without re-decoding the token.
 *
 * Augmenting via the `Express` namespace (re-exported by @types/express)
 * rather than the underlying `express-serve-static-core` module — that's
 * the path the Express 4 type packages recommend.
 */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; phone: string | null };
    }
  }
}

/**
 * Require a valid access token on the Authorization header.
 *
 * Decodes via `verifyAccessToken` and attaches `{ id, phone }` to `req.user`.
 * Throws AppError(TOKEN_INVALID) on any failure (missing/malformed/expired
 * token) so the central error handler renders the standard envelope.
 *
 * Per CLAUDE.md: this is the one piece of "future-proofing" worth doing
 * now because the route layer needs a single, predictable place to read
 * the caller's identity.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError(401, ErrorCode.TOKEN_INVALID, 'Missing access token'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new AppError(401, ErrorCode.TOKEN_INVALID, 'Missing access token'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, phone: payload.phone };
    next();
  } catch {
    next(new AppError(401, ErrorCode.TOKEN_INVALID, 'Invalid or expired access token'));
  }
}