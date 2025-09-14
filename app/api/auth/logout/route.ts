import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { AuditLogger } from '@/lib/api/services/audit'
import { requireAuth } from '@/lib/api/middleware/auth'
import { CSRFProtection } from '@/lib/security/csrf'
import { db, token_blacklist } from '@/lib/db'
import { errorLog } from '@/lib/utils/debug'

/**
 * Custom Logout Endpoint
 * Complete token cleanup and session termination
 * SECURED: Requires authentication to prevent unauthorized logout
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    // REQUIRE AUTHENTICATION: Only authenticated users can logout
    const session = await requireAuth(request)

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request)
    }

    // VALIDATE TOKEN OWNERSHIP: Ensure refresh token belongs to authenticated user
    // This prevents one user from logging out another user
    try {
      const { jwtVerify } = await import('jose')
      const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const tokenUserId = payload.sub as string

      if (tokenUserId !== session.user.id) {
        return createErrorResponse('Unauthorized: Token does not belong to authenticated user', 403, request)
      }
    } catch (tokenError) {
      return createErrorResponse('Invalid session token', 401, request)
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
    // Use authenticated user's ID for security
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7)
        const { jwtVerify } = await import('jose')
        const ACCESS_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
        const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET)
        const jti = payload.jti as string | undefined
        const tokenUserId = payload.sub as string | undefined

        // SECURITY: Ensure access token belongs to authenticated user
        if (jti && tokenUserId && tokenUserId === session.user.id) {
          await db.insert(token_blacklist).values({
            jti,
            user_id: session.user.id, // Use authenticated user's ID
            token_type: 'access',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
            reason: 'logout'
          })
        }
      } catch (e) {
        console.warn('Failed to blacklist access token on logout:', e)
      }
    }

    // AUDIT LOGGING: Log the logout action
    await AuditLogger.logUserAction({
      action: 'logout',
      userId: session.user.id,
      resourceType: 'session',
      resourceId: 'current',
      ipAddress,
      userAgent,
      metadata: {
        reason: 'user_initiated'
      }
    })

    // Clear refresh token cookie
    const response = NextResponse.json({
      success: true,
      data: { message: 'Logged out successfully' },
      message: 'Session ended successfully',
      meta: { timestamp: new Date().toISOString() }
    })

    // Clear authentication cookies
    const isProduction = process.env.NODE_ENV === 'production'

    // Clear refresh token cookie
    response.cookies.set('refresh-token', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 0, // Expire immediately
    })

    // Clear access token cookie
    response.cookies.set('access-token', '', {
      httpOnly: true, // ✅ SECURITY FIX: Consistent with secure token model
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 0, // Expire immediately
    })

    return response
    
  } catch (error) {
    errorLog('Logout error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

/**
 * Revoke All Sessions Endpoint
 * Emergency logout from all devices
 * SECURED: Requires authentication and token validation
 */
export async function DELETE(request: NextRequest) {
  try {
    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    // REQUIRE AUTHENTICATION: Critical security - only authenticated users can revoke all sessions
    const session = await requireAuth(request)

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value

    if (!refreshToken) {
      return createErrorResponse('No active session found', 400, request)
    }

    // VALIDATE TOKEN OWNERSHIP: Double-check that refresh token belongs to authenticated user
    const { jwtVerify } = await import('jose')
    const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)

    try {
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const tokenUserId = payload.sub as string

      if (tokenUserId !== session.user.id) {
        return createErrorResponse('Unauthorized: Token does not belong to authenticated user', 403, request)
      }

      const userId = tokenUserId

      // Revoke all user tokens
      const revokedCount = await TokenManager.revokeAllUserTokens(userId, 'security')

      // AUDIT LOGGING: Log the revoke all sessions action
      const ipAddress = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown'
      const userAgent = request.headers.get('user-agent') || 'unknown'

      await AuditLogger.logSecurity({
        action: 'revoke_all_sessions',
        userId: session.user.id, // Use authenticated user's ID
        ipAddress,
        userAgent,
        metadata: {
          revokedCount,
          reason: 'user_requested'
        },
        severity: 'medium'
      })

      // Clear refresh token cookie
      const response = NextResponse.json({
        success: true,
        data: { revokedSessions: revokedCount },
        message: `Successfully logged out from ${revokedCount} device(s)`,
        meta: { timestamp: new Date().toISOString() }
      })

      // Clear authentication cookies
      const isProduction = process.env.NODE_ENV === 'production'

      // Clear refresh token cookie
      response.cookies.set('refresh-token', '', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      })

      // Clear access token cookie
      response.cookies.set('access-token', '', {
        httpOnly: true, // ✅ SECURITY FIX: Consistent with secure token model
        secure: isProduction,
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      })

      return response

    } catch (tokenError) {
      return createErrorResponse('Invalid session', 401, request)
    }
    
  } catch (error) {
    errorLog('Revoke all sessions error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
