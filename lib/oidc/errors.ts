/**
 * OIDC Error Definitions
 *
 * Custom error types for specific OIDC error handling.
 * These errors provide better debugging and structured error responses.
 */

/**
 * Base OIDC Error
 *
 * Base class for all OIDC-related errors.
 */
export class OIDCError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'OIDCError';
    this.code = code;
    this.details = details ? { ...details } : undefined;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Token Exchange Error
 *
 * Thrown when the authorization code exchange fails.
 * This typically indicates issues with the authorization code or PKCE validation.
 */
export class TokenExchangeError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'token_exchange_failed', details);
    this.name = 'TokenExchangeError';
  }
}

/**
 * Token Validation Error
 *
 * Thrown when ID token validation fails.
 * This indicates the token doesn't meet expected criteria.
 */
export class TokenValidationError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'token_validation_failed', details);
    this.name = 'TokenValidationError';
  }
}

/**
 * State Validation Error
 *
 * Thrown when state parameter validation fails.
 * This indicates a potential CSRF attack or session expiration.
 */
export class StateValidationError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'state_validation_failed', details);
    this.name = 'StateValidationError';
  }
}

/**
 * Configuration Error
 *
 * Thrown when OIDC configuration is invalid or missing.
 */
export class ConfigurationError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'configuration_error', details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Session Error
 *
 * Thrown when OIDC session is invalid, expired, or tampered with.
 */
export class SessionError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'session_error', details);
    this.name = 'SessionError';
  }
}

/**
 * Discovery Error
 *
 * Thrown when OIDC discovery fails.
 */
export class DiscoveryError extends OIDCError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'discovery_failed', details);
    this.name = 'DiscoveryError';
  }
}
