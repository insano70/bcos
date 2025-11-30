/**
 * Error Exports
 *
 * Central export for all error types and utilities
 */

// API Errors (original simple error classes)
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

