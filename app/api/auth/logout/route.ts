import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Custom Logout Endpoint
 * Complete token cleanup and session termination
 */
export async function POST(request: NextRequest) {
  try {
    // Get refresh token from httpOnly cookie
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request)
    }

    // Extract device info for audit logging
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Revoke the refresh token
    const revoked = await TokenManager.revokeRefreshToken(refreshToken, 'logout')
    
    if (!revoked) {
      return createErrorResponse('Failed to logout', 500, request)
    }

    // Blacklist access token if provided (defense-in-depth)
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const { jwtVerify } = await import('jose')
        const ACCESS_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret')
        const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET)
        const jti = payload.jti as string | undefined
        const userId = payload.sub as string | undefined
        if (jti && userId) {
          // Insert into blacklist via TokenManager.cleanup-style util
          const { db, token_blacklist } = await import('@/lib/db') as any
          await db.insert(token_blacklist).values({
            jti,
            user_id: userId,
            token_type: 'access',
            // expire when access tokens would no longer be valid (15 min)
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
            reason: 'logout'
          })
        }
      } catch (e) {
        console.warn('Failed to blacklist access token on logout:', e)
      }
    }

    // Clear refresh token cookie
    const response = createSuccessResponse(
      { message: 'Logged out successfully' }, 
      'Session ended successfully'
    )

    // Clear the refresh token cookie
    response.cookies.set('refresh-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0, // Expire immediately
    })

    return response
    
  } catch (error) {
    console.error('Logout error:', error)
    return createErrorResponse(error, 500, request)
  }
}

/**
 * Revoke All Sessions Endpoint
 * Emergency logout from all devices
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get user from current session (would need proper auth middleware)
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request)
    }

    // Extract user ID from refresh token
    const { jwtVerify } = await import('jose')
    const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
    
    try {
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const userId = payload.sub as string

      // Revoke all user tokens
      const revokedCount = await TokenManager.revokeAllUserTokens(userId, 'security')

      // Log security action
      const ipAddress = request.headers.get('x-forwarded-for') || 'unknown'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      
      await AuditLogger.logSecurity({
        action: 'revoke_all_sessions',
        userId,
        ipAddress,
        userAgent,
        metadata: {
          revokedCount,
          reason: 'user_requested'
        },
        severity: 'medium'
      })

      // Clear refresh token cookie
      const response = createSuccessResponse(
        { revokedSessions: revokedCount },
        `Successfully logged out from ${revokedCount} device(s)`
      )

      response.cookies.set('refresh-token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      })

      return response

    } catch (tokenError) {
      return createErrorResponse('Invalid session', 401, request)
    }
    
  } catch (error) {
    console.error('Revoke all sessions error:', error)
    return createErrorResponse(error, 500, request)
  }
}
