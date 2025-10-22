/**
 * Authentication Error Classification
 *
 * Classifies errors from authentication operations to determine
 * appropriate retry behavior and user messaging.
 */

export type AuthErrorType =
  | 'network' // Network connectivity issue - should retry
  | 'rate_limit' // Rate limited - should retry with backoff
  | 'invalid_token' // Token expired/invalid - should not retry
  | 'csrf' // CSRF token issue - should retry with fresh token
  | 'server_error' // 500-level error - should retry
  | 'forbidden' // 403 - permission issue - should not retry
  | 'invalid_request' // 4xx client error (400, 422, etc) - should not retry
  | 'unknown'; // Unknown error - should retry cautiously

export interface ClassifiedError {
  type: AuthErrorType;
  shouldRetry: boolean;
  message: string;
  originalError: unknown;
  statusCode?: number;
}

/**
 * Extended Error interface with HTTP status
 */
export interface HttpError extends Error {
  status?: number;
  response?: Response;
  statusCode?: number;
}

/**
 * Classify an error from an authentication operation
 *
 * Priority order:
 * 1. Check HTTP status code directly (most reliable)
 * 2. Check error type (TypeError for network)
 * 3. Fall back to message parsing (least reliable)
 *
 * @param error - Error from auth operation
 * @returns Classified error with retry recommendation
 */
export function classifyAuthError(error: unknown): ClassifiedError {
  // PRIORITY 1: Check for HTTP status directly (most reliable)
  if (error && typeof error === 'object' && ('status' in error || 'statusCode' in error)) {
    const httpError = error as HttpError;
    const status = httpError.status || httpError.statusCode;

    if (status === 429) {
      return {
        type: 'rate_limit',
        shouldRetry: true,
        message: 'Rate limit exceeded',
        originalError: error,
        statusCode: 429,
      };
    }

    if (status === 401) {
      return {
        type: 'invalid_token',
        shouldRetry: false,
        message: 'Token invalid or expired',
        originalError: error,
        statusCode: 401,
      };
    }

    if (status === 403) {
      // Check if CSRF error by examining message
      const errorMessage = httpError.message?.toLowerCase() || '';
      if (errorMessage.includes('csrf')) {
        return {
          type: 'csrf',
          shouldRetry: true,
          message: 'CSRF token validation failed',
          originalError: error,
          statusCode: 403,
        };
      }
      return {
        type: 'forbidden',
        shouldRetry: false,
        message: 'Access forbidden',
        originalError: error,
        statusCode: 403,
      };
    }

    if (status && status >= 500 && status < 600) {
      return {
        type: 'server_error',
        shouldRetry: true,
        message: 'Server error occurred',
        originalError: error,
        statusCode: status,
      };
    }

    // Other 4xx errors (400, 422, etc) - client error, don't retry
    if (status && status >= 400 && status < 500) {
      return {
        type: 'invalid_request',
        shouldRetry: false,
        message: 'Invalid request',
        originalError: error,
        statusCode: status,
      };
    }
  }

  // PRIORITY 2: Network/fetch errors (TypeError)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      shouldRetry: true,
      message: 'Network connection failed',
      originalError: error,
    };
  }

  // PRIORITY 3: Fall back to message parsing (least reliable)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Rate limit
    if (message.includes('429') || message.includes('rate limit')) {
      return {
        type: 'rate_limit',
        shouldRetry: true,
        message: 'Rate limit exceeded',
        originalError: error,
        statusCode: 429,
      };
    }

    // Invalid/expired token
    if (
      message.includes('401') ||
      message.includes('unauthorized') ||
      message.includes('invalid token') ||
      message.includes('expired token')
    ) {
      return {
        type: 'invalid_token',
        shouldRetry: false,
        message: 'Token invalid or expired',
        originalError: error,
        statusCode: 401,
      };
    }

    // CSRF errors
    if (message.includes('csrf')) {
      return {
        type: 'csrf',
        shouldRetry: true,
        message: 'CSRF token validation failed',
        originalError: error,
        statusCode: 403,
      };
    }

    // Forbidden (not CSRF)
    if (message.includes('403') || message.includes('forbidden')) {
      return {
        type: 'forbidden',
        shouldRetry: false,
        message: 'Access forbidden',
        originalError: error,
        statusCode: 403,
      };
    }

    // Server errors (5xx)
    if (message.match(/5\d{2}/)) {
      return {
        type: 'server_error',
        shouldRetry: true,
        message: 'Server error occurred',
        originalError: error,
        statusCode: 500,
      };
    }

    // Client errors (4xx) - check for 400, 422, etc
    if (message.match(/4\d{2}/) && !message.includes('401') && !message.includes('403') && !message.includes('429')) {
      return {
        type: 'invalid_request',
        shouldRetry: false,
        message: 'Invalid request',
        originalError: error,
        statusCode: 400,
      };
    }

    // Network-related errors
    if (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused')
    ) {
      return {
        type: 'network',
        shouldRetry: true,
        message: 'Network error',
        originalError: error,
      };
    }
  }

  // Unknown error - retry cautiously
  return {
    type: 'unknown',
    shouldRetry: true,
    message: 'Unknown error occurred',
    originalError: error,
  };
}

/**
 * Determine if an error should be retried
 *
 * @param error - Error to evaluate
 * @param attempt - Current retry attempt number
 * @returns Whether to retry
 */
export function shouldRetryAuthError(error: unknown, attempt: number): boolean {
  const classified = classifyAuthError(error);

  // Don't retry invalid tokens or forbidden errors
  if (!classified.shouldRetry) {
    return false;
  }

  // Rate limits: only retry if we have attempts left (backoff will handle delay)
  if (classified.type === 'rate_limit' && attempt >= 2) {
    return false;
  }

  // Network and server errors: retry up to 3 times
  if (classified.type === 'network' || classified.type === 'server_error') {
    return attempt < 3;
  }

  // CSRF errors: only retry once (to fetch fresh token)
  if (classified.type === 'csrf') {
    return attempt === 1;
  }

  // Unknown errors: retry once cautiously
  if (classified.type === 'unknown') {
    return attempt === 1;
  }

  return false;
}
