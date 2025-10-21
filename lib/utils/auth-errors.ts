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
  | 'unknown'; // Unknown error - should retry cautiously

export interface ClassifiedError {
  type: AuthErrorType;
  shouldRetry: boolean;
  message: string;
  originalError: unknown;
  statusCode?: number;
}

/**
 * Classify an error from an authentication operation
 *
 * @param error - Error from auth operation
 * @returns Classified error with retry recommendation
 */
export function classifyAuthError(error: unknown): ClassifiedError {
  // Network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      shouldRetry: true,
      message: 'Network connection failed',
      originalError: error,
    };
  }

  // Standard Error objects
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

    // Server errors (500-599)
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return {
        type: 'server_error',
        shouldRetry: true,
        message: 'Server error occurred',
        originalError: error,
        statusCode: 500,
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
