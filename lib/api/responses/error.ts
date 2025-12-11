/**
 * API Error Response Utilities
 *
 * Provides utilities for creating standardized API error responses.
 * These are FACTORY FUNCTIONS designed for route handlers.
 *
 * USE THIS MODULE WHEN:
 * - Creating HTTP error responses in API route handlers
 * - You need `createErrorResponse()` to generate Response objects
 * - Using `handleRouteError()` in catch blocks
 *
 * FOR THROWING TYPED ERRORS:
 * Use `@/lib/errors/api-errors` instead, which provides:
 * - Class-based errors that support `instanceof` checks
 * - The `isOperational` flag for error classification
 * - Proper error subclasses (ValidationError, AuthenticationError, etc.)
 *
 * @example
 * ```typescript
 * // In a route handler catch block (use this module)
 * import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
 * return createErrorResponse(NotFoundError('User'), 404, request);
 *
 * // Or use handleRouteError for automatic status detection
 * return handleRouteError(error, 'Failed to fetch user', request);
 * ```
 */

import { APIError } from '@/lib/errors/api-errors';

// Re-export APIError for backward compatibility
export { APIError } from '@/lib/errors/api-errors';

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
  meta: {
    timestamp: string;
    path?: string;
  };
}

export function createErrorResponse(
  error: string | Error | APIError,
  statusCode: number = 500,
  request?: Request
): Response {
  let errorMessage: string;
  let errorCode: string | undefined;
  let errorDetails: unknown;
  let finalStatusCode = statusCode;

  if (error instanceof APIError) {
    errorMessage = error.message;
    finalStatusCode = error.statusCode;
    errorCode = error.code;
    errorDetails = error.details;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = 'Unknown error';
  }

  // Construct proper external URL for error path (avoid internal AWS DNS)
  let externalPath: string | undefined;
  if (request?.url) {
    try {
      const url = new URL(request.url);
      // For server-side error responses, use APP_URL (runtime environment variable)
      const baseUrl = process.env.APP_URL || 'http://localhost:4001';
      externalPath = `${baseUrl}${url.pathname}${url.search}`;
    } catch {
      // Fallback to original URL if parsing fails
      externalPath = request.url;
    }
  }

  const response: ErrorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode || 'INTERNAL_ERROR',
    details: errorDetails,
    meta: {
      timestamp: new Date().toISOString(),
      ...(externalPath && { path: externalPath }),
    },
  };

  return Response.json(response, { status: finalStatusCode });
}

// Predefined error factory functions for common scenarios
// These create APIError instances with appropriate codes for HTTP responses
export const AuthenticationError = (message = 'Authentication required') =>
  new APIError(message, 401, true, 'AUTHENTICATION_REQUIRED');

export const AuthorizationError = (message = 'Insufficient permissions') =>
  new APIError(message, 403, true, 'INSUFFICIENT_PERMISSIONS');

export const ValidationError = (details: unknown, message = 'Validation failed') =>
  new APIError(message, 400, true, 'VALIDATION_ERROR', details);

export const NotFoundError = (resource = 'Resource') =>
  new APIError(`${resource} not found`, 404, true, 'RESOURCE_NOT_FOUND');

export const ConflictError = (message = 'Resource already exists') =>
  new APIError(message, 409, true, 'RESOURCE_CONFLICT');

export const RateLimitError = (resetTime?: number) =>
  new APIError('Too many requests', 429, true, 'RATE_LIMIT_EXCEEDED', { resetTime });

/**
 * Converts unknown error types to Error instances
 *
 * Utility function to ensure consistent error handling across the application.
 * Use this to normalize errors before passing to createErrorResponse.
 *
 * @param error - Any error type (Error, string, unknown)
 * @returns Error instance
 *
 * @example
 * ```typescript
 * try {
 *   await operation();
 * } catch (error) {
 *   return createErrorResponse(toError(error), 500, request);
 * }
 * ```
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error(String(error));
}

/**
 * Determines the appropriate HTTP status code from an error
 *
 * Inspects error message patterns to differentiate between:
 * - 400: Validation errors, invalid input
 * - 401: Authentication errors
 * - 403: Permission/authorization errors
 * - 404: Not found errors
 * - 409: Conflict/duplicate errors
 * - 500: Unknown/server errors (default)
 *
 * This helps prevent returning 500 for user-caused errors.
 *
 * @param error - The error to analyze
 * @returns Appropriate HTTP status code
 *
 * @example
 * ```typescript
 * catch (error) {
 *   const statusCode = getErrorStatusCode(error);
 *   return NextResponse.json({ error: error.message }, { status: statusCode });
 * }
 * ```
 */
export function getErrorStatusCode(error: unknown): number {
  // If it's already an APIError, use its status code
  if (error instanceof APIError) {
    return error.statusCode;
  }

  // ZodError is always a validation error
  if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
    return 400;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // 404 patterns
  if (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('no such')
  ) {
    return 404;
  }

  // 403 patterns
  if (
    message.includes('permission denied') ||
    message.includes('insufficient permissions') ||
    message.includes('access denied') ||
    message.includes('forbidden') ||
    message.includes('not authorized')
  ) {
    return 403;
  }

  // 401 patterns
  if (
    message.includes('authentication required') ||
    message.includes('not authenticated') ||
    message.includes('invalid token') ||
    message.includes('token expired') ||
    message.includes('unauthorized')
  ) {
    return 401;
  }

  // 409 patterns
  if (
    message.includes('already exists') ||
    message.includes('duplicate') ||
    message.includes('conflict')
  ) {
    return 409;
  }

  // 400 patterns
  if (
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('required') ||
    message.includes('must be') ||
    message.includes('cannot be')
  ) {
    return 400;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Creates an appropriate error response based on error type detection
 *
 * Combines error analysis with response generation for cleaner catch blocks.
 *
 * @param error - The error to handle
 * @param fallbackMessage - Message to use if error detection fails
 * @param request - Optional request for path inclusion in response
 * @returns NextResponse with appropriate status code
 *
 * @example
 * ```typescript
 * catch (error) {
 *   log.error('Operation failed', error);
 *   return handleRouteError(error, 'Failed to process request', request);
 * }
 * ```
 */
export function handleRouteError(
  error: unknown,
  fallbackMessage: string,
  request?: Request
): Response {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : fallbackMessage;

  // For 5xx errors, use the fallback message to avoid exposing internal details
  const safeMessage = statusCode >= 500 ? fallbackMessage : message;

  return createErrorResponse(safeMessage, statusCode, request);
}
