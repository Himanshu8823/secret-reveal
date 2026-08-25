import type { Request, Response, NextFunction } from 'express';
import { requestOtp as requestOtpService, verifyOtp as verifyOtpService } from './auth.service.js';
import { requestOtpSchema, verifyOtpSchema } from './auth.validation.js';

/**
 * Thin controllers. Per CLAUDE.md, business logic lives in the service
 * layer; controllers only translate HTTP <-> service inputs and shape the
 * response envelope.
 *
 * Validation throws ZodError, which the central error middleware maps to
 * the standard envelope.
 */
export async function postRequestOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone } = requestOtpSchema.parse(req.body);
    await requestOtpService(phone);
    // Deliberately no OTP value in the response — discipline now.
    res.status(200).json({ success: true, data: { message: 'OTP sent' } });
  } catch (err) {
    next(err);
  }
}

export async function postVerifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, otp } = verifyOtpSchema.parse(req.body);
    const result = await verifyOtpService(phone, otp);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
