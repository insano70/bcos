/**
 * Token Blacklist Manager (Internal)
 *
 * Handles token blacklist operations with cache-aside pattern.
 * This is an internal helper module, not part of the public API.
 *
 * ARCHITECTURE:
 * - Cache-first reads (Redis) with database fallback
 * - Write-through pattern (both cache and DB updated)
 * - TTL-based cleanup (blacklist entries auto-expire)
 *
 * SECURITY:
 * - Immediate cache invalidation prevents token reuse
 * - Dual-write ensures consistency
 * - Blacklist entries persist beyond token expiration (audit trail)
 *
 * @module lib/auth/tokens/internal/blacklist-manager
 * @internal
 */

import { authCache } from '@/lib/cache';

/**
 * Add token to blacklist
 *
 * Writes to both cache and database for immediate effect.
 * Used during token revocation and rotation.
 *
 * CONSISTENCY:
 * - Cache write happens first (fail-fast)
 * - Database write provides persistence
 * - If cache fails, token is still blacklisted in DB
 *
 * @param jti - JWT token ID
 * @param userId - User who owns the token
 * @param tokenType - 'access' or 'refresh'
 * @param expiresAt - When to clean up this blacklist entry
 * @param reason - Revocation reason (for audit)
 * @param blacklistedBy - Admin user ID (optional)
 * @param ipAddress - Client IP (optional, for audit)
 * @param userAgent - Client User-Agent (optional, for audit)
 *
 * @example
 * await addToBlacklist(
 *   'token123',
 *   'user-id',
 *   'refresh',
 *   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
 *   'rotation'
 * );
 */
export async function addToBlacklist(
  jti: string,
  userId: string,
  tokenType: 'access' | 'refresh',
  expiresAt: Date,
  reason: string,
  blacklistedBy?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  // Use authCache which handles both cache and database writes
  await authCache.addTokenToBlacklist(
    jti,
    userId,
    tokenType,
    expiresAt,
    reason,
    blacklistedBy,
    ipAddress,
    userAgent
  );
}

/**
 * Check if token is blacklisted
 *
 * Cache-first lookup with database fallback.
 * Used during token validation.
 *
 * PERFORMANCE:
 * - Cache hit: ~1ms (Redis)
 * - Cache miss: ~10ms (Postgres query + cache write)
 * - Cache stores both positive and negative results
 *
 * @param jti - JWT token ID to check
 * @returns true if blacklisted, false otherwise
 *
 * @example
 * const isBlacklisted = await isTokenBlacklisted('token123');
 * if (isBlacklisted) {
 *   throw new Error('Token has been revoked');
 * }
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  // Use authCache which handles cache-aside pattern
  return await authCache.isTokenBlacklisted(jti);
}
