import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Logout Endpoint
 * Revokes refresh token and adds to blacklist for instant invalidation
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
      path: '/api/auth',
      maxAge: 0, // Expire immediately
    })

    // Also clear any NextAuth cookies for compatibility
    response.cookies.set('next-auth.session-token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
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
        path: '/api/auth',
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
