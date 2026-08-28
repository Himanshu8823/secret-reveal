import type { Request, Response, NextFunction } from 'express';
import { updateProfile as updateProfileService } from './users.service.js';
import { updateProfileSchema } from './users.validation.js';

/**
 * Thin controller. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape
 * the response envelope.
 *
 * PATCH /users/me — set the caller's display name.
 */
export async function patchMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      // requireAuth guarantees req.user is present; defensive guard.
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }
    const body = updateProfileSchema.parse(req.body);
    const user = await updateProfileService({ userId: req.user.id, name: body.name });
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}