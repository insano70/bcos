/**
 * Authentication TTL Constants
 *
 * Centralized time-to-live constants for authentication system.
 * All values are in SECONDS for direct use with cookie maxAge.
 *
 * USAGE:
 * ```typescript
 * import { AUTH_TTL } from '@/lib/constants/auth-ttl';
 *
 * cookieStore.set('token', value, { maxAge: AUTH_TTL.ACCESS_TOKEN });
 * ```
 *
 * @module lib/constants/auth-ttl
 */

/**
 * Authentication TTL constants in SECONDS
 *
 * Use these for cookie maxAge and other second-based durations.
 */
export const AUTH_TTL = {
  /** Access token lifetime: 15 minutes */
  ACCESS_TOKEN: 15 * 60,

  /** Refresh token standard lifetime: 7 days */
  REFRESH_TOKEN_STANDARD: 7 * 24 * 60 * 60,

  /** Refresh token extended lifetime (remember me): 30 days */
  REFRESH_TOKEN_EXTENDED: 30 * 24 * 60 * 60,

  /** MFA temporary token lifetime: 5 minutes */
  MFA_TEMP_TOKEN: 5 * 60,

  /** OIDC session lifetime: 2 minutes */
  OIDC_SESSION: 2 * 60,

  /** CSRF token lifetime: 24 hours */
  CSRF_TOKEN: 24 * 60 * 60,
} as const;

/**
 * Authentication TTL constants in MILLISECONDS
 *
 * Use these for setTimeout, Date arithmetic, and JWT exp calculations.
 */
export const AUTH_TTL_MS = {
  /** Access token lifetime: 15 minutes */
  ACCESS_TOKEN: AUTH_TTL.ACCESS_TOKEN * 1000,

  /** Refresh token standard lifetime: 7 days */
  REFRESH_TOKEN_STANDARD: AUTH_TTL.REFRESH_TOKEN_STANDARD * 1000,

  /** Refresh token extended lifetime (remember me): 30 days */
  REFRESH_TOKEN_EXTENDED: AUTH_TTL.REFRESH_TOKEN_EXTENDED * 1000,

  /** MFA temporary token lifetime: 5 minutes */
  MFA_TEMP_TOKEN: AUTH_TTL.MFA_TEMP_TOKEN * 1000,

  /** OIDC session lifetime: 2 minutes */
  OIDC_SESSION: AUTH_TTL.OIDC_SESSION * 1000,

  /** CSRF token lifetime: 24 hours */
  CSRF_TOKEN: AUTH_TTL.CSRF_TOKEN * 1000,
} as const;

/**
 * Helper to get refresh token TTL based on remember me preference
 *
 * @param rememberMe - Whether user selected "remember me"
 * @returns TTL in seconds
 */
export function getRefreshTokenTTL(rememberMe: boolean): number {
  return rememberMe ? AUTH_TTL.REFRESH_TOKEN_EXTENDED : AUTH_TTL.REFRESH_TOKEN_STANDARD;
}

/**
 * Helper to get refresh token TTL in milliseconds
 *
 * @param rememberMe - Whether user selected "remember me"
 * @returns TTL in milliseconds
 */
export function getRefreshTokenTTLMs(rememberMe: boolean): number {
  return rememberMe ? AUTH_TTL_MS.REFRESH_TOKEN_EXTENDED : AUTH_TTL_MS.REFRESH_TOKEN_STANDARD;
}
