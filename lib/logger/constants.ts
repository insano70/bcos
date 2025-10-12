/**
 * Logging Constants
 *
 * Centralized constants for consistent logging behavior across the application.
 */

/**
 * Slow Operation Thresholds (milliseconds)
 *
 * Used to detect operations that are taking longer than expected.
 * These thresholds are set based on operation complexity and user experience expectations.
 *
 * Rationale:
 * - DB_QUERY: 500ms - Database queries should be fast. Anything over 500ms indicates:
 *   - Missing indexes
 *   - Complex joins
 *   - Large result sets
 *   - Network latency to database
 *
 * - API_OPERATION: 1000ms - Standard API operations (list, read, simple updates):
 *   - Includes validation, single DB query, response formatting
 *   - User expects sub-second response for simple operations
 *   - Over 1s indicates performance issues
 *
 * - AUTH_OPERATION: 2000ms - Authentication operations (login, token refresh, MFA):
 *   - Multiple steps: validation, DB queries, token generation, RBAC context fetch, cookie setup
 *   - Password hashing (intentionally slow for security)
 *   - External service calls (MFA, SSO)
 *   - More tolerance due to complexity
 *
 * Usage:
 * ```typescript
 * import { SLOW_THRESHOLDS } from '@/lib/logger/constants';
 *
 * log.info('query completed', {
 *   duration,
 *   slow: duration > SLOW_THRESHOLDS.DB_QUERY,
 * });
 * ```
 */
export const SLOW_THRESHOLDS = {
  /** Database query operations - 500ms */
  DB_QUERY: 500,

  /** Standard API operations (list, read, update) - 1000ms */
  API_OPERATION: 1000,

  /** Complex authentication operations (login, refresh, MFA) - 2000ms */
  AUTH_OPERATION: 2000,
} as const;

/**
 * Type-safe access to slow thresholds
 */
export type SlowThreshold = (typeof SLOW_THRESHOLDS)[keyof typeof SLOW_THRESHOLDS];
