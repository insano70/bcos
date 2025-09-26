import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db, user_sessions, refresh_tokens } from '@/lib/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse, ValidationError } from '@/lib/api/responses/error'
import { TokenManager } from '@/lib/auth/token-manager'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import { validateRequest } from '@/lib/api/middleware/validation'
import type { UserContext } from '@/lib/types/rbac'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
import { 
  createAPILogger, 
  logDBOperation,
  logPerformanceMetric,
  logSecurityEvent 
} from '@/lib/logger'
import { z } from 'zod'

/**
 * Session Management Endpoints
 * Allows users to view and manage their active sessions
 */

// Schema for session revocation request
const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required')
})

/**
 * GET - List all active sessions for the current user
 */
const getSessionsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  logger.info('Sessions list request initiated', {
    userId: userContext.user_id,
    endpoint: '/api/auth/sessions',
    method: 'GET'
  })

  try {
    // Get current session ID from refresh token to mark the current session
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    let currentSessionId: string | null = null
    
    if (refreshToken) {
      try {
        const { jwtVerify } = await import('jose')
        const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
        const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
        currentSessionId = payload.session_id as string
      } catch {
        // If we can't parse the token, continue without marking current session
        logger.debug('Could not extract session ID from refresh token')
      }
    }

    // Get all active sessions for user
    const dbStartTime = Date.now()
    const sessions = await db
      .select({
        sessionId: user_sessions.session_id,
        deviceName: user_sessions.device_name,
        ipAddress: user_sessions.ip_address,
        userAgent: user_sessions.user_agent,
        rememberMe: user_sessions.remember_me,
        lastActivity: user_sessions.last_activity,
        createdAt: user_sessions.created_at,
        isCurrent: sql<boolean>`case when ${user_sessions.session_id} = ${currentSessionId} then true else false end`
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
      .orderBy(desc(user_sessions.last_activity))
    
    logDBOperation(logger, 'SELECT', 'user_sessions', dbStartTime, sessions.length)

    const totalDuration = Date.now() - startTime
    logger.info('Sessions list retrieved successfully', {
      userId: userContext.user_id,
      sessionCount: sessions.length,
      currentSessionId,
      duration: totalDuration
    })

    logPerformanceMetric(logger, 'sessions_list_duration', totalDuration, {
      success: true,
      sessionCount: sessions.length
    })

    return createSuccessResponse({
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        deviceName: session.deviceName,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        rememberMe: session.rememberMe,
        lastActivity: session.lastActivity,
        createdAt: session.createdAt,
        isCurrent: session.isCurrent
      })),
      totalSessions: sessions.length,
      currentSessionId
    }, 'Sessions retrieved successfully')
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('Get sessions error', error, {
      userId: userContext.user_id,
      duration: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    logPerformanceMetric(logger, 'sessions_list_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

/**
 * DELETE - Revoke a specific session
 */
const revokeSessionHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  logger.info('Session revocation request initiated', {
    userId: userContext.user_id,
    endpoint: '/api/auth/sessions',
    method: 'DELETE'
  })

  try {
    // Validate request body
    const validationStartTime = Date.now()
    const validatedData = await validateRequest(request, revokeSessionSchema)
    const { sessionId } = validatedData
    logPerformanceMetric(logger, 'request_validation', Date.now() - validationStartTime)

    logger.debug('Session revocation request validated', {
      userId: userContext.user_id,
      targetSessionId: sessionId
    })

    // Get the session to revoke
    const dbStartTime = Date.now()
    const [sessionToRevoke] = await db
      .select({
        sessionId: user_sessions.session_id,
        refreshTokenId: user_sessions.refresh_token_id
      })
      .from(user_sessions)
      .where(
        and(
          eq(user_sessions.session_id, sessionId),
          eq(user_sessions.user_id, userContext.user_id), // Ensure user owns the session
          eq(user_sessions.is_active, true)
        )
      )
      .limit(1)
    
    logDBOperation(logger, 'SELECT', 'user_sessions', dbStartTime, sessionToRevoke ? 1 : 0)

    if (!sessionToRevoke) {
      logger.warn('Session not found or already revoked', {
        userId: userContext.user_id,
        targetSessionId: sessionId
      })
      return createErrorResponse('Session not found or already revoked', 404, request)
    }

    // Get the current refresh token to use for revocation
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (refreshToken && sessionToRevoke.refreshTokenId) {
      const revokeStartTime = Date.now()
      // Revoke the refresh token (this will also end the session)
      await TokenManager.revokeRefreshToken(refreshToken, 'security')
      logPerformanceMetric(logger, 'token_revocation', Date.now() - revokeStartTime)
    }

    // Log the security action
    logSecurityEvent(logger, 'session_revoked', 'medium', {
      userId: userContext.user_id,
      revokedSessionId: sessionId,
      reason: 'user_requested'
    })

    const totalDuration = Date.now() - startTime
    logger.info('Session revoked successfully', {
      userId: userContext.user_id,
      revokedSessionId: sessionId,
      duration: totalDuration
    })

    logPerformanceMetric(logger, 'session_revocation_duration', totalDuration, {
      success: true
    })

    return createSuccessResponse(
      { sessionId },
      'Session revoked successfully'
    )
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('Revoke session error', error, {
      userId: userContext.user_id,
      duration: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    logPerformanceMetric(logger, 'session_revocation_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export with RBAC protection
export const GET = rbacRoute(
  getSessionsHandler,
  {
    permission: 'users:read:own',
    rateLimit: 'api'
  }
)

export const DELETE = rbacRoute(
  revokeSessionHandler,
  {
    permission: 'users:read:own',
    rateLimit: 'api'
  }
)
