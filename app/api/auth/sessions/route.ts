import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db, user_sessions, refresh_tokens } from '@/lib/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { TokenManager } from '@/lib/auth/token-manager'
import { AuditLogger } from '@/lib/api/services/audit'
import { CSRFProtection } from '@/lib/security/csrf'

/**
 * Session Management Endpoint
 * Allows users to view and manage their active sessions
 */
export async function GET(request: NextRequest) {
  try {
    // Get current user from refresh token
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (!refreshToken) {
      return createErrorResponse('Authentication required', 401, request)
    }

    // Extract user ID from refresh token
    const { jwtVerify } = await import('jose')
    const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
    
    try {
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const userId = payload.sub as string
      const currentSessionId = payload.session_id as string

      // Get all active sessions for user
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
            eq(user_sessions.user_id, userId),
            eq(user_sessions.is_active, true),
            eq(refresh_tokens.is_active, true)
          )
        )
        .orderBy(desc(user_sessions.last_activity))

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

    } catch (tokenError) {
      return createErrorResponse('Invalid session', 401, request)
    }
    
  } catch (error) {
    console.error('Get sessions error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

/**
 * Revoke specific session
 */
export async function DELETE(request: NextRequest) {
  try {
    // CSRF PROTECTION: Verify CSRF token for session revocation
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    const { sessionId } = await request.json()

    if (!sessionId) {
      return createErrorResponse('Session ID required', 400, request)
    }

    // Get current user from refresh token
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (!refreshToken) {
      return createErrorResponse('Authentication required', 401, request)
    }

    // Extract user ID from refresh token
    const { jwtVerify } = await import('jose')
    const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
    
    try {
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const userId = payload.sub as string

      // Get the session to revoke
      const [sessionToRevoke] = await db
        .select({
          sessionId: user_sessions.session_id,
          refreshTokenId: user_sessions.refresh_token_id
        })
        .from(user_sessions)
        .where(
          and(
            eq(user_sessions.session_id, sessionId),
            eq(user_sessions.user_id, userId), // Ensure user owns the session
            eq(user_sessions.is_active, true)
          )
        )
        .limit(1)

      if (!sessionToRevoke) {
        return createErrorResponse('Session not found or already revoked', 404, request)
      }

      // Get the refresh token for this session
      if (sessionToRevoke.refreshTokenId) {
        const [refreshTokenRecord] = await db
          .select({ tokenId: refresh_tokens.token_id })
          .from(refresh_tokens)
          .where(eq(refresh_tokens.token_id, sessionToRevoke.refreshTokenId))
          .limit(1)

        if (refreshTokenRecord) {
          // Revoke the refresh token (this will also end the session)
          await TokenManager.revokeRefreshToken(refreshToken, 'security')
        }
      }

      // Log the action
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      
      await AuditLogger.logSecurity({
        action: 'session_revoked',
        userId,
        ipAddress,
        userAgent,
        metadata: {
          revokedSessionId: sessionId,
          reason: 'user_requested'
        },
        severity: 'medium'
      })

      return createSuccessResponse(
        { sessionId },
        'Session revoked successfully'
      )

    } catch (tokenError) {
      return createErrorResponse('Invalid session', 401, request)
    }
    
  } catch (error) {
    console.error('Revoke session error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
