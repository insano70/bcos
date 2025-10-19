/**
 * Auth Input Validation and Sanitization
 *
 * Provides defense-in-depth validation for authentication profile data before database operations.
 * Even though OIDC libraries validate tokens, we add an extra layer of validation to protect against:
 * - Malformed data
 * - SQL injection attempts
 * - XSS attempts
 * - Unexpected data types
 *
 * @module lib/auth/input-validator
 */

import { log } from '@/lib/logger';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: {
    email: string;
    displayName: string | undefined;
    givenName: string | undefined;
    surname: string | undefined;
  };
}

/**
 * Email validation regex (simplified for security and maintainability)
 * Matches: localpart@domain
 * - Localpart: alphanumeric, dots, hyphens, underscores
 * - Domain: alphanumeric with dots (standard domain format)
 * Note: Deliberately simple to avoid ReDoS and maintain security focus
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Name validation regex
 * Allows letters, spaces, hyphens, apostrophes, and common international characters
 * Prevents SQL injection and XSS
 */
const NAME_REGEX = /^[a-zA-ZÀ-ÿ\s'-]{1,100}$/;

/**
 * Dangerous characters that might indicate injection attempts
 */
const DANGEROUS_CHARS = /[<>;"'`\\]/;

/**
 * Validate and sanitize authentication profile data
 *
 * This function provides defense-in-depth validation even though OIDC/SAML
 * libraries have already validated the response structure and signature.
 *
 * @param profile - Raw profile data from authentication provider
 * @param source - Source of authentication (for logging)
 * @returns ValidationResult with sanitized data or errors
 */
export function validateAuthProfile(
  profile: {
    email: string;
    displayName?: string | undefined;
    givenName?: string | undefined;
    surname?: string | undefined;
  },
  source = 'auth'
): ValidationResult {
  const errors: string[] = [];

  // Validate email (REQUIRED)
  if (!profile.email || typeof profile.email !== 'string') {
    errors.push('Email is required and must be a string');
    log.warn(`${source} profile validation failed: missing email`, {
      hasEmail: !!profile.email,
      emailType: typeof profile.email,
    });
    return { valid: false, errors };
  }

  // Trim and lowercase email
  const email = profile.email.trim().toLowerCase();

  // Check email format
  if (!EMAIL_REGEX.test(email)) {
    errors.push('Email format is invalid');
    log.warn(`${source} profile validation failed: invalid email format`, {
      emailLength: email.length,
      containsDangerous: DANGEROUS_CHARS.test(email),
    });
    return { valid: false, errors };
  }

  // Check for dangerous characters in email (SQL injection / XSS attempt)
  if (DANGEROUS_CHARS.test(email)) {
    errors.push('Email contains dangerous characters');
    log.error(`${source} profile validation failed: dangerous characters in email`, {
      email: `${email.substring(0, 5)}***`,
      alert: 'POSSIBLE_INJECTION_ATTEMPT',
      source,
    });
    return { valid: false, errors };
  }

  // Check email length (prevent buffer overflow / DoS)
  if (email.length > 255) {
    errors.push('Email is too long (max 255 characters)');
    log.warn(`${source} profile validation failed: email too long`, {
      length: email.length,
    });
    return { valid: false, errors };
  }

  // Validate optional displayName
  let displayName: string | undefined;
  if (profile.displayName !== undefined) {
    if (typeof profile.displayName !== 'string') {
      errors.push('Display name must be a string');
    } else {
      displayName = sanitizeName(profile.displayName, 'displayName', errors, source);
    }
  }

  // Validate optional givenName
  let givenName: string | undefined;
  if (profile.givenName !== undefined) {
    if (typeof profile.givenName !== 'string') {
      errors.push('Given name must be a string');
    } else {
      givenName = sanitizeName(profile.givenName, 'givenName', errors, source);
    }
  }

  // Validate optional surname
  let surname: string | undefined;
  if (profile.surname !== undefined) {
    if (typeof profile.surname !== 'string') {
      errors.push('Surname must be a string');
    } else {
      surname = sanitizeName(profile.surname, 'surname', errors, source);
    }
  }

  // Return result
  if (errors.length > 0) {
    log.warn(`${source} profile validation failed`, {
      errors,
      email: `${email.substring(0, 5)}***`,
    });
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      email,
      displayName,
      givenName,
      surname,
    },
  };
}

/**
 * Sanitize name field
 *
 * @param name - Raw name value
 * @param fieldName - Field name for logging
 * @param errors - Errors array to append to
 * @param source - Source for logging
 * @returns Sanitized name or undefined if invalid
 */
function sanitizeName(
  name: string,
  fieldName: string,
  errors: string[],
  source: string
): string | undefined {
  const trimmed = name.trim();

  // Empty after trim
  if (trimmed.length === 0) {
    return undefined;
  }

  // Check length
  if (trimmed.length > 100) {
    errors.push(`${fieldName} is too long (max 100 characters)`);
    log.warn(`${source} profile validation: ${fieldName} too long`, {
      length: trimmed.length,
    });
    return undefined;
  }

  // Check for dangerous characters
  if (DANGEROUS_CHARS.test(trimmed)) {
    errors.push(`${fieldName} contains dangerous characters`);
    log.error(`${source} profile validation: dangerous characters in ${fieldName}`, {
      alert: 'POSSIBLE_INJECTION_ATTEMPT',
      source,
    });
    return undefined;
  }

  // Check format (letters, spaces, hyphens, apostrophes, international chars)
  if (!NAME_REGEX.test(trimmed)) {
    errors.push(`${fieldName} contains invalid characters`);
    log.warn(`${source} profile validation: ${fieldName} invalid format`, {
      length: trimmed.length,
    });
    return undefined;
  }

  return trimmed;
}

/**
 * Validate email domain against allowed list
 *
 * @param email - Email address to validate
 * @param allowedDomains - Array of allowed domain names
 * @returns true if domain is allowed or allowedDomains is empty
 */
export function validateEmailDomain(email: string, allowedDomains: readonly string[]): boolean {
  // If no allowed domains configured, allow all
  if (allowedDomains.length === 0) {
    return true;
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return false;
  }

  return allowedDomains.some((allowed) => allowed.toLowerCase() === domain);
}
