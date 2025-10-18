import { and, desc, eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { revokeRefreshToken } from '@/lib/auth/token-manager';
import { db, refresh_tokens, user_sessions } from '@/lib/db';
import type { UserContext } from '@/lib/types/rbac';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { log } from '@/lib/logger';

/**
 * Session Management Endpoints
 * Allows users to view and manage their active sessions
 */

// Schema for session revocation request
const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

/**
 * GET - List all active sessions for the current user
 */
const getSessionsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Get current session ID from refresh token to mark the current session
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;
    let currentSessionId: string | null = null;

    if (refreshToken) {
      const { verifyRefreshToken } = await import('@/lib/auth/token-verification');
      const payload = await verifyRefreshToken(refreshToken);
      if (payload) {
        currentSessionId = payload.sessionId;
      }
    }

    // Get all active sessions for user
    const dbStartTime = Date.now();
    const sessions = await db
      .select({
        sessionId: user_sessions.session_id,
        deviceName: user_sessions.device_name,
        ipAddress: user_sessions.ip_address,
        userAgent: user_sessions.user_agent,
        rememberMe: user_sessions.remember_me,
        lastActivity: user_sessions.last_activity,
        createdAt: user_sessions.created_at,
        isCurrent: sql<boolean>`case when ${user_sessions.session_id} = ${currentSessionId} then true else false end`,
      })
      .from(user_sessions)
      .leftJoin(refresh_tokens, eq(user_sessions.refresh_token_id, refresh_tokens.token_id))
      .where(
        and(
          eq(user_sessions.user_id, userContext.user_id),
          eq(user_sessions.is_active, true),
          eq(refresh_tokens.is_active, true)
        )
      )
      .orderBy(desc(user_sessions.last_activity));

    const duration = Date.now() - startTime;
    const dbDuration = Date.now() - dbStartTime;

    const currentSessionCount = sessions.filter((s) => s.isCurrent).length;
    const rememberMeCount = sessions.filter((s) => s.rememberMe).length;

    log.info(`user sessions list completed - returned ${sessions.length} active sessions`, {
      operation: 'list_user_sessions',
      userId: userContext.user_id,
      results: {
        returned: sessions.length,
        currentSession: currentSessionCount,
        rememberMeSessions: rememberMeCount,
      },
      ...(currentSessionId && { currentSessionId }),
      query: {
        duration: dbDuration,
        slow: dbDuration > 1000,
      },
      duration,
      slow: duration > 2000,
      component: 'auth',
    });

    return createSuccessResponse(
      {
        sessions: sessions.map((session) => ({
          sessionId: session.sessionId,
          deviceName: session.deviceName,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          rememberMe: session.rememberMe,
          lastActivity: session.lastActivity,
          createdAt: session.createdAt,
          isCurrent: session.isCurrent,
        })),
        totalSessions: sessions.length,
        currentSessionId,
      },
      'Sessions retrieved successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get sessions error', error, {
      operation: 'list_user_sessions',
      userId: userContext.user_id,
      duration: totalDuration,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

/**
 * DELETE - Revoke a specific session
 */
const revokeSessionHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Validate request body
    const validatedData = await validateRequest(request, revokeSessionSchema);
    const { sessionId } = validatedData;

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
          eq(user_sessions.user_id, userContext.user_id), // Ensure user owns the session
          eq(user_sessions.is_active, true)
        )
      )
      .limit(1);

    const dbDuration = Date.now() - dbStartTime;

    if (!sessionToRevoke) {
      log.warn('session revocation failed - session not found or already revoked', {
        operation: 'revoke_user_session',
        userId: userContext.user_id,
        targetSessionId: sessionId,
        duration: Date.now() - startTime,
        component: 'auth',
      });
      return createErrorResponse('Session not found or already revoked', 404, request);
    }

    // Get the current refresh token to use for revocation
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (refreshToken && sessionToRevoke.refreshTokenId) {
      // Revoke the refresh token (this will also end the session)
      await revokeRefreshToken(refreshToken, 'security');
    }

    // Log the security action
    log.security('session_revoked', 'medium', {
      userId: userContext.user_id,
      revokedSessionId: sessionId,
      reason: 'user_requested',
    });

    const duration = Date.now() - startTime;
    log.info('session revoked successfully - refresh token and session terminated', {
      operation: 'revoke_user_session',
      userId: userContext.user_id,
      revokedSessionId: sessionId,
      tokenRevoked: !!(refreshToken && sessionToRevoke.refreshTokenId),
      query: {
        duration: dbDuration,
        slow: dbDuration > 500,
      },
      duration,
      slow: duration > 1000,
      component: 'auth',
    });

    return createSuccessResponse({ sessionId }, 'Session revoked successfully');
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Revoke session error', error, {
      operation: 'revoke_user_session',
      userId: userContext.user_id,
      duration: totalDuration,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(getSessionsHandler, {
  permission: 'users:read:own',
  rateLimit: 'session_read',
});

export const DELETE = rbacRoute(revokeSessionHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
