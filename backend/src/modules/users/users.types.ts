import type { AuthUser } from '../auth/auth.types.js';

/**
 * Public types of the users module. Narrow on purpose: only what crosses
 * module boundaries.
 */

export type UpdateProfileInput = {
  userId: string;
  name: string;
};

export type UpdateProfileResult = AuthUser;