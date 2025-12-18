/**
 * Session Manager (Internal)
 *
 * Manages session lifecycle and concurrent session limits.
 * This is an internal helper module, not part of the public API.
 *
 * SECURITY FEATURES:
 * - Concurrent session limit enforcement (default: 3 sessions)
 * - Automatic revocation of oldest session when limit exceeded
 * - Session tracking for device management UI
 *
 * ARCHITECTURE:
 * - Session records linked to refresh tokens
 * - Session activity tracked for timeout detection
 * - End reason recorded for audit trail
 *
 * @module lib/auth/tokens/internal/session-manager
 * @internal
 */

import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { account_security, db, type DbContext, refresh_tokens, user_sessions } from '@/lib/db';
import { log } from '@/lib/logger';
import type { DeviceInfo } from '../types';

/**
 * Session creation data
 */
interface SessionData {
  sessionId: string;
  userId: string;
  refreshTokenId: string;
  deviceInfo: DeviceInfo;
  rememberMe: boolean;
}

/**
 * Enforce concurrent session limit
 *
 * Checks user's session limit and revokes oldest session if at limit.
 * Called before creating new session.
 *
 * SECURITY:
 * - Prevents session accumulation attacks
 * - Default limit: 3 concurrent sessions
 * - Oldest session revoked first (by last_activity)
 *
 * @param userId - User ID
 * @returns Number of sessions revoked (0 or 1)
 *
 * @example
 * const revoked = await enforceSessionLimit('user-123');
 * // Returns: 0 (under limit) or 1 (revoked oldest)
 */
export async function enforceSessionLimit(userId: string): Promise<number> {
  // Get user's session limit
  const [securitySettings] = await db
    .select({ max_concurrent_sessions: account_security.max_concurrent_sessions })
    .from(account_security)
    .where(eq(account_security.user_id, userId))
    .limit(1);

  const maxSessions = securitySettings?.max_concurrent_sessions || 3;

  // Count active sessions
  const activeSessions = await db
    .select()
    .from(user_sessions)
    .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

  // If at limit, revoke oldest session
  if (activeSessions.length >= maxSessions) {
    // Sort by last_activity to find oldest session
    const oldestSession = activeSessions.sort(
      (a, b) => a.last_activity.getTime() - b.last_activity.getTime()
    )[0];

    if (oldestSession) {
      const now = new Date();

      // Revoke the oldest session's refresh token (if it has one)
      if (oldestSession.refresh_token_id) {
        await db
          .update(refresh_tokens)
          .set({
            is_active: false,
            revoked_at: now,
            revoked_reason: 'session_limit_exceeded',
          })
          .where(eq(refresh_tokens.token_id, oldestSession.refresh_token_id));
      }

      // End the oldest session
      await db
        .update(user_sessions)
        .set({
          is_active: false,
          ended_at: now,
          end_reason: 'session_limit_exceeded',
        })
        .where(eq(user_sessions.session_id, oldestSession.session_id));

      log.info('revoked oldest session due to concurrent session limit', {
        operation: 'enforce_session_limit',
        userId,
        maxSessions,
        revokedSession: oldestSession.session_id,
        revokedDevice: oldestSession.device_name,
        component: 'auth',
      });

      return 1;
    }
  }

  return 0;
}

/**
 * Create session record
 *
 * Inserts new session into database.
 * Links session to refresh token for lifecycle management.
 *
 * @param data - Session creation data
 * @param ctx - Optional database context (transaction or db instance)
 *
 * @example
 * // Without transaction
 * await createSessionRecord({ sessionId: 'session-abc', ... });
 *
 * // With transaction
 * await db.transaction(async (tx) => {
 *   await createSessionRecord({ sessionId: 'session-abc', ... }, tx);
 * });
 */
export async function createSessionRecord(data: SessionData, ctx: DbContext = db): Promise<void> {
  await ctx.insert(user_sessions).values({
    session_id: data.sessionId,
    user_id: data.userId,
    refresh_token_id: data.refreshTokenId,
    device_fingerprint: data.deviceInfo.fingerprint,
    device_name: data.deviceInfo.deviceName,
    ip_address: data.deviceInfo.ipAddress,
    user_agent: data.deviceInfo.userAgent,
    remember_me: data.rememberMe,
  });
}

/**
 * End session
 *
 * Marks session as inactive with end reason.
 * Used during logout and token revocation.
 *
 * @param sessionId - Session ID to end
 * @param reason - End reason ('logout', 'security', etc.)
 *
 * @example
 * await endSession('session-abc', 'logout');
 */
export async function endSession(
  sessionId: string,
  reason: 'logout' | 'security' | 'admin_action' | 'session_limit_exceeded'
): Promise<void> {
  const now = new Date();

  await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: now,
      end_reason: reason,
    })
    .where(eq(user_sessions.session_id, sessionId));
}

/**
 * End all user sessions
 *
 * Bulk session termination for security events.
 * Used when revoking all user tokens.
 *
 * @param userId - User ID
 * @param reason - End reason
 * @returns Number of sessions ended
 *
 * @example
 * const count = await endAllUserSessions('user-123', 'security');
 */
export async function endAllUserSessions(
  userId: string,
  reason: 'security' | 'admin_action' | 'user_disabled'
): Promise<number> {
  const now = new Date();

  const result = await db
    .update(user_sessions)
    .set({
      is_active: false,
      ended_at: now,
      end_reason: reason,
    })
    .where(and(eq(user_sessions.user_id, userId), eq(user_sessions.is_active, true)));

  return result.length || 0;
}

/**
 * Update session activity
 *
 * Updates last_activity timestamp during token refresh.
 * Used for session timeout detection.
 *
 * @param sessionId - Session ID
 * @param refreshTokenId - New refresh token ID after rotation
 *
 * @example
 * await updateSessionActivity('session-abc', 'new-token-xyz');
 */
export async function updateSessionActivity(
  sessionId: string,
  refreshTokenId: string
): Promise<void> {
  await db
    .update(user_sessions)
    .set({
      refresh_token_id: refreshTokenId,
      last_activity: new Date(),
    })
    .where(eq(user_sessions.session_id, sessionId));
}

/**
 * Generate session ID
 *
 * Creates unique session identifier using nanoid.
 *
 * @returns 32-character session ID
 *
 * @example
 * const sessionId = generateSessionId();
 * // Returns: "abc123..." (32 chars)
 */
export function generateSessionId(): string {
  return nanoid(32);
}
