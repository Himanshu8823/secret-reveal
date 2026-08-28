/**
 * Typed application error. Controllers/services throw these; the central error
 * middleware translates them to the { success: false, error: { code, message } }
 * envelope. Never throw raw strings or generic Error from business logic.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

// Canonical error codes — keep in lockstep with the API envelope consumed by mobile.
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INCORRECT: 'OTP_INCORRECT',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL: 'INTERNAL',
} as const;
