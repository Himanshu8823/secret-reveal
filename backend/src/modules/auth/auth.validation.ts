import { z } from 'zod';

// E.164: + then 7-15 digits total (after the +). Country code prefix
// validated separately so the error message is actionable.
const phoneRegex = /^\+[1-9]\d{6,14}$/;

export const requestOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Phone must be in E.164 format, e.g. +91XXXXXXXXXX'),
});

export const verifyOtpSchema = z.object({
  phone: z.string().trim().regex(phoneRegex, 'Phone must be in E.164 format'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export type RequestOtpBody = z.infer<typeof requestOtpSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
