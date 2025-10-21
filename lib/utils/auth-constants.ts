/**
 * Authentication System Constants
 *
 * Centralized constants for authentication retry logic, timeouts,
 * and other configurable values. This ensures consistency across
 * the authentication system and makes values easy to tune.
 */

/**
 * Token refresh retry configuration
 */
export const AUTH_RETRY_CONFIG = {
  /** Maximum number of retry attempts for token refresh */
  MAX_ATTEMPTS: 3,

  /** Initial delay before first retry (milliseconds) */
  INITIAL_DELAY_MS: 1000,

  /** Maximum delay between retries (milliseconds) */
  MAX_DELAY_MS: 4000,

  /** Maximum time to wait for concurrent auth operations (milliseconds) */
  MUTEX_TIMEOUT_MS: 5000,

  /** Interval to check if concurrent operation completed (milliseconds) */
  MUTEX_CHECK_INTERVAL_MS: 100,
} as const;

/**
 * API client retry configuration
 */
export const API_CLIENT_RETRY_CONFIG = {
  /** Maximum number of retries after successful token refresh */
  MAX_RETRIES: 2,

  /** Delay between retries (milliseconds) */
  RETRY_DELAY_MS: 500,
} as const;

/**
 * Token refresh intervals
 */
export const TOKEN_REFRESH_INTERVALS = {
  /** How often to refresh tokens proactively (milliseconds) */
  PERIODIC_REFRESH_MS: 8 * 60 * 1000, // 8 minutes

  /** Access token lifetime (milliseconds) - for reference */
  ACCESS_TOKEN_LIFETIME_MS: 15 * 60 * 1000, // 15 minutes

  /** Safety margin between refresh and expiration */
  SAFETY_MARGIN_MS: 7 * 60 * 1000, // 7 minutes
} as const;
