/**
 * Token Validation Module
 *
 * JWT verification and blacklist checking for access tokens.
 * Pure validation logic with minimal dependencies.
 *
 * SECURITY:
 * - Verifies JWT signature using HS256
 * - Checks token expiration
 * - Validates against blacklist (cache-first)
 * - Fail-closed: returns null on any validation error
 *
 * PERFORMANCE:
 * - Cache-first blacklist lookup (~1ms)
 * - JWT verification (~2-5ms)
 * - Total validation time: ~5-10ms
 *
 * USAGE:
 * ```typescript
 * import { validateAccessToken } from '@/lib/auth/tokens/validation';
 *
 * const payload = await validateAccessToken(accessToken);
 * if (!payload) {
 *   throw new Error('Invalid or expired token');
 * }
 * ```
 *
 * @module lib/auth/tokens/validation
 */

import { type JWTPayload, jwtVerify } from 'jose';
import { ACCESS_TOKEN_SECRET } from '@/lib/auth/jwt-secrets';
import { isTokenBlacklisted } from './internal/blacklist-manager';

/**
 * Validate access token
 *
 * Performs comprehensive JWT validation:
 * 1. Verifies signature (HS256)
 * 2. Checks expiration (exp claim)
 * 3. Validates against blacklist
 *
 * FAIL-CLOSED:
 * - Any validation failure returns null
 * - Caller must check for null and handle appropriately
 * - No exceptions thrown (clean error handling)
 *
 * BLACKLIST CHECK:
 * - Cache-first lookup (Redis)
 * - Database fallback if cache miss
 * - Negative cache (non-blacklisted tokens cached too)
 *
 * @param accessToken - JWT access token to validate
 * @returns JWT payload if valid, null otherwise
 *
 * @example
 * const payload = await validateAccessToken(token);
 * if (!payload) {
 *   return res.status(401).json({ error: 'Invalid token' });
 * }
 *
 * const userId = payload.sub as string;
 * const sessionId = payload.session_id as string;
 */
export async function validateAccessToken(accessToken: string): Promise<JWTPayload | null> {
  try {
    // Verify JWT signature and expiration
    const { payload } = await jwtVerify(accessToken, ACCESS_TOKEN_SECRET);

    // Check if token is blacklisted (uses cache-aside pattern)
    const jti = payload.jti as string;
    const blacklisted = await isTokenBlacklisted(jti);

    if (blacklisted) {
      return null;
    }

    return payload;
  } catch (_error) {
    // JWT verification failed (invalid signature, expired, malformed, etc.)
    // Fail closed - return null
    return null;
  }
}
