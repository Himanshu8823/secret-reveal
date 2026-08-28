import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

/**
 * Single central error handler. Every thrown value eventually lands here.
 * Maps known shapes (AppError, ZodError) to the standard envelope; everything
 * else is logged and returned as INTERNAL with no stack leak in prod.
 *
 * Envelope per CLAUDE.md:
 *   { success: true, data: ... }
 *   { success: false, error: { code, message } }
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      version: 'v1',
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      version: 'v1',
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Invalid request',
        details: err.flatten(),
      },
    });
    return;
  }

  // Unknown — log full error server-side, return generic to client.
  logger.error(
    {
      err,
      requestId: req.id,
      userId: req.user?.id,
      path: req.path,
      method: req.method,
    },
    'unhandled error',
  );
  res.status(500).json({
    success: false,
    version: 'v1',
    error: {
      code: ErrorCode.INTERNAL,
      message: 'Internal server error',
      ...(env.NODE_ENV !== 'production' && err instanceof Error
        ? { details: { stack: err.stack } }
        : {}),
    },
  });
}
