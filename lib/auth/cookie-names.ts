/**
 * Cookie Name Constants
 * Centralized cookie naming convention for authentication system
 *
 * SECURITY:
 * - Single source of truth prevents typos and inconsistencies
 * - Makes cookie naming searchable and auditable
 * - Enables easy renaming if needed for security
 *
 * USAGE:
 * ```typescript
 * import { COOKIE_NAMES } from '@/lib/auth/cookie-names';
 *
 * cookieStore.set(COOKIE_NAMES.ACCESS_TOKEN, token, options);
 * const token = cookieStore.get(COOKIE_NAMES.REFRESH_TOKEN)?.value;
 * ```
 *
 * @module lib/auth/cookie-names
 */

/**
 * Standardized cookie names for authentication system
 * All cookies use kebab-case convention
 */
export const COOKIE_NAMES = {
  /**
   * Access token cookie (15 minute expiration)
   * Contains JWT for API authentication
   */
  ACCESS_TOKEN: 'access-token',

  /**
   * Refresh token cookie (7-30 day expiration)
   * Used for token rotation and session persistence
   */
  REFRESH_TOKEN: 'refresh-token',

  /**
   * MFA temporary token cookie (5 minute expiration)
   * Used during MFA setup/verification flow
   */
  MFA_TEMP_TOKEN: 'mfa-temp-token',

  /**
   * OIDC session cookie
   * Stores encrypted state for OIDC authentication flow
   */
  OIDC_SESSION: 'oidc-session',

  /**
   * CSRF token cookie
   * Used for CSRF protection
   */
  CSRF_TOKEN: 'csrf-token',
} as const;

/**
 * Type-safe cookie name type
 */
export type CookieName = (typeof COOKIE_NAMES)[keyof typeof COOKIE_NAMES];
