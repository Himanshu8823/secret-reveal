import { useCallback } from 'react';
import {
  validatePhone,
  type PhoneValidationResult,
} from '../phoneValidation';

/**
 * Thin React wrapper. The actual work is the pure `validatePhone` function;
 * the hook exists so screens can call it via `useCallback` without thinking
 * about identity stability.
 *
 * The hook takes no args — screens call `validate(phoneNumber, countryCode)`
 * and the function reads whatever the screen passes in. That keeps state
 * local to the screen (the country picker lives there).
 */
export function usePhoneValidation() {
  return useCallback(validatePhone, []);
}

export type { PhoneValidationResult };