import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { AuditLogger } from '@/lib/api/services/audit'
import { requireAuth } from '@/lib/api/middleware/auth'
import { CSRFProtection } from '@/lib/security/csrf'
import { debugLog, errorLog } from '@/lib/utils/debug'

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

    debugLog.session('Refresh endpoint called')

    // NOTE: We don't require auth header here since we're validating the refresh token cookie directly
    // This allows token refresh without needing a valid access token

    // Apply aggressive rate limiting for token refresh
    await applyRateLimit(request, 'auth')

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value

    debugLog.session('Refresh token from cookie:', !!refreshToken)

    if (!refreshToken) {
      debugLog.session('No refresh token found in cookie')
      return createErrorResponse('Refresh token not found', 401, request)
    }

    // Store refresh token for error handling
    refreshTokenForError = refreshToken

    // Authenticate user from refresh token
    let userId: string
    try {
      const { jwtVerify } = await import('jose')
      const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      userId = payload.sub as string
      debugLog.session('Refresh token validated for user:', userId)
    } catch (tokenError) {
      errorLog('Refresh token validation failed:', tokenError)
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
      errorLog('User not found or inactive:', userId)
      return createErrorResponse('User account is inactive', 401, request)
    }

    debugLog.session('Found active user:', user.email)

    // Get user's RBAC context for complete user data
    const { getUserContextSafe } = await import('@/lib/rbac/user-context')
    const userContext = await getUserContextSafe(user.user_id)

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

    // Get the user's actual assigned roles
    const userRoles = userContext?.roles?.map(r => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    // Set new refresh token in httpOnly cookie and return user data
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          firstName: user.first_name,
          lastName: user.last_name,
          role: primaryRole,
          emailVerified: user.email_verified,
          roles: userRoles,
          permissions: userContext?.all_permissions?.map(p => p.name) || []
        },
        accessToken: tokenPair.accessToken,
        expiresAt: tokenPair.expiresAt.toISOString(),
        sessionId: tokenPair.sessionId
      },
      message: 'Tokens refreshed successfully',
      meta: { timestamp: new Date().toISOString() }
    })

    // Set secure cookies for both tokens
    const isProduction = process.env.NODE_ENV === 'production'

    // ✅ SECURITY: Debug logging only in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🍪 REFRESH: Setting cookies for token refresh:', {
        refreshToken: {
          name: 'refresh-token',
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
          valueLength: tokenPair.refreshToken.length
        },
        accessToken: {
          name: 'access-token',
          httpOnly: true, // Server-only access
          secure: isProduction,
          sameSite: 'strict',
          path: '/',
          maxAge: 15 * 60,
          valueLength: tokenPair.accessToken.length
        }
      });
    }

    // Set HTTP-only refresh token cookie (server-only)
    response.cookies.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days (will be shorter for standard mode)
    })

    // Set secure access token cookie (server-only, secure)
    response.cookies.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    })

    debugLog.session('Cookies set successfully')
    return response
    
  } catch (error) {
    errorLog('Token refresh error:', error)

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
        const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
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
