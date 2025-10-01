import { z } from 'zod';

/**
 * Password Policy Configuration - Single Source of Truth
 * Centralized password requirements for healthcare practice management system
 */

export const PASSWORD_POLICY = {
  // Length requirements
  MIN_LENGTH: 12,
  MAX_LENGTH: 128,

  // Complexity requirements
  REQUIRES_LOWERCASE: true,
  REQUIRES_UPPERCASE: true,
  REQUIRES_NUMBER: true,
  REQUIRES_SYMBOL: true,

  // Allowed special characters (expanded set for better security)
  ALLOWED_SYMBOLS: '@$!%*?&#^()[]{}|\\:";\'<>,.~`+=_-',

  // Validation regexes
  LOWERCASE_REGEX: /[a-z]/,
  UPPERCASE_REGEX: /[A-Z]/,
  NUMBER_REGEX: /\d/,
  SYMBOL_REGEX: /[@$!%*?&#^()[\]{}|\\:";'<>,.~`+=_-]/,

  // Error messages
  MESSAGES: {
    TOO_SHORT: `Password must be at least ${12} characters long`,
    TOO_LONG: `Password must not exceed ${128} characters`,
    MISSING_LOWERCASE: 'Must contain at least one lowercase letter (a-z)',
    MISSING_UPPERCASE: 'Must contain at least one uppercase letter (A-Z)',
    MISSING_NUMBER: 'Must contain at least one number (0-9)',
    MISSING_SYMBOL: 'Must contain at least one special character (!@#$%^&*)',
  },
} as const;

/**
 * Validate password strength against the centralized policy
 */
export function validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Length validation
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    errors.push(PASSWORD_POLICY.MESSAGES.TOO_SHORT);
  }
  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    errors.push(PASSWORD_POLICY.MESSAGES.TOO_LONG);
  }

  // Complexity validation
  if (PASSWORD_POLICY.REQUIRES_LOWERCASE && !PASSWORD_POLICY.LOWERCASE_REGEX.test(password)) {
    errors.push(PASSWORD_POLICY.MESSAGES.MISSING_LOWERCASE);
  }
  if (PASSWORD_POLICY.REQUIRES_UPPERCASE && !PASSWORD_POLICY.UPPERCASE_REGEX.test(password)) {
    errors.push(PASSWORD_POLICY.MESSAGES.MISSING_UPPERCASE);
  }
  if (PASSWORD_POLICY.REQUIRES_NUMBER && !PASSWORD_POLICY.NUMBER_REGEX.test(password)) {
    errors.push(PASSWORD_POLICY.MESSAGES.MISSING_NUMBER);
  }
  if (PASSWORD_POLICY.REQUIRES_SYMBOL && !PASSWORD_POLICY.SYMBOL_REGEX.test(password)) {
    errors.push(PASSWORD_POLICY.MESSAGES.MISSING_SYMBOL);
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Get password policy summary for display to users
 */
export function getPasswordPolicyDescription(): string {
  const requirements = [
    `At least ${PASSWORD_POLICY.MIN_LENGTH} characters`,
    'One lowercase letter (a-z)',
    'One uppercase letter (A-Z)',
    'One number (0-9)',
    'One special character (!@#$%^&*)',
  ];

  return `Password must contain: ${requirements.join(', ')}`;
}

/**
 * Create Zod password validation schema using centralized policy
 * Use this in all password creation/change forms
 */
export function createPasswordSchema(_fieldName: string = 'password') {
  return z
    .string()
    .min(PASSWORD_POLICY.MIN_LENGTH, PASSWORD_POLICY.MESSAGES.TOO_SHORT)
    .max(PASSWORD_POLICY.MAX_LENGTH, PASSWORD_POLICY.MESSAGES.TOO_LONG)
    .regex(PASSWORD_POLICY.LOWERCASE_REGEX, PASSWORD_POLICY.MESSAGES.MISSING_LOWERCASE)
    .regex(PASSWORD_POLICY.UPPERCASE_REGEX, PASSWORD_POLICY.MESSAGES.MISSING_UPPERCASE)
    .regex(PASSWORD_POLICY.NUMBER_REGEX, PASSWORD_POLICY.MESSAGES.MISSING_NUMBER)
    .regex(PASSWORD_POLICY.SYMBOL_REGEX, PASSWORD_POLICY.MESSAGES.MISSING_SYMBOL);
}

/**
 * Simple password presence validation for login (no strength requirements)
 * ✅ CORRECT: Login only validates presence, not strength
 */
export function createLoginPasswordSchema() {
  return z.string().min(1, 'Password is required');
}

/**
 * Pre-configured password schema for immediate use
 */
export const passwordSchema = createPasswordSchema();
export const loginPasswordSchema = createLoginPasswordSchema();
