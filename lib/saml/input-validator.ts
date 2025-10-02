/**
 * SAML Input Validation and Sanitization
 *
 * Provides defense-in-depth validation for SAML profile data before database operations.
 * Even though node-saml validates the SAML response, we add an extra layer of validation
 * to protect against:
 * - Malformed data
 * - SQL injection attempts
 * - XSS attempts
 * - Unexpected data types
 *
 * @module lib/saml/input-validator
 */

import { createAppLogger } from '@/lib/logger/factory';

const validatorLogger = createAppLogger('saml-input-validator', {
  component: 'security',
  feature: 'saml-sso',
  module: 'input-validation',
});

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: {
    email: string;
    displayName?: string;
    givenName?: string;
    surname?: string;
  };
}

/**
 * Email validation regex (RFC 5322 simplified)
 * Prevents SQL injection characters in email
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

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
 * Validate and sanitize SAML profile data
 *
 * This function provides defense-in-depth validation even though node-saml
 * has already validated the SAML response structure and signature.
 *
 * @param profile - Raw SAML profile data from node-saml
 * @returns ValidationResult with sanitized data or errors
 */
export function validateSAMLProfile(profile: {
  email: string;
  displayName?: string | undefined;
  givenName?: string | undefined;
  surname?: string | undefined;
}): ValidationResult {
  const errors: string[] = [];

  // Validate email (REQUIRED)
  if (!profile.email || typeof profile.email !== 'string') {
    errors.push('Email is required and must be a string');
    validatorLogger.warn('SAML profile validation failed: missing email', {
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
    validatorLogger.warn('SAML profile validation failed: invalid email format', {
      emailLength: email.length,
      containsDangerous: DANGEROUS_CHARS.test(email),
    });
    return { valid: false, errors };
  }

  // Check for dangerous characters in email (SQL injection / XSS attempt)
  if (DANGEROUS_CHARS.test(email)) {
    errors.push('Email contains dangerous characters');
    validatorLogger.error('SAML profile validation failed: dangerous characters in email', {
      email: `${email.substring(0, 5)}***`,
      alert: 'POSSIBLE_INJECTION_ATTEMPT',
    });
    return { valid: false, errors };
  }

  // Check email length (prevent buffer overflow / DoS)
  if (email.length > 255) {
    errors.push('Email exceeds maximum length');
    validatorLogger.warn('SAML profile validation failed: email too long', {
      emailLength: email.length,
    });
    return { valid: false, errors };
  }

  // Validate optional fields
  const sanitized: ValidationResult['sanitized'] = { email };

  // Validate displayName (optional)
  if (profile.displayName !== undefined) {
    if (typeof profile.displayName !== 'string') {
      errors.push('Display name must be a string');
    } else {
      const displayName = profile.displayName.trim();
      if (displayName.length > 0) {
        if (!NAME_REGEX.test(displayName)) {
          errors.push('Display name contains invalid characters');
          validatorLogger.warn('Invalid display name format', {
            length: displayName.length,
            containsDangerous: DANGEROUS_CHARS.test(displayName),
          });
        } else if (displayName.length > 200) {
          errors.push('Display name exceeds maximum length');
        } else {
          sanitized.displayName = displayName;
        }
      }
    }
  }

  // Validate givenName (optional)
  if (profile.givenName !== undefined) {
    if (typeof profile.givenName !== 'string') {
      errors.push('Given name must be a string');
    } else {
      const givenName = profile.givenName.trim();
      if (givenName.length > 0) {
        if (!NAME_REGEX.test(givenName)) {
          errors.push('Given name contains invalid characters');
        } else if (givenName.length > 100) {
          errors.push('Given name exceeds maximum length');
        } else {
          sanitized.givenName = givenName;
        }
      }
    }
  }

  // Validate surname (optional)
  if (profile.surname !== undefined) {
    if (typeof profile.surname !== 'string') {
      errors.push('Surname must be a string');
    } else {
      const surname = profile.surname.trim();
      if (surname.length > 0) {
        if (!NAME_REGEX.test(surname)) {
          errors.push('Surname contains invalid characters');
        } else if (surname.length > 100) {
          errors.push('Surname exceeds maximum length');
        } else {
          sanitized.surname = surname;
        }
      }
    }
  }

  // If any validation errors, return invalid
  if (errors.length > 0) {
    validatorLogger.warn('SAML profile validation completed with errors', {
      errorCount: errors.length,
      errors: errors.slice(0, 3), // Log first 3 errors
    });
    return { valid: false, errors };
  }

  // All validations passed
  validatorLogger.debug('SAML profile validation successful', {
    email: `${email.substring(0, 5)}***`,
    hasDisplayName: !!sanitized.displayName,
    hasGivenName: !!sanitized.givenName,
    hasSurname: !!sanitized.surname,
  });

  return {
    valid: true,
    errors: [],
    sanitized,
  };
}

/**
 * Validate email domain against allowlist
 *
 * Provides additional security by restricting SAML authentication
 * to specific email domains.
 *
 * @param email - Email address to validate
 * @param allowedDomains - Array of allowed email domains
 * @returns boolean - true if email domain is allowed
 */
export function validateEmailDomain(email: string, allowedDomains: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) {
    // No domain restrictions
    return true;
  }

  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain) {
    return false;
  }

  const isAllowed = allowedDomains.some((domain) => emailDomain === domain.toLowerCase());

  if (!isAllowed) {
    validatorLogger.warn('Email domain not in allowlist', {
      emailDomain,
      allowedDomains: allowedDomains.length,
      alert: 'DOMAIN_RESTRICTION_VIOLATED',
    });
  }

  return isAllowed;
}

/**
 * Sanitize string for safe logging
 * Removes potentially dangerous characters and truncates long strings
 *
 * @param value - String to sanitize
 * @param maxLength - Maximum length (default 100)
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLogging(value: string | undefined, maxLength = 100): string {
  if (!value) {
    return '[empty]';
  }

  // Remove dangerous characters
  let sanitized = value.replace(DANGEROUS_CHARS, '_');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.substring(0, maxLength)}...`;
  }

  return sanitized;
}
