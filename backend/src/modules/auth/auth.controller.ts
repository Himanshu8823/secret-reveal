import type { Request, Response, NextFunction } from 'express';
import { requestOtp as requestOtpService, verifyOtp as verifyOtpService } from './auth.service.js';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshSchema,
  logoutSchema,
  googleSignInSchema,
  requestPhoneLinkSchema,
  verifyPhoneLinkSchema,
} from './auth.validation.js';
import { phoneInputSchema } from './phone.schema.js';
import { rotateRefresh, revokeToken } from './token.service.js';
import { signInWithGoogle } from './google.service.js';
import { requestPhoneLinkOtp, verifyPhoneLinkOtp } from './phone-link.service.js';
import { verifyRefreshToken } from '../../lib/jwt.js';
import { logger } from '../../lib/logger.js';
import { unregisterPushToken } from '../notifications/notifications.service.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape the
 * response envelope.
 *
 * Validation throws ZodError, which the central error middleware maps to
 * the standard envelope.
 *
 * The phone schema is a transform — we re-parse it here to get the E.164
 * form for the service. This is a small amount of duplication but keeps
 * the validate-and-shape pattern explicit at the boundary.
 */
export async function postRequestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const body = requestOtpSchema.parse(req.body);
    const { e164 } = phoneInputSchema.parse(body);
    await requestOtpService(e164);
    // Deliberately no OTP value in the response — discipline now.
    res.status(200).json({ success: true, data: { message: 'OTP sent' } });
  } catch (err) {
    next(err);
  }
}

export async function postVerifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const body = verifyOtpSchema.parse(req.body);
    const { e164 } = phoneInputSchema.parse(body);
    const result = await verifyOtpService(e164, body.otp);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/refresh
 *
 * Accepts a refresh token in the body, validates it via token.service
 * (which checks signature, expiry, jti presence, family-revocation status,
 * and reuse detection — see 03-BACKEND-ARCHITECTURE.md §5.2.1/5.2.2),
 * rotates to a new jti in the same family, and returns the new pair.
 *
 * Response shape mirrors /auth/verify-otp so the client can use the same
 * `setSession` reducer.
 *
 * Rate-limited at the route layer (see auth.routes.ts).
 */
export async function postRefresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await rotateRefresh(refreshToken, {
      userAgent: req.get('user-agent') ?? undefined,
      ipAddress: req.ip ?? undefined,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 *
 * Logout is best-effort — invalidates the current token by jti and returns
 * 204 regardless of whether the token was valid. We do not look up the
 * family in the DB from here; revoking only the current jti means a stolen
 * token on another device would still be alive after this call, which is
 * the documented v1 limitation. Real production-grade logout would do a
 * family-level revoke (v1.1 polish).
 *
 * Errors thrown by verify or revoke are swallowed — the response is always
 * 204. We do not differentiate "logged out" from "no-op" to the caller,
 * which is the standard privacy posture for a logout endpoint.
 */
export async function postLogout(req: Request, res: Response, _next: NextFunction) {
  // Best-effort: never throw past this handler. A logout that returns an
  // error gives an attacker a probe to enumerate valid refresh tokens. So
  // we swallow parse, JWT, and DB errors here and unconditionally 204.
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(204).end();
      return;
    }
    const { refreshToken } = parsed.data;
    let jti: string | undefined;
    let userId: string | undefined;
    try {
      const payload = verifyRefreshToken(refreshToken);
      jti = payload.jti;
      userId = payload.sub;
    } catch {
      // Token is invalid or expired. Logout still returns 204 — the token
      // is unusable anyway, so there is nothing to revoke.
      jti = undefined;
    }
    if (jti) {
      try {
        await revokeToken(jti);
      } catch (err) {
        // DB failure on revoke is logged but does not surface to the
        // caller — see privacy posture above. Server-side log so we
        // can investigate without leaking details to the caller.
        logger.error({ err, jti }, 'logout: failed to revoke refresh token');
      }
    }
    if (userId) {
      // Best-effort: a stale push token just means one missed push later,
      // never worth failing logout over.
      try {
        await unregisterPushToken(userId);
      } catch (err) {
        logger.error({ err, userId }, 'logout: failed to clear push token');
      }
    }
  } catch (err) {
    // Hard fallback: any unexpected error is still swallowed.
    logger.error({ err }, 'logout: unexpected error in handler');
  }
  res.status(204).end();
}

/**
 * POST /auth/google
 *
 * Body: { idToken }. Verifies the Google ID token server-side, finds or
 * creates the user, and returns the same envelope shape as /auth/verify-otp
 * plus `needsPhone` so the client knows whether to route into phone-link
 * onboarding before (or instead of) the name/username welcome screen.
 */
export async function postGoogleSignIn(req: Request, res: Response, next: NextFunction) {
  try {
    const { idToken } = googleSignInSchema.parse(req.body);
    const result = await signInWithGoogle(idToken);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/phone/link/request
 *
 * Sends an OTP to attach a phone number to the CALLER's account (requires
 * requireAuth — see auth.routes.ts). Only meaningful for accounts that
 * don't already have a phone (Google-only signups); the service rejects
 * otherwise at the verify step.
 */
export async function postRequestPhoneLink(req: Request, res: Response, next: NextFunction) {
  try {
    const body = requestPhoneLinkSchema.parse(req.body);
    const { e164 } = phoneInputSchema.parse(body);
    await requestPhoneLinkOtp(e164);
    res.status(200).json({ success: true, data: { message: 'OTP sent' } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/phone/link/verify
 *
 * Verifies the OTP and attaches the phone to req.user.id. Returns the
 * updated user so the client can refresh its stored session in place —
 * note this does NOT rotate the access/refresh token pair; the client's
 * existing tokens remain valid (only the `phone` claim inside the access
 * token becomes stale until the next refresh, which is harmless since
 * nothing server-side authorizes off the JWT's phone claim).
 */
export async function postVerifyPhoneLink(req: Request, res: Response, next: NextFunction) {
  try {
    const body = verifyPhoneLinkSchema.parse(req.body);
    const { e164 } = phoneInputSchema.parse(body);
    const user = await verifyPhoneLinkOtp(req.user!.id, e164, body.otp);
    res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}