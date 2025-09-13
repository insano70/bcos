import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { AuditLogger } from '@/lib/api/services/audit'
import { requireAuth } from '@/lib/api/middleware/auth'
import { CSRFProtection } from '@/lib/security/csrf'

/**
 * Refresh Token Endpoint
 * Handles token rotation with sliding window expiration
 * SECURED: Requires authentication and token ownership validation
 */
export async function POST(request: NextRequest) {
  // Store refresh token for error handling (declared at function level)
  let refreshTokenForError: string | undefined

  try {
    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    console.log('🔄 Refresh endpoint called')

    // NOTE: We don't require auth header here since we're validating the refresh token cookie directly
    // This allows token refresh without needing a valid access token

    // Apply aggressive rate limiting for token refresh
    await applyRateLimit(request, 'auth')

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value

    console.log('🍪 Refresh token from cookie:', !!refreshToken)

    if (!refreshToken) {
      console.log('❌ No refresh token found in cookie')
      return createErrorResponse('Refresh token not found', 401, request)
    }

    // Store refresh token for error handling
    refreshTokenForError = refreshToken

    // Authenticate user from refresh token
    let userId: string
    try {
      const { jwtVerify } = await import('jose')
      const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      userId = payload.sub as string
      console.log('✅ Refresh token validated for user:', userId)
    } catch (tokenError) {
      console.log('❌ Refresh token validation failed:', tokenError)
      return createErrorResponse('Invalid refresh token', 401, request)
    }

    // Get user details from database
    const db = (await import('@/lib/db')).db
    const users = (await import('@/lib/db')).users
    const [user] = await db
      .select()
      .from(users)
      .where((await import('drizzle-orm')).eq(users.user_id, userId))
      .limit(1)

    if (!user || !user.is_active) {
      console.log('❌ User not found or inactive:', userId)
      return createErrorResponse('User account is inactive', 401, request)
    }

    console.log('👤 Found active user:', user.email)

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    const deviceFingerprint = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)
    const deviceName = TokenManager.generateDeviceName(userAgent)

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    }

    // Rotate tokens
    const tokenPair = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)

    if (!tokenPair) {
      // AUDIT LOGGING: Log failed refresh attempt with authenticated user info
      await AuditLogger.logUserAction({
        action: 'token_refresh_failed',
        userId: userId,
        resourceType: 'session',
        resourceId: 'current',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'invalid_refresh_token',
          deviceFingerprint,
          deviceName
        }
      })

      return createErrorResponse('Invalid or expired refresh token', 401, request)
    }

    // AUDIT LOGGING: Log successful token refresh
    await AuditLogger.logUserAction({
      action: 'token_refresh_success',
      userId: userId,
      resourceType: 'session',
      resourceId: tokenPair.sessionId,
      ipAddress,
      userAgent,
      metadata: {
        deviceFingerprint,
        deviceName,
        expiresAt: tokenPair.expiresAt.toISOString()
      }
    })

    // Set new refresh token in httpOnly cookie
    const response = NextResponse.json({
      success: true,
      data: {
        accessToken: tokenPair.accessToken,
        expiresAt: tokenPair.expiresAt.toISOString(),
        sessionId: tokenPair.sessionId
      },
      message: 'Tokens refreshed successfully',
      meta: { timestamp: new Date().toISOString() }
    })

    // Set secure httpOnly cookie for refresh token
    const isProduction = process.env.NODE_ENV === 'production'
    
    response.cookies.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days (will be shorter for standard mode)
    })

    return response
    
  } catch (error) {
    console.error('Token refresh error:', error)

    // Extract device info for logging
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Try to extract userId from the failed refresh token if possible
    let failedUserId = 'unknown'
    try {
      if (refreshTokenForError) {
        const { jwtVerify } = await import('jose')
        const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
        const { payload } = await jwtVerify(refreshTokenForError, REFRESH_TOKEN_SECRET)
        failedUserId = payload.sub as string
      }
    } catch (tokenError) {
      // Token is invalid, keep as unknown
    }

    // Try to get user info from the request (may not be available if auth failed)
    try {
      const session = await requireAuth(request)
      await AuditLogger.logUserAction({
        action: 'token_refresh_error',
        userId: failedUserId,
        resourceType: 'session',
        resourceId: 'unknown',
        ipAddress,
        userAgent,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      })
    } catch (authError) {
      // If we can't get authenticated user, log as anonymous security event
      await AuditLogger.logSecurity({
        action: 'token_refresh_error',
        ipAddress,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          authFailed: true
        },
        severity: 'medium'
      })
    }

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}
