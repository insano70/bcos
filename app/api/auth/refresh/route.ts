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
  try {
    // CSRF PROTECTION: Verify CSRF token before authentication check
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    if (!isValidCSRF) {
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    // REQUIRE AUTHENTICATION: Only authenticated users can refresh tokens
    const session = await requireAuth(request)

    // Apply aggressive rate limiting for token refresh
    await applyRateLimit(request, 'auth')

    // Get refresh token from httpOnly cookie
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value

    if (!refreshToken) {
      return createErrorResponse('Refresh token not found', 401, request)
    }

    // VALIDATE TOKEN OWNERSHIP: Ensure refresh token belongs to authenticated user
    // This prevents token theft and cross-user attacks
    try {
      const { jwtVerify } = await import('jose')
      const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret')
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      const tokenUserId = payload.sub as string

      if (tokenUserId !== session.user.id) {
        return createErrorResponse('Unauthorized: Token does not belong to authenticated user', 403, request)
      }
    } catch (tokenError) {
      return createErrorResponse('Invalid session token', 401, request)
    }

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
        userId: session.user.id,
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
      userId: session.user.id,
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

    // Log the error for security monitoring
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Try to get user info from the request (may not be available if auth failed)
    try {
      const session = await requireAuth(request)
      await AuditLogger.logUserAction({
        action: 'token_refresh_error',
        userId: session.user.id,
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
