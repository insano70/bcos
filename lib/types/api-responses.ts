/**
 * API Response Types
 *
 * Discriminated union types for API responses.
 * Provides type-safe response handling with exhaustive pattern matching.
 */

import type { ISODateString, UUID } from './utility-types';

// =============================================================================
// Base Response Types
// =============================================================================

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Response metadata included in all responses
 */
export interface ResponseMeta {
  timestamp: string;
  requestId?: string;
  duration?: number;
}

/**
 * Successful response with data
 */
export interface SuccessResponsePayload<T> {
  success: true;
  data: T;
  message?: string;
  meta: ResponseMeta & {
    pagination?: PaginationMeta;
  };
}

/**
 * Error detail for validation errors
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

/**
 * Error response payload
 */
export interface ErrorResponsePayload {
  success: false;
  error: {
    message: string;
    code: ErrorCode;
    details?: ValidationErrorDetail[] | Record<string, unknown>;
  };
  meta: ResponseMeta & {
    path?: string;
  };
}

// =============================================================================
// Error Codes (Discriminant)
// =============================================================================

/**
 * Standard API error codes
 */
export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_CONFLICT'
  | 'RESOURCE_LOCKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR';

// =============================================================================
// Discriminated Union Response Types
// =============================================================================

/**
 * API response that can be success or error
 * Use for type-safe response handling with exhaustive pattern matching
 *
 * @example
 * ```typescript
 * const response: ApiResponse<User> = await fetchUser(id);
 *
 * if (response.success) {
 *   // TypeScript knows response.data is User
 *   console.log(response.data.email);
 * } else {
 *   // TypeScript knows response.error exists
 *   console.error(response.error.message);
 * }
 * ```
 */
export type ApiResponse<T> = SuccessResponsePayload<T> | ErrorResponsePayload;

/**
 * Type guard to check if response is successful
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is SuccessResponsePayload<T> {
  return response.success === true;
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is ErrorResponsePayload {
  return response.success === false;
}

// =============================================================================
// Specific Response Types by Domain
// =============================================================================

/**
 * Single item response
 */
export type ItemResponse<T> = ApiResponse<T>;

/**
 * List response with pagination
 */
export type ListResponse<T> = ApiResponse<{
  items: T[];
  pagination: PaginationMeta;
}>;

/**
 * Create operation response (includes created item and ID)
 */
export type CreateResponse<T> = ApiResponse<T & { id: UUID }>;

/**
 * Update operation response
 */
export type UpdateResponse<T> = ApiResponse<T>;

/**
 * Delete operation response
 */
export type DeleteResponse = ApiResponse<{
  deleted: true;
  id: UUID;
  deletedAt: ISODateString;
}>;

/**
 * Batch operation response
 */
export type BatchResponse<T> = ApiResponse<{
  succeeded: T[];
  failed: Array<{
    item: unknown;
    error: string;
  }>;
  total: number;
  successCount: number;
  failureCount: number;
}>;

// =============================================================================
// Authentication Response Types
// =============================================================================

/**
 * Login response with tokens
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export type LoginResponse = ApiResponse<{
  user: {
    id: UUID;
    email: string;
    firstName: string;
    lastName: string;
  };
  tokens: AuthTokens;
}>;

export type RefreshTokenResponse = ApiResponse<AuthTokens>;

export type LogoutResponse = ApiResponse<{ loggedOut: true }>;

// =============================================================================
// Validation Response Types
// =============================================================================

/**
 * Validation result for a single field
 */
export interface FieldValidationResult {
  field: string;
  valid: boolean;
  message?: string;
}

/**
 * Validation response for form validation endpoints
 */
export type ValidationResponse = ApiResponse<{
  valid: boolean;
  fields: FieldValidationResult[];
}>;

// =============================================================================
// Health Check Response Types
// =============================================================================

/**
 * Service health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual service health
 */
export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latency?: number;
  message?: string;
}

/**
 * Health check response
 */
export type HealthCheckResponse = ApiResponse<{
  status: HealthStatus;
  version: string;
  uptime: number;
  services: ServiceHealth[];
}>;

// =============================================================================
// Upload Response Types
// =============================================================================

/**
 * File upload response
 */
export type UploadResponse = ApiResponse<{
  fileId: UUID;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  uploadedAt: ISODateString;
}>;

/**
 * Presigned URL response for direct uploads
 */
export type PresignedUrlResponse = ApiResponse<{
  uploadUrl: string;
  fileKey: string;
  expiresAt: ISODateString;
  maxFileSize: number;
}>;

// =============================================================================
// Async Operation Response Types
// =============================================================================

/**
 * Async job status
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Async job response
 */
export type AsyncJobResponse = ApiResponse<{
  jobId: UUID;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: string;
  createdAt: ISODateString;
  completedAt?: ISODateString;
}>;

// =============================================================================
// Response Builder Helpers
// =============================================================================

/**
 * Create a success response payload
 */
export function createSuccessPayload<T>(
  data: T,
  options?: {
    message?: string;
    pagination?: PaginationMeta;
    requestId?: string;
  }
): SuccessResponsePayload<T> {
  return {
    success: true,
    data,
    ...(options?.message && { message: options.message }),
    meta: {
      timestamp: new Date().toISOString(),
      ...(options?.requestId && { requestId: options.requestId }),
      ...(options?.pagination && { pagination: options.pagination }),
    },
  };
}

/**
 * Create an error response payload
 */
export function createErrorPayload(
  message: string,
  code: ErrorCode,
  options?: {
    details?: ValidationErrorDetail[] | Record<string, unknown>;
    path?: string;
    requestId?: string;
  }
): ErrorResponsePayload {
  return {
    success: false,
    error: {
      message,
      code,
      ...(options?.details && { details: options.details }),
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(options?.path && { path: options.path }),
      ...(options?.requestId && { requestId: options.requestId }),
    },
  };
}

// =============================================================================
// Response Assertion Helpers
// =============================================================================

/**
 * Assert response is successful and return data
 * Throws if response is an error
 */
export function assertSuccess<T>(response: ApiResponse<T>): T {
  if (!isSuccessResponse(response)) {
    throw new Error(response.error.message);
  }
  return response.data;
}

/**
 * Unwrap response data, returning undefined on error
 */
export function unwrapResponse<T>(response: ApiResponse<T>): T | undefined {
  return isSuccessResponse(response) ? response.data : undefined;
}

/**
 * Map success response data
 */
export function mapResponse<T, U>(
  response: ApiResponse<T>,
  mapper: (data: T) => U
): ApiResponse<U> {
  if (isSuccessResponse(response)) {
    return {
      ...response,
      data: mapper(response.data),
    };
  }
  return response;
}

