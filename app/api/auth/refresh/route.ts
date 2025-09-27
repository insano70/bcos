import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { AuditLogger, BufferedAuditLogger } from '@/lib/logger'
import { requireAuth } from '@/lib/api/middleware/auth'
import { UnifiedCSRFProtection } from '@/lib/security/csrf-unified'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

import { 
  logAPIAuth, 
  logPerformanceMetric,
  withCorrelation,
  CorrelationContextManager 
} from '@/lib/logger'
import { createAPILogger } from '@/lib/logger/api-features'

/**
 * Refresh Token Endpoint
 * Handles token rotation with sliding window expiration
 * SECURED: Requires authentication and token ownership validation
 */
const refreshHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const apiLogger = createAPILogger(request, 'auth-refresh')
  const logger = apiLogger.getLogger()
  
  // Store refresh token for error handling (declared at function level)
  let refreshTokenForError: string | undefined

  // Enhanced token refresh request logging
  apiLogger.logRequest({
    authType: 'session'
  })
  
  logger.info('Token refresh initiated', {
    endpoint: '/api/auth/refresh',
    method: 'POST'
  })

  try {
    // NOTE: We don't require auth header here since we're validating the refresh token cookie directly
    // This allows token refresh without needing a valid access token

    // Apply aggressive rate limiting for token refresh
    const rateLimitStart = Date.now()
    await applyRateLimit(request, 'auth')
    logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStart)

    // Get refresh token from httpOnly cookie
    const cookieStart = Date.now()
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    logPerformanceMetric(logger, 'cookie_retrieval', Date.now() - cookieStart)

    logger.debug('Refresh token cookie check', {
      hasRefreshToken: !!refreshToken,
      tokenLength: refreshToken?.length || 0
    })

    if (!refreshToken) {
      logger.warn('Token refresh failed - no refresh token in cookie')
      logAPIAuth(logger, 'token_refresh', false, undefined, 'no_refresh_token')
      return createErrorResponse('Refresh token not found', 401, request)
    }

    // Store refresh token for error handling
    refreshTokenForError = refreshToken

    // Authenticate user from refresh token
    let userId: string
    try {
      const tokenValidationStart = Date.now()
      const { jwtVerify } = await import('jose')
      const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!)
      const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
      userId = payload.sub as string
      logPerformanceMetric(logger, 'refresh_token_validation', Date.now() - tokenValidationStart)
      
      logger.debug('Refresh token validated successfully', {
        userId,
        tokenExpiry: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown'
      })
    } catch (tokenError) {
      // Enhanced security logging for token validation failure  
      apiLogger.logSecurity('token_validation_failure', 'high', {
        action: 'refresh_token_invalid',
        blocked: true,
        threat: 'credential_attack',
        reason: 'invalid_refresh_token'
      })
      
      logger.error('Refresh token validation failed', tokenError, {
        tokenLength: refreshToken.length,
        errorType: tokenError instanceof Error ? tokenError.constructor.name : typeof tokenError
      })
      logAPIAuth(logger, 'token_refresh', false, undefined, 'invalid_refresh_token')
      return createErrorResponse('Invalid refresh token', 401, request)
    }

    // Get user details from database
    const dbStart = Date.now()
    const db = (await import('@/lib/db')).db
    const users = (await import('@/lib/db')).users
    const [user] = await db
      .select()
      .from(users)
      .where((await import('drizzle-orm')).eq(users.user_id, userId))
      .limit(1)
    logPerformanceMetric(logger, 'user_lookup', Date.now() - dbStart, { userId })

    if (!user || !user.is_active) {
      logger.warn('Token refresh failed - user not found or inactive', {
        userId,
        userExists: !!user,
        userActive: user?.is_active || false
      })
      logAPIAuth(logger, 'token_refresh', false, userId, user ? 'user_inactive' : 'user_not_found')
      return createErrorResponse('User account is inactive', 401, request)
    }

    logger.debug('Active user found for token refresh', {
      userId: user.user_id,
      userEmail: user.email?.replace(/(.{2}).*@/, '$1***@'), // Mask email
      emailVerified: user.email_verified
    })

    // Get user's RBAC context for complete user data
    const contextStart = Date.now()
    const { getUserContextSafe } = await import('@/lib/rbac/user-context')
    const userContext = await getUserContextSafe(user.user_id)
    logPerformanceMetric(logger, 'rbac_context_fetch', Date.now() - contextStart, { userId })

    // Extract device info
    const deviceStart = Date.now()
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
    logPerformanceMetric(logger, 'device_info_generation', Date.now() - deviceStart)

    logger.debug('Device information generated for token refresh', {
      userId,
      deviceName,
      fingerprintHash: deviceFingerprint.substring(0, 8) + '...'
    })

    // Rotate tokens
    const tokenRotationStart = Date.now()
    const tokenPair = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)
    logPerformanceMetric(logger, 'token_rotation', Date.now() - tokenRotationStart, { userId })

    if (!tokenPair) {
      logger.warn('Token rotation failed', {
        userId,
        deviceFingerprint: deviceFingerprint.substring(0, 8) + '...',
        deviceName
      })

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
          deviceName,
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })

      logAPIAuth(logger, 'token_refresh', false, userId, 'token_rotation_failed')
      return createErrorResponse('Invalid or expired refresh token', 401, request)
    }

    logger.info('Token rotation successful', {
      userId,
      sessionId: tokenPair.sessionId,
      newTokensGenerated: true
    })

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
        expiresAt: tokenPair.expiresAt.toISOString(),
        correlationId: CorrelationContextManager.getCurrentId()
      }
    })

    // Get the user's actual assigned roles
    const userRoles = userContext?.roles?.map(r => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    logger.debug('User roles and permissions loaded', {
      userId,
      roleCount: userRoles.length,
      primaryRole,
      permissionCount: userContext?.all_permissions?.length || 0
    })

    // Generate new authenticated CSRF token as part of token rotation
    const csrfToken = await UnifiedCSRFProtection.setCSRFToken(user.user_id)
    
    // Set new refresh token in httpOnly cookie and return user data
    const responseStart = Date.now()
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
        sessionId: tokenPair.sessionId,
        csrfToken // Include refreshed CSRF token
      },
      message: 'Tokens refreshed successfully',
      meta: { timestamp: new Date().toISOString() }
    })

    // Set secure cookies for both tokens
    const cookieSetupStart = Date.now()
    // Use NODE_ENV to determine cookie security (staging should use NODE_ENV=production)
    const isSecureEnvironment = process.env.NODE_ENV === 'production'

    logger.debug('Preparing refresh token cookies', {
      userId,
      sessionId: tokenPair.sessionId,
      nodeEnv: process.env.NODE_ENV,
      environment: process.env.ENVIRONMENT,
      isSecureEnvironment,
      refreshTokenLength: tokenPair.refreshToken.length,
      accessTokenLength: tokenPair.accessToken.length
    })

    // Set HTTP-only refresh token cookie (server-only)
    response.cookies.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days (will be shorter for standard mode)
    })

    // Set secure access token cookie (server-only, secure)
    response.cookies.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    })

    logPerformanceMetric(logger, 'cookie_setup', Date.now() - cookieSetupStart, {
      userId,
      sessionId: tokenPair.sessionId
    })

    const totalDuration = Date.now() - startTime
    logger.info('Token refresh completed successfully', {
      userId,
      sessionId: tokenPair.sessionId,
      totalDuration,
      roleCount: userRoles.length
    })

    logAPIAuth(logger, 'token_refresh', true, userId)
    logPerformanceMetric(logger, 'total_refresh_duration', totalDuration, {
      userId,
      success: true
    })

    return response
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('Token refresh failed with error', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      hasRefreshToken: !!refreshTokenForError
    })

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
        
        logger.debug('Extracted user ID from failed refresh token', {
          userId: failedUserId
        })
      }
    } catch (tokenError) {
      logger.debug('Could not extract user ID from refresh token', {
        tokenError: tokenError instanceof Error ? tokenError.message : 'unknown'
      })
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
          error: error instanceof Error ? error.message : 'Unknown error',
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })
    } catch (authError) {
      // If we can't get authenticated user, log as anonymous security event
      logger.warn('Logging refresh error as security event due to auth failure', {
        authError: authError instanceof Error ? authError.message : 'unknown'
      })
      
      await AuditLogger.logSecurity({
        action: 'token_refresh_error',
        ipAddress,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          authFailed: true,
          correlationId: CorrelationContextManager.getCurrentId()
        },
        severity: 'medium'
      })
    }

    logPerformanceMetric(logger, 'total_refresh_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export with correlation wrapper
export const POST = withCorrelation(refreshHandler)
