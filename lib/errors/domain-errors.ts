/**
 * Domain Error Classes
 *
 * Typed error classes for domain-specific errors.
 * Provides better error handling and type safety compared to generic Error.
 */

import type { ErrorCode } from '@/lib/types/api-responses';

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all domain errors
 * Extends Error with additional typed properties
 */
export abstract class DomainError extends Error {
  /** HTTP status code for API responses */
  abstract readonly statusCode: number;
  /** Error code for client identification */
  abstract readonly code: ErrorCode;
  /** Whether this error should be logged at error level */
  readonly shouldLog: boolean = true;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): {
    name: string;
    message: string;
    code: ErrorCode;
    statusCode: number;
    details?: Record<string, unknown>;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

// =============================================================================
// Authentication Errors (401)
// =============================================================================

/**
 * Authentication required error
 */
export class AuthenticationRequiredError extends DomainError {
  readonly statusCode = 401;
  readonly code: ErrorCode = 'AUTHENTICATION_REQUIRED';

  constructor(message = 'Authentication required', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * Invalid credentials error
 */
export class InvalidCredentialsError extends DomainError {
  readonly statusCode = 401;
  readonly code: ErrorCode = 'INVALID_CREDENTIALS';
  readonly shouldLog = false; // Don't log failed login attempts at error level

  constructor(message = 'Invalid credentials', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends DomainError {
  readonly statusCode = 401;
  readonly code: ErrorCode = 'TOKEN_EXPIRED';
  readonly shouldLog = false;

  constructor(message = 'Token has expired', details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * Invalid token error
 */
export class TokenInvalidError extends DomainError {
  readonly statusCode = 401;
  readonly code: ErrorCode = 'TOKEN_INVALID';

  constructor(message = 'Token is invalid', details?: Record<string, unknown>) {
    super(message, details);
  }
}

// =============================================================================
// Authorization Errors (403)
// =============================================================================

/**
 * Permission denied error
 */
export class PermissionDeniedError extends DomainError {
  readonly statusCode = 403;
  readonly code: ErrorCode = 'INSUFFICIENT_PERMISSIONS';

  constructor(
    message = 'Insufficient permissions',
    public readonly requiredPermission?: string,
    details?: Record<string, unknown>
  ) {
    super(message, { ...details, requiredPermission });
  }
}

/**
 * Forbidden resource error
 */
export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly code: ErrorCode = 'FORBIDDEN';

  constructor(message = 'Access forbidden', details?: Record<string, unknown>) {
    super(message, details);
  }
}

// =============================================================================
// Validation Errors (400)
// =============================================================================

/**
 * Field validation error detail
 */
export interface FieldError {
  field: string;
  message: string;
  code?: string | undefined;
}

/**
 * Validation error
 */
export class ValidationError extends DomainError {
  readonly statusCode = 400;
  readonly code: ErrorCode = 'VALIDATION_ERROR';

  constructor(
    message = 'Validation failed',
    public readonly fieldErrors: FieldError[] = [],
    details?: Record<string, unknown>
  ) {
    super(message, { ...details, fieldErrors });
  }

  /**
   * Create from a single field error
   */
  static forField(field: string, message: string, code?: string): ValidationError {
    return new ValidationError('Validation failed', [{ field, message, code }]);
  }

  /**
   * Create from Zod validation result
   */
  static fromZodError(zodError: { errors: Array<{ path: (string | number)[]; message: string }> }): ValidationError {
    const fieldErrors = zodError.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return new ValidationError('Validation failed', fieldErrors);
  }
}

// =============================================================================
// Not Found Errors (404)
// =============================================================================

/**
 * Resource not found error
 */
export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code: ErrorCode = 'RESOURCE_NOT_FOUND';

  constructor(
    public readonly resourceType: string,
    public readonly resourceId?: string,
    details?: Record<string, unknown>
  ) {
    const message = resourceId
      ? `${resourceType} with ID '${resourceId}' not found`
      : `${resourceType} not found`;
    super(message, { ...details, resourceType, resourceId });
  }
}

// =============================================================================
// Conflict Errors (409)
// =============================================================================

/**
 * Resource conflict error (duplicate, etc.)
 */
export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly code: ErrorCode = 'RESOURCE_CONFLICT';

  constructor(
    message = 'Resource conflict',
    public readonly conflictType?: 'duplicate' | 'version_mismatch' | 'state_conflict',
    details?: Record<string, unknown>
  ) {
    super(message, { ...details, conflictType });
  }

  /**
   * Create for duplicate resource
   */
  static duplicate(resourceType: string, field: string, value: string): ConflictError {
    return new ConflictError(
      `${resourceType} with ${field} '${value}' already exists`,
      'duplicate',
      { resourceType, field, value }
    );
  }
}

/**
 * Resource locked error
 */
export class ResourceLockedError extends DomainError {
  readonly statusCode = 409;
  readonly code: ErrorCode = 'RESOURCE_LOCKED';

  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string,
    public readonly lockedBy?: string,
    details?: Record<string, unknown>
  ) {
    super(`${resourceType} is locked`, { ...details, resourceType, resourceId, lockedBy });
  }
}

// =============================================================================
// Rate Limit Errors (429)
// =============================================================================

/**
 * Rate limit exceeded error
 */
export class RateLimitExceededError extends DomainError {
  readonly statusCode = 429;
  readonly code: ErrorCode = 'RATE_LIMIT_EXCEEDED';
  readonly shouldLog = false;

  constructor(
    public readonly retryAfterSeconds?: number,
    details?: Record<string, unknown>
  ) {
    super('Too many requests', { ...details, retryAfterSeconds });
  }
}

// =============================================================================
// Server Errors (5xx)
// =============================================================================

/**
 * Internal server error
 */
export class InternalError extends DomainError {
  readonly statusCode = 500;
  readonly code: ErrorCode = 'INTERNAL_ERROR';

  constructor(
    message = 'An internal error occurred',
    public readonly originalError?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, details);
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Database error
 */
export class DatabaseError extends DomainError {
  readonly statusCode = 500;
  readonly code: ErrorCode = 'DATABASE_ERROR';

  constructor(
    message = 'Database operation failed',
    public readonly operation?: 'read' | 'write' | 'delete' | 'transaction',
    details?: Record<string, unknown>
  ) {
    super(message, { ...details, operation });
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends DomainError {
  readonly statusCode = 502;
  readonly code: ErrorCode = 'EXTERNAL_SERVICE_ERROR';

  constructor(
    public readonly serviceName: string,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message || `${serviceName} service error`, { ...details, serviceName });
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends DomainError {
  readonly statusCode = 503;
  readonly code: ErrorCode = 'SERVICE_UNAVAILABLE';

  constructor(
    message = 'Service temporarily unavailable',
    public readonly retryAfterSeconds?: number,
    details?: Record<string, unknown>
  ) {
    super(message, { ...details, retryAfterSeconds });
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if error is a DomainError
 */
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: unknown): error is AuthenticationRequiredError | InvalidCredentialsError | TokenExpiredError | TokenInvalidError {
  return (
    error instanceof AuthenticationRequiredError ||
    error instanceof InvalidCredentialsError ||
    error instanceof TokenExpiredError ||
    error instanceof TokenInvalidError
  );
}

/**
 * Check if error is an authorization error
 */
export function isAuthorizationError(error: unknown): error is PermissionDeniedError | ForbiddenError {
  return error instanceof PermissionDeniedError || error instanceof ForbiddenError;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

// =============================================================================
// Error Wrapping Utilities
// =============================================================================

/**
 * Wrap unknown error in a DomainError
 */
export function wrapError(error: unknown, fallbackMessage = 'An error occurred'): DomainError {
  if (isDomainError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message, error);
  }

  if (typeof error === 'string') {
    return new InternalError(error);
  }

  return new InternalError(fallbackMessage);
}

/**
 * Assert a condition, throwing NotFoundError if false
 */
export function assertExists<T>(
  value: T | null | undefined,
  resourceType: string,
  resourceId?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resourceType, resourceId);
  }
}

/**
 * Assert permission, throwing PermissionDeniedError if false
 */
export function assertPermission(
  hasPermission: boolean,
  permission?: string,
  message?: string
): asserts hasPermission is true {
  if (!hasPermission) {
    throw new PermissionDeniedError(message, permission);
  }
}

