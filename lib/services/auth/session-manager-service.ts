/**
 * Session Manager Service - Authentication Helper
 *
 * Provides centralized session lifecycle management for authentication flows.
 * Wraps lib/auth/tokens and adds session-specific operations with transaction safety.
 *
 * SECURITY FEATURES:
 * - Atomic session creation (transaction-safe)
 * - Token rotation with replay detection
 * - Session listing with current session detection
 * - Bulk session revocation for security events
 *
 * REPLACES DIRECT SQL IN:
 * - /api/auth/sessions (lines 50, 140)
 * - Multiple routes that call createTokenPair() inline
 *
 * USAGE:
 * ```typescript
 * import { createAuthSession, listUserSessions, revokeSession } from '@/lib/services/auth/session-manager-service';
 *
 * // Create session (replaces createTokenPair + inline logic)
 * const session = await createAuthSession(userId, deviceInfo, false, 'user@example.com');
 *
 * // List user sessions
 * const sessions = await listUserSessions(userId, currentSessionId);
 *
 * // Revoke single session
 * await revokeSession(userId, sessionId, refreshToken);
 * ```
 */

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { DeviceInfo, TokenPair } from '@/lib/auth/tokens';
import {
  createTokenPair,
  revokeAllUserTokens,
  revokeRefreshToken,
} from '@/lib/auth/tokens';
import { db, refresh_tokens, user_sessions } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Session info for listing user sessions
 */
export interface SessionInfo {
  sessionId: string;
  deviceName: string | null;
  ipAddress: string;
  userAgent: string | null;
  rememberMe: boolean;
  lastActivity: Date;
  createdAt: Date;
  isCurrent: boolean;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  userId: string;
  deviceInfo: DeviceInfo;
  rememberMe?: boolean;
  email?: string;
  authMethod?: string;
}

/**
 * Session revocation result
 */
export interface RevokeSessionResult {
  success: boolean;
  sessionId: string;
  tokensRevoked: number;
}

// ============================================================================
// Core Session Management Functions
// ============================================================================

/**
 * Create authentication session
 *
 * TRANSACTION SAFETY:
 * - Token creation and session creation are handled atomically by createTokenPair()
 * - Audit logging happens after transaction commits
 *
 * REPLACES:
 * - All inline calls to createTokenPair()
 * - Session creation logic in login, MFA, SSO routes
 *
 * @param options - Session creation options
 * @returns Token pair with session information
 */
export async function createAuthSession(
  options: CreateSessionOptions
): Promise<TokenPair> {
  const startTime = Date.now();
  const { userId, deviceInfo, rememberMe = false, email, authMethod } = options;

  log.debug('creating authentication session', {
    operation: 'create_auth_session',
    userId,
    authMethod,
    rememberMe,
    deviceName: deviceInfo.deviceName,
    deviceFingerprint: deviceInfo.fingerprint.substring(0, 8),
    component: 'auth',
  });

  // Create token pair (handles transaction internally)
  const tokenPair = await createTokenPair(userId, deviceInfo, rememberMe, email, authMethod);

  const duration = Date.now() - startTime;

  log.info('authentication session created successfully', {
    operation: 'create_auth_session',
    userId,
    sessionId: tokenPair.sessionId,
    authMethod,
    rememberMe,
    deviceName: deviceInfo.deviceName,
    deviceFingerprint: deviceInfo.fingerprint.substring(0, 8),
    expiresAt: tokenPair.expiresAt.toISOString(),
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return tokenPair;
}

/**
 * List all active sessions for a user
 *
 * REPLACES:
 * - /api/auth/sessions GET handler (lines 50-70)
 *
 * @param userId - User UUID
 * @param currentSessionId - Current session ID (optional, for marking current session)
 * @returns Array of session information
 */
export async function listUserSessions(
  userId: string,
  currentSessionId?: string
): Promise<SessionInfo[]> {
  const startTime = Date.now();

  log.debug('listing user sessions', {
    operation: 'list_user_sessions',
    userId,
    currentSessionId: currentSessionId?.substring(0, 8),
    component: 'auth',
  });

  const dbStartTime = Date.now();

  // Get all active sessions for user
  // LEFT JOIN with refresh_tokens to handle orphaned sessions
  // Filter: session is active AND (refresh token is active OR no refresh token linked)
  const sessions = await db
    .select({
      sessionId: user_sessions.session_id,
      deviceName: user_sessions.device_name,
      ipAddress: user_sessions.ip_address,
      userAgent: user_sessions.user_agent,
      rememberMe: user_sessions.remember_me,
      lastActivity: user_sessions.last_activity,
      createdAt: user_sessions.created_at,
      isCurrent: sql<boolean>`case when ${user_sessions.session_id} = ${currentSessionId || null} then true else false end`,
    })
    .from(user_sessions)
    .leftJoin(refresh_tokens, eq(user_sessions.refresh_token_id, refresh_tokens.token_id))
    .where(
      and(
        eq(user_sessions.user_id, userId),
        eq(user_sessions.is_active, true),
        or(
          eq(refresh_tokens.is_active, true),
          isNull(refresh_tokens.token_id) // Handle LEFT JOIN nulls
        )
      )
    )
    .orderBy(desc(user_sessions.last_activity));

  const dbDuration = Date.now() - dbStartTime;
  const totalDuration = Date.now() - startTime;

  const currentSessionCount = sessions.filter((s) => s.isCurrent).length;
  const rememberMeCount = sessions.filter((s) => s.rememberMe).length;

  log.info(`user sessions list completed - returned ${sessions.length} active sessions`, {
    operation: 'list_user_sessions',
    userId,
    results: {
      returned: sessions.length,
      currentSession: currentSessionCount,
      rememberMeSessions: rememberMeCount,
    },
    ...(currentSessionId && { currentSessionId: currentSessionId.substring(0, 8) }),
    query: {
      duration: dbDuration,
      slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY,
    },
    duration: totalDuration,
    slow: totalDuration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return sessions;
}

/**
 * Revoke a single session
 *
 * REPLACES:
 * - /api/auth/sessions DELETE handler (lines 140-175)
 *
 * TRANSACTION SAFETY:
 * - Session lookup and token revocation happen in correct order
 * - revokeRefreshToken() handles its own transaction
 *
 * @param userId - User UUID (for authorization check)
 * @param sessionId - Session ID to revoke
 * @param refreshToken - Refresh token value (for revocation)
 * @returns Revocation result
 * @throws Error if session not found or doesn't belong to user
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
  refreshToken: string
): Promise<RevokeSessionResult> {
  const startTime = Date.now();

  log.debug('revoking user session', {
    operation: 'revoke_user_session',
    userId,
    sessionId: sessionId.substring(0, 8),
    component: 'auth',
  });

  // Get the session to revoke
  const dbStartTime = Date.now();
  const [sessionToRevoke] = await db
    .select({
      sessionId: user_sessions.session_id,
      refreshTokenId: user_sessions.refresh_token_id,
    })
    .from(user_sessions)
    .where(
      and(
        eq(user_sessions.session_id, sessionId),
        eq(user_sessions.user_id, userId), // Ensure user owns the session
        eq(user_sessions.is_active, true)
      )
    )
    .limit(1);

  const dbDuration = Date.now() - dbStartTime;

  if (!sessionToRevoke) {
    const duration = Date.now() - startTime;

    log.warn('session revocation failed - session not found or already revoked', {
      operation: 'revoke_user_session',
      userId,
      targetSessionId: sessionId.substring(0, 8),
      duration,
      component: 'auth',
    });

    throw new Error('Session not found or already revoked');
  }

  // Revoke the refresh token (this will also end the session)
  const revoked = await revokeRefreshToken(refreshToken, 'security');

  if (!revoked) {
    throw new Error('Failed to revoke session');
  }

  // Log security action
  log.security('session_revoked', 'medium', {
    userId,
    revokedSessionId: sessionId.substring(0, 8),
    reason: 'user_requested',
  });

  const duration = Date.now() - startTime;

  log.info('session revoked successfully - refresh token and session terminated', {
    operation: 'revoke_user_session',
    userId,
    revokedSessionId: sessionId.substring(0, 8),
    tokenRevoked: revoked,
    query: {
      duration: dbDuration,
      slow: dbDuration > SLOW_THRESHOLDS.DB_QUERY,
    },
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return {
    success: true,
    sessionId,
    tokensRevoked: 1,
  };
}

/**
 * Revoke all sessions for a user (emergency logout)
 *
 * REPLACES:
 * - /api/auth/logout DELETE handler (revoke all sessions)
 *
 * @param userId - User UUID
 * @param reason - Revocation reason
 * @returns Revocation result
 */
export async function revokeAllSessions(
  userId: string,
  reason: 'security' | 'admin_action' | 'user_disabled' = 'security'
): Promise<RevokeSessionResult> {
  const startTime = Date.now();

  log.security('revoke_all_sessions_requested', 'medium', {
    action: 'emergency_logout',
    userId,
    threat: 'potential_compromise',
  });

  // Revoke all user tokens (handles session termination internally)
  const revokedCount = await revokeAllUserTokens(userId, reason);

  const duration = Date.now() - startTime;

  log.info('revoke all sessions successful - all devices logged out', {
    operation: 'revoke_all_sessions',
    success: true,
    userId,
    tokensRevoked: revokedCount,
    allDevices: true,
    securityContext: {
      reason,
      severity: 'medium',
      threat: 'potential_compromise',
      action: 'emergency_logout',
    },
    duration,
    slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
    component: 'auth',
  });

  return {
    success: true,
    sessionId: 'all',
    tokensRevoked: revokedCount,
  };
}

/**
 * Get current session from refresh token
 *
 * SECURITY:
 * - Validates token ownership
 * - Checks session is active
 *
 * @param refreshToken - Refresh token value
 * @param userId - User UUID (for validation)
 * @returns Session ID if valid, null otherwise
 */
export async function getCurrentSessionId(
  refreshToken: string,
  userId: string
): Promise<string | null> {
  const startTime = Date.now();

  const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
  const payload = await verifyRefreshToken(refreshToken);

  if (!payload) {
    log.warn('invalid refresh token for session lookup', {
      operation: 'get_current_session_id',
      userId,
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return null;
  }

  // Validate token ownership
  if (payload.userId !== userId) {
    log.warn('refresh token user mismatch', {
      operation: 'get_current_session_id',
      userId,
      tokenUserId: payload.userId,
      duration: Date.now() - startTime,
      component: 'auth',
    });
    return null;
  }

  const duration = Date.now() - startTime;

  log.debug('current session id retrieved', {
    operation: 'get_current_session_id',
    userId,
    sessionId: payload.sessionId?.substring(0, 8),
    duration,
    component: 'auth',
  });

  return payload.sessionId || null;
}
