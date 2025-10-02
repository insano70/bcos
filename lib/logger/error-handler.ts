/**
 * Enhanced Error Handling with Context Preservation
 * Provides structured error logging with full context
 */

import type { NextRequest } from 'next/server';
import { createAppLogger } from './factory';

const errorLogger = createAppLogger('error');

/**
 * Enhanced error class with context
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
 * Application-specific error types
 */
export class ValidationError extends ContextualError {
  constructor(message: string, field?: string, value?: unknown) {
    super(message, { field, value }, 400);
  }
}

export class AuthenticationError extends ContextualError {
  constructor(message: string, userId?: string) {
    super(message, { userId }, 401);
  }
}

export class AuthorizationError extends ContextualError {
  constructor(message: string, userId?: string, requiredPermission?: string) {
    super(message, { userId, requiredPermission }, 403);
  }
}

export class NotFoundError extends ContextualError {
  constructor(resource: string, id?: string) {
    super(`${resource} not found`, { resource, id }, 404);
  }
}

export class ConflictError extends ContextualError {
  constructor(message: string, conflictingValue?: unknown) {
    super(message, { conflictingValue }, 409);
  }
}

export class RateLimitError extends ContextualError {
  constructor(limit: number, windowMs: number) {
    super('Rate limit exceeded', { limit, windowMs }, 429);
  }
}

export class DatabaseError extends ContextualError {
  constructor(message: string, operation?: string, table?: string) {
    super(message, { operation, table }, 500, false); // Non-operational
  }
}

/**
 * Global error handler with structured logging
 */
export function handleError(
  error: Error | ContextualError,
  _request?: NextRequest,
  additionalContext?: Record<string, unknown>
): {
  message: string;
  statusCode: number;
  context: Record<string, unknown>;
  shouldLog: boolean;
} {
  const baseContext = {
    errorType: error.constructor.name,
    timestamp: new Date().toISOString(),
    ...additionalContext,
  };

  if (error instanceof ContextualError) {
    const context = {
      ...baseContext,
      ...error.context,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
    };

    // Log based on severity and type
    if (!error.isOperational || error.statusCode >= 500) {
      errorLogger.error(`${error.constructor.name}: ${error.message}`, error, context);
    } else if (error.statusCode >= 400) {
      errorLogger.warn(`${error.constructor.name}: ${error.message}`, context);
    } else {
      errorLogger.info(`${error.constructor.name}: ${error.message}`, context);
    }

    return {
      message: error.message,
      statusCode: error.statusCode,
      context,
      shouldLog: true,
    };
  }

  // Handle standard errors
  const context = {
    ...baseContext,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  };

  errorLogger.error(`Unhandled Error: ${error.message}`, error, context);

  return {
    message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    statusCode: 500,
    context,
    shouldLog: true,
  };
}

/**
 * Express-style error handler middleware
 */
export function createErrorHandler(request: NextRequest) {
  return (error: Error | ContextualError, additionalContext?: Record<string, unknown>) => {
    const logger = createAppLogger('error', {
      requestId: Math.random().toString(36).substr(2, 9),
      method: request.method,
      path: new URL(request.url).pathname,
      userAgent: request.headers.get('user-agent') || 'unknown',
      ipAddress:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    const result = handleError(error, request, additionalContext);

    // Log with request context
    if (result.shouldLog) {
      const level = result.statusCode >= 500 ? 'error' : result.statusCode >= 400 ? 'warn' : 'info';

      logger[level]('Request error handled', {
        ...result.context,
        statusCode: result.statusCode,
      });
    }

    return result;
  };
}

/**
 * Async operation error wrapper
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const enhancedError =
        error instanceof ContextualError
          ? error
          : new ContextualError(error instanceof Error ? error.message : 'Unknown error', {
              operation,
              originalError: error instanceof Error ? error.name : typeof error,
            });

      throw enhancedError;
    }
  }) as T;
}

/**
 * Database operation error wrapper
 */
export function withDBErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  table: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw new DatabaseError(
        error instanceof Error ? error.message : 'Database operation failed',
        operation,
        table
      );
    }
  }) as T;
}

/**
 * Validation error helper
 */
export function createValidationError(
  field: string,
  value: unknown,
  message: string
): ValidationError {
  return new ValidationError(`Validation failed for ${field}: ${message}`, field, value);
}

/**
 * Rate limit error helper
 */
export function createRateLimitError(limit: number, windowMs: number): RateLimitError {
  return new RateLimitError(limit, windowMs);
}

export default errorLogger;
