import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import type { UserContext } from '@/lib/types/rbac';
import {
  getCurrentSessionId,
  listUserSessions,
  revokeSession,
} from '@/lib/services/auth/session-manager-service';

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
  try {
    // Get current session ID from refresh token to mark the current session
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;
    let currentSessionId: string | null = null;

    if (refreshToken) {
      currentSessionId = await getCurrentSessionId(refreshToken, userContext.user_id);
    }

    // Use session-manager-service to get all active sessions
    const sessions = await listUserSessions(userContext.user_id, currentSessionId || undefined);

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
    log.error('Get sessions error', error, {
      operation: 'list_user_sessions',
      userId: userContext.user_id,
      component: 'auth',
    });

    return handleRouteError(error, 'Failed to retrieve sessions', request);
  }
};

/**
 * DELETE - Revoke a specific session
 */
const revokeSessionHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    // Validate request body
    const validatedData = await validateRequest(request, revokeSessionSchema);
    const { sessionId } = validatedData;

    // Get the current refresh token to use for revocation
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh-token')?.value;

    if (!refreshToken) {
      return createErrorResponse('Refresh token not found', 401, request);
    }

    // Use session-manager-service to revoke the session
    const result = await revokeSession(userContext.user_id, sessionId, refreshToken);

    return createSuccessResponse(
      { sessionId: result.sessionId, tokensRevoked: result.tokensRevoked },
      'Session revoked successfully'
    );
  } catch (error) {
    log.error('Revoke session error', error, {
      operation: 'revoke_user_session',
      userId: userContext.user_id,
      component: 'auth',
    });

    return handleRouteError(error, 'Failed to revoke session', request);
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
