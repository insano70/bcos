/**
 * Authentication Service Errors
 *
 * Unified error handling for authentication service layer.
 * Provides consistent error types across all auth services.
 */

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base class for all authentication service errors
 * Provides consistent error structure across all auth services
 */
export class AuthServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthServiceError';
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthServiceError);
    }
  }
}

// ============================================================================
// User Lookup Errors
// ============================================================================

/**
 * User lookup error codes
 */
export enum UserLookupErrorCode {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  USER_DELETED = 'USER_DELETED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SSO_ONLY_USER = 'SSO_ONLY_USER',
}

/**
 * User lookup error
 * Thrown when user validation fails during authentication
 */
export class UserLookupError extends AuthServiceError {
  constructor(
    public code: UserLookupErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'UserLookupError';
  }
}

// ============================================================================
// SSO Validation Errors
// ============================================================================

/**
 * SSO validation error codes
 */
export enum SSOValidationErrorCode {
  USER_NOT_PROVISIONED = 'USER_NOT_PROVISIONED',
  USER_INACTIVE = 'USER_INACTIVE',
  EMAIL_DOMAIN_INVALID = 'EMAIL_DOMAIN_INVALID',
}

/**
 * SSO validation error
 * Thrown when SSO user validation fails
 */
export class SSOValidationError extends AuthServiceError {
  constructor(
    public code: SSOValidationErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'SSOValidationError';
  }
}

// ============================================================================
// Session Management Errors
// ============================================================================

/**
 * Session error codes
 */
export enum SessionErrorCode {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
  TOKEN_OWNERSHIP_MISMATCH = 'TOKEN_OWNERSHIP_MISMATCH',
}

/**
 * Session management error
 * Thrown when session operations fail
 */
export class SessionError extends AuthServiceError {
  constructor(
    public code: SessionErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'SessionError';
  }
}

// ============================================================================
// MFA Errors
// ============================================================================

/**
 * MFA error codes
 */
export enum MFAErrorCode {
  MFA_REQUIRED = 'MFA_REQUIRED',
  MFA_SETUP_REQUIRED = 'MFA_SETUP_REQUIRED',
  INVALID_CREDENTIAL = 'INVALID_CREDENTIAL',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  NO_SKIPS_REMAINING = 'NO_SKIPS_REMAINING',
  CREDENTIAL_NOT_FOUND = 'CREDENTIAL_NOT_FOUND',
}

/**
 * MFA error
 * Thrown when MFA operations fail
 */
export class MFAError extends AuthServiceError {
  constructor(
    public code: MFAErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(code, message, details);
    this.name = 'MFAError';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if error is an AuthServiceError
 */
export function isAuthServiceError(error: unknown): error is AuthServiceError {
  return error instanceof AuthServiceError;
}

/**
 * Type guard to check if error is a UserLookupError
 */
export function isUserLookupError(error: unknown): error is UserLookupError {
  return error instanceof UserLookupError;
}

/**
 * Type guard to check if error is an SSOValidationError
 */
export function isSSOValidationError(error: unknown): error is SSOValidationError {
  return error instanceof SSOValidationError;
}

/**
 * Type guard to check if error is a SessionError
 */
export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}

/**
 * Type guard to check if error is an MFAError
 */
export function isMFAError(error: unknown): error is MFAError {
  return error instanceof MFAError;
}
