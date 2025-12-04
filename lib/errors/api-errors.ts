/**
 * Custom API Error Classes
 *
 * Provides properly typed error classes with appropriate HTTP status codes.
 * These are CLASS-BASED errors designed for throwing and catching with `instanceof`.
 *
 * USE THIS MODULE WHEN:
 * - You need to throw typed errors in services/business logic
 * - You want to use `instanceof` checks for error handling
 * - You need the `isOperational` flag to distinguish expected vs programming errors
 *
 * FOR API RESPONSES:
 * Use `@/lib/api/responses/error` instead, which provides:
 * - `createErrorResponse()` for generating HTTP responses
 * - Factory functions for quick error response creation
 * - `handleRouteError()` for catch blocks in route handlers
 *
 * @example
 * ```typescript
 * // Throwing a typed error (use this module)
 * import { NotFoundError } from '@/lib/errors';
 * throw new NotFoundError('User not found');
 *
 * // Catching and checking type
 * if (error instanceof NotFoundError) {
 *   // Handle 404 case
 * }
 * ```
 */

/**
 * Base API Error class
 */
export class APIError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 400 Bad Request - Invalid input validation
 */
export class ValidationError extends APIError {
  constructor(message: string = 'Validation failed') {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * 401 Unauthorized - Session invalid or expired
 * Use when token validates but session/user context cannot be loaded
 */
export class SessionInvalidError extends APIError {
  public readonly reason: SessionInvalidReason;

  constructor(reason: SessionInvalidReason, message?: string) {
    const defaultMessages: Record<SessionInvalidReason, string> = {
      session_not_found: 'Session not found',
      session_expired: 'Session has expired',
      user_not_found: 'User account not found',
      user_inactive: 'User account is inactive',
      context_load_failed: 'Failed to load user context',
      token_revoked: 'Token has been revoked',
    };
    super(message || defaultMessages[reason], 401);
    this.name = 'SessionInvalidError';
    this.reason = reason;
  }
}

/**
 * Reasons why a session can be invalid
 */
export type SessionInvalidReason =
  | 'session_not_found'
  | 'session_expired'
  | 'user_not_found'
  | 'user_inactive'
  | 'context_load_failed'
  | 'token_revoked';

/**
 * 403 Forbidden - Insufficient permissions
 */
export class AuthorizationError extends APIError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends APIError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict - Resource already exists or conflict
 */
export class ConflictError extends APIError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * 422 Unprocessable Entity - Semantic validation error
 */
export class UnprocessableEntityError extends APIError {
  constructor(message: string = 'Unprocessable entity') {
    super(message, 422);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends APIError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends APIError {
  constructor(message: string = 'Internal server error', isOperational = false) {
    super(message, 500, isOperational);
    this.name = 'InternalServerError';
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends APIError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Helper function to determine status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof APIError) {
    return error.statusCode;
  }

  // Check for common error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) return 404;
    if (message.includes('already exists')) return 409;
    if (message.includes('invalid') || message.includes('validation')) return 400;
    if (message.includes('unauthorized') || message.includes('authentication')) return 401;
    if (message.includes('forbidden') || message.includes('permission')) return 403;
    if (message.includes('rate limit')) return 429;
    if (message.includes('unavailable')) return 503;
  }

  return 500;
}

/**
 * Helper function to check if error is operational (expected) or programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof APIError) {
    return error.isOperational;
  }
  return false;
}
