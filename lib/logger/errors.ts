/**
 * Application Error Classes
 *
 * Structured error types with HTTP status codes and context preservation.
 * These errors integrate with the logging system to provide rich error details.
 */

/**
 * Base error class with context and HTTP status code
 */
export class ContextualError extends Error {
  public readonly context: Record<string, unknown>;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    context: Record<string, unknown> = {},
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 * Use when user input fails validation
 */
export class ValidationError extends ContextualError {
  constructor(message: string, field?: string, value?: unknown) {
    super(message, { field, value }, 400);
  }
}

/**
 * Authentication error (401)
 * Use when authentication fails or is missing
 */
export class AuthenticationError extends ContextualError {
  constructor(message: string, userId?: string) {
    super(message, { userId }, 401);
  }
}

/**
 * Authorization error (403)
 * Use when user lacks required permissions
 */
export class AuthorizationError extends ContextualError {
  constructor(message: string, userId?: string, requiredPermission?: string) {
    super(message, { userId, requiredPermission }, 403);
  }
}

/**
 * Not found error (404)
 * Use when requested resource doesn't exist
 */
export class NotFoundError extends ContextualError {
  constructor(resource: string, id?: string) {
    super(`${resource} not found`, { resource, id }, 404);
  }
}

/**
 * Conflict error (409)
 * Use when operation conflicts with current state (e.g., duplicate key)
 */
export class ConflictError extends ContextualError {
  constructor(message: string, conflictingValue?: unknown) {
    super(message, { conflictingValue }, 409);
  }
}

/**
 * Rate limit error (429)
 * Use when rate limit is exceeded
 */
export class RateLimitError extends ContextualError {
  constructor(limit: number, windowMs: number) {
    super('Rate limit exceeded', { limit, windowMs }, 429);
  }
}

/**
 * Database error (500)
 * Use for database operation failures
 * Marked as non-operational (infrastructure issue)
 */
export class DatabaseError extends ContextualError {
  constructor(message: string, operation?: string, table?: string) {
    super(message, { operation, table }, 500, false);
  }
}
