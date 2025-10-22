/**
 * Retry Utility with Exponential Backoff
 *
 * Provides configurable retry logic for async operations.
 * Used primarily for authentication token refresh to prevent
 * unnecessary session termination due to transient failures.
 */

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Retry an async operation with exponential backoff
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries exhausted
 *
 * @example
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   {
 *     maxAttempts: 3,
 *     initialDelayMs: 1000,
 *     shouldRetry: (error) => isNetworkError(error),
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms`);
 *     }
 *   }
 * );
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...defaultOptions, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt >= config.maxAttempts) {
        break;
      }

      // Check if we should retry this error
      if (config.shouldRetry && !config.shouldRetry(error, attempt)) {
        break;
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = config.initialDelayMs * 2 ** (attempt - 1);
      const delayMs = Math.min(exponentialDelay, config.maxDelayMs);

      // Notify about retry
      if (config.onRetry) {
        config.onRetry(error, attempt, delayMs);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}

/**
 * Sleep utility for testing and manual delays
 *
 * Provides a Promise-based sleep function for use in tests,
 * manual delays, and rate limiting implementations.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 *
 * @example
 * // Wait 1 second before continuing
 * await sleep(1000);
 *
 * @example
 * // Use in tests to simulate async delays
 * await sleep(100);
 * expect(asyncOperation).toHaveBeenCalled();
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
