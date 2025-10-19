/**
 * @deprecated This file contains legacy JWT functions that should NOT be used in new code.
 *
 * MIGRATION GUIDE:
 * - Use `token-manager.ts` for all token operations
 * - createTokenPair() - Creates access + refresh tokens with proper rotation
 * - validateAccessToken() - Validates access tokens with blacklist checking
 * - refreshTokenPair() - Rotates tokens with reuse detection
 *
 * SECURITY ISSUES WITH THIS FILE:
 * - signJWT() creates 24-hour tokens (should be 15 minutes)
 * - refreshJWT() doesn't rotate tokens (security vulnerability)
 * - No blacklist checking (tokens can't be revoked)
 * - No audit logging
 * - No device fingerprinting
 *
 * This file is kept only for backward compatibility with legacy tests.
 * DO NOT import from this file in production code.
 */

import { log } from '@/lib/logger';

/**
 * @deprecated Use createTokenPair() from token-manager.ts instead
 * @internal Legacy function - will be removed in future version
 */
export async function signJWT(): Promise<string> {
  log.error('DEPRECATED: signJWT() called - use token-manager.ts instead', new Error('deprecated'), {
    operation: 'signJWT',
    deprecated: true,
    migration: 'Use createTokenPair() from @/lib/auth/token-manager',
  });
  throw new Error(
    'signJWT() is deprecated. Use createTokenPair() from @/lib/auth/token-manager instead.'
  );
}

/**
 * @deprecated Use validateAccessToken() from token-manager.ts instead
 * @internal Legacy function - will be removed in future version
 */
export async function verifyJWT(): Promise<null> {
  log.error('DEPRECATED: verifyJWT() called - use token-manager.ts instead', new Error('deprecated'), {
    operation: 'verifyJWT',
    deprecated: true,
    migration: 'Use validateAccessToken() from @/lib/auth/token-manager',
  });
  throw new Error(
    'verifyJWT() is deprecated. Use validateAccessToken() from @/lib/auth/token-manager instead.'
  );
}

/**
 * @deprecated Use refreshTokenPair() from token-manager.ts instead
 * @internal Legacy function - will be removed in future version
 */
export async function refreshJWT(): Promise<null> {
  log.error('DEPRECATED: refreshJWT() called - use token-manager.ts instead', new Error('deprecated'), {
    operation: 'refreshJWT',
    deprecated: true,
    migration: 'Use refreshTokenPair() from @/lib/auth/token-manager',
  });
  throw new Error(
    'refreshJWT() is deprecated. Use refreshTokenPair() from @/lib/auth/token-manager instead.'
  );
}

/**
 * Extract Bearer token from Authorization header
 * This function is still valid and used by middleware
 */
export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Return empty string for malformed Bearer tokens (just "Bearer " with no token)
    return token || '';
  }
  return null;
}
