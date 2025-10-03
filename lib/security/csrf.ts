/**
 * CSRF Protection Export
 * Provides unified CSRF protection functionality
 */

// Re-export types and client functions
export type { CSRFTokenValidation } from './csrf-client';
export {
  validateTokenStructure,
  validateTokenWithServer,
  getCSRFTokenFromCookie,
  validateToken,
  shouldRefreshToken,
  getTokenMetadata
} from './csrf-client';
export { CSRFSecurityMonitor } from './csrf-monitoring';
export { csrfMonitor, getCSRFMonitor } from './csrf-monitoring-instance';

// Re-export unified CSRF functions and constants
export {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_TOKEN_LENGTH,
  generateAnonymousToken,
  generateAuthenticatedToken,
  validateAnonymousToken,
  validateAuthenticatedToken,
  setCSRFToken,
  getCSRFToken,
  isAnonymousEndpoint,
  isDualTokenEndpoint,
  verifyCSRFToken,
  requiresCSRFProtection,
  generateToken
} from './csrf-unified';
