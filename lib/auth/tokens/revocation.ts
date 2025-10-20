/**
 * Token Revocation Module
 *
 * Handles token and session revocation for logout and security events.
 * Supports single token revocation and bulk user token revocation.
 *
 * SECURITY FEATURES:
 * - Immediate token blacklisting (cache + database)
 * - Session termination with audit trail
 * - Bulk revocation for security incidents
 * - Middleware cache invalidation (legacy support)
 *
 * USAGE:
 * ```typescript
 * import { revokeRefreshToken, revokeAllUserTokens } from '@/lib/auth/tokens/revocation';
 *
 * // Single token (logout)
 * await revokeRefreshToken(refreshToken, 'logout');
 *
 * // All user tokens (security event)
 * const count = await revokeAllUserTokens(userId, 'security');
 * ```
 *
 * @module lib/auth/tokens/revocation
 */

import { and, eq } from 'drizzle-orm';
import { jwtVerify } from 'jose';
import { AuditLogger } from '@/lib/api/services/audit';
import { REFRESH_TOKEN_SECRET } from '@/lib/auth/jwt-secrets';
import { db, refresh_tokens } from '@/lib/db';
import { log } from '@/lib/logger';
import { addToBlacklist } from './internal/blacklist-manager';
import { endAllUserSessions, endSession } from './internal/session-manager';

/**
 * Revoke refresh token
 *
 * Revokes single refresh token and ends associated session.
 * Used for logout, admin actions, and security events.
 *
 * OPERATIONS:
 * 1. Verify and decode refresh token
 * 2. Mark token as inactive in database
 * 3. Add token to blacklist (cache + DB)
 * 4. End associated session
 * 5. Invalidate middleware cache (legacy)
 * 6. Audit log
 *
 * SECURITY:
 * - Immediate blacklist prevents token reuse
 * - Session ended with reason recorded
 * - Audit trail for compliance
 *
 * @param refreshToken - JWT refresh token to revoke
 * @param reason - Revocation reason
 * @returns true if successful, false otherwise
 *
 * @example
 * // User logout
 * const success = await revokeRefreshToken(token, 'logout');
 *
 * // Admin action
 * const success = await revokeRefreshToken(token, 'admin_action');
 *
 * // Security incident
 * const success = await revokeRefreshToken(token, 'security');
 */
export async function revokeRefreshToken(
  refreshToken: string,
  reason: 'logout' | 'security' | 'admin_action' = 'logout'
): Promise<boolean> {
  try {
    // Verify and decode refresh token
    const payload = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET);
    const refreshTokenId = payload.payload.jti as string;
    const userId = payload.payload.sub as string;
    const sessionId = payload.payload.session_id as string;

    const now = new Date();

    // Revoke refresh token in database
    await db
      .update(refresh_tokens)
      .set({
        is_active: false,
        revoked_at: now,
        revoked_reason: reason,
      })
      .where(eq(refresh_tokens.token_id, refreshTokenId));

    // Add to blacklist (cache + database)
    const blacklistExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await addToBlacklist(refreshTokenId, userId, 'refresh', blacklistExpiresAt, reason);

    // End session
    await endSession(sessionId, reason);

    // Invalidate token from middleware cache (legacy middleware support)
    try {
      const { invalidateTokenCache } = await import('@/middleware');
      invalidateTokenCache(refreshTokenId);
    } catch (_error) {
      // Cache invalidation failed - not critical, token still revoked in DB
    }

    // Audit log
    await AuditLogger.logAuth({
      action: 'logout',
      userId,
      metadata: {
        sessionId,
        refreshTokenId,
        reason,
      },
    });

    return true;
  } catch (error) {
    log.error('Token revocation error', error, {
      operation: 'revoke_refresh_token',
      userId: 'unknown', // userId may not be available if JWT verification fails
      component: 'auth',
    });
    return false;
  }
}

/**
 * Revoke all refresh tokens for a user
 *
 * Bulk revocation used for security events, account deactivation,
 * or administrative actions.
 *
 * OPERATIONS:
 * 1. Query all active tokens for user
 * 2. Mark all tokens as inactive
 * 3. Add all tokens to blacklist
 * 4. End all sessions
 * 5. Invalidate middleware cache (legacy)
 * 6. Audit log
 *
 * SECURITY:
 * - Immediate global revocation
 * - All sessions terminated
 * - High-severity audit log
 *
 * USE CASES:
 * - Password reset
 * - Account compromise detected
 * - User disabled by admin
 * - Token reuse detected (security incident)
 *
 * @param userId - User ID
 * @param reason - Revocation reason
 * @returns Number of tokens revoked
 *
 * @example
 * // Security incident (token reuse)
 * const count = await revokeAllUserTokens(userId, 'security');
 *
 * // Account disabled
 * const count = await revokeAllUserTokens(userId, 'user_disabled');
 *
 * // Admin action
 * const count = await revokeAllUserTokens(userId, 'admin_action');
 */
export async function revokeAllUserTokens(
  userId: string,
  reason: 'security' | 'admin_action' | 'user_disabled' = 'security'
): Promise<number> {
  const now = new Date();

  // Get all active refresh tokens for user
  const activeTokens = await db
    .select({ tokenId: refresh_tokens.token_id })
    .from(refresh_tokens)
    .where(and(eq(refresh_tokens.user_id, userId), eq(refresh_tokens.is_active, true)));

  // Revoke all refresh tokens in database
  const _revokedResult = await db
    .update(refresh_tokens)
    .set({
      is_active: false,
      revoked_at: now,
      revoked_reason: reason,
    })
    .where(and(eq(refresh_tokens.user_id, userId), eq(refresh_tokens.is_active, true)));

  // Add all tokens to blacklist (cache + database)
  const blacklistExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  for (const token of activeTokens) {
    await addToBlacklist(token.tokenId, userId, 'refresh', blacklistExpiresAt, reason);
  }

  // Invalidate all tokens from middleware cache (legacy support)
  try {
    const { invalidateTokenCache } = await import('@/middleware');
    for (const token of activeTokens) {
      invalidateTokenCache(token.tokenId);
    }
  } catch (_error) {
    // Cache invalidation failed - not critical, tokens still revoked in DB
  }

  // End all sessions
  await endAllUserSessions(userId, reason);

  // Audit log (high severity)
  await AuditLogger.logSecurity({
    action: 'bulk_token_revocation',
    userId,
    metadata: {
      revokedCount: activeTokens.length,
      reason,
    },
    severity: 'high',
  });

  return activeTokens.length;
}
