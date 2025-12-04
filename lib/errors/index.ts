/**
 * Error Exports
 *
 * Central export for all error types and utilities.
 *
 * This module provides CLASS-BASED errors for throwing in business logic.
 * Use these when you need `instanceof` checks or proper error inheritance.
 *
 * For API RESPONSE generation, use `@/lib/api/responses/error` instead.
 *
 * Error Hierarchy:
 * - API Errors (api-errors.ts): Simple typed errors with statusCode
 * - Domain Errors (domain-errors.ts): Rich typed errors with codes and details
 *
 * @example
 * ```typescript
 * import { NotFoundError, ValidationError } from '@/lib/errors';
 *
 * // Throw in service
 * throw new NotFoundError('User not found');
 *
 * // Catch and check
 * if (error instanceof ValidationError) {
 *   // Handle validation error
 * }
 * ```
 */

// API Errors (simple error classes with statusCode)
export {
  APIError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  getErrorStatusCode,
  InternalServerError,
  isOperationalError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  SessionInvalidError,
  UnprocessableEntityError,
  ValidationError,
} from './api-errors';

export type { SessionInvalidReason } from './api-errors';

// Domain Errors (typed error classes with codes)
export {
  // Base class
  DomainError,
  // Auth errors
  AuthenticationRequiredError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenInvalidError,
  // Authorization errors
  PermissionDeniedError,
  ForbiddenError,
  // Validation errors
  ValidationError as DomainValidationError,
  // Not found errors
  NotFoundError as DomainNotFoundError,
  // Conflict errors
  ConflictError as DomainConflictError,
  ResourceLockedError,
  // Rate limit errors
  RateLimitExceededError,
  // Server errors
  InternalError,
  DatabaseError,
  ExternalServiceError,
  ServiceUnavailableError as DomainServiceUnavailableError,
  // Type guards
  isDomainError,
  isAuthError,
  isAuthorizationError,
  isValidationError,
  isNotFoundError,
  // Utilities
  wrapError,
  assertExists,
  assertPermission,
} from './domain-errors';

export type { FieldError } from './domain-errors';

