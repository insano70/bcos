/**
 * CSRF Protection Export
 * Provides unified CSRF protection functionality
 */

// Re-export types and client functions
export type { CSRFTokenValidation } from './csrf-client';
export {
  getCSRFTokenFromCookie,
  getTokenMetadata,
  shouldRefreshToken,
  validateToken,
  validateTokenStructure,
  validateTokenWithServer,
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
  generateToken,
  getCSRFToken,
  isAnonymousEndpoint,
  isDualTokenEndpoint,
  requiresCSRFProtection,
  setCSRFToken,
  validateAnonymousToken,
  validateAuthenticatedToken,
  verifyCSRFToken,
} from './csrf-unified';
