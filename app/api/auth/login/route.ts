import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { validateRequest } from '@/lib/api/middleware/validation'
import { loginSchema } from '@/lib/validations/auth'
import { verifyPassword } from '@/lib/auth/security'
import { TokenManager } from '@/lib/auth/token-manager'
import { AccountSecurity } from '@/lib/auth/security'
import { AuditLogger, BufferedAuditLogger } from '@/lib/logger'
import { getUserContextSafe } from '@/lib/rbac/user-context'
import { CSRFProtection } from '@/lib/security/csrf'
import { publicRoute } from '@/lib/api/route-handler'
import { 
  createAPILogger, 
  logAPIAuth, 
  logAPIRequest, 
  logAPIResponse,
  logDBOperation,
  logSecurityEvent,
  logPerformanceMetric,
  withCorrelation,
  CorrelationContextManager 
} from '@/lib/logger'

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const logger = createAPILogger(request)
  
  // Log incoming authentication request
  logger.info('Login attempt initiated', {
    endpoint: '/api/auth/login',
    method: 'POST'
  })

  try {
    // CSRF PROTECTION: Verify CSRF token for login (public but state-changing)
    const csrfStartTime = Date.now()
    const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
    logPerformanceMetric(logger, 'csrf_validation', Date.now() - csrfStartTime)
    
    if (!isValidCSRF) {
      logSecurityEvent(logger, 'csrf_validation_failed', 'high', {
        endpoint: '/api/auth/login'
      })
      return createErrorResponse('CSRF token validation failed', 403, request)
    }

    logger.debug('CSRF validation successful')

    // Apply rate limiting
    const rateLimitStartTime = Date.now()
    await applyRateLimit(request, 'auth')
    logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStartTime)
    
    // Validate request data
    const validationStartTime = Date.now()
    const validatedData = await validateRequest(request, loginSchema)
    const { email, password, remember } = validatedData
    logPerformanceMetric(logger, 'request_validation', Date.now() - validationStartTime)

    logger.info('Login validation successful', {
      email: email.replace(/(.{2}).*@/, '$1***@'), // Partially mask email
      rememberMe: remember
    })

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check account lockout
    const lockoutStartTime = Date.now()
    const lockoutStatus = AccountSecurity.isAccountLocked(email)
    logPerformanceMetric(logger, 'lockout_check', Date.now() - lockoutStartTime)
    
    if (lockoutStatus.locked) {
      logger.warn('Account lockout detected', {
        email: email.replace(/(.{2}).*@/, '$1***@'),
        lockedUntil: lockoutStatus.lockedUntil
      })

      await AuditLogger.logAuth({
        action: 'account_locked',
        ipAddress,
        userAgent,
        metadata: {
          email,
          lockedUntil: lockoutStatus.lockedUntil,
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })
      
      logAPIAuth(logger, 'login_attempt', false, undefined, 'account_locked')
      throw AuthenticationError('Account temporarily locked due to multiple failed attempts. Please try again later.')
    }

    // Fetch user from database
    const dbStartTime = Date.now()
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    logDBOperation(logger, 'SELECT', 'users', dbStartTime, user ? 1 : 0)
      
    if (!user) {
      logger.warn('Login attempt with non-existent user', {
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      // Record failed attempt
      AccountSecurity.recordFailedAttempt(email)
      
      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'user_not_found',
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })
      
      logAPIAuth(logger, 'login_attempt', false, undefined, 'user_not_found')
      throw AuthenticationError('Invalid email or password')
    }
    
    if (!user.is_active) {
      logger.warn('Login attempt with inactive user', {
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'user_inactive',
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })
      
      logAPIAuth(logger, 'login_attempt', false, user.user_id, 'user_inactive')
      throw AuthenticationError('Account is inactive')
    }

    logger.debug('User found and active', {
      userId: user.user_id,
      emailVerified: user.email_verified
    })
    
    // Verify password
    const passwordStartTime = Date.now()
    const isValidPassword = await verifyPassword(password, user.password_hash)
    logPerformanceMetric(logger, 'password_verification', Date.now() - passwordStartTime)
    
    if (!isValidPassword) {
      logger.warn('Password verification failed', {
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      // Record failed attempt
      const lockoutResult = AccountSecurity.recordFailedAttempt(email)
      
      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'invalid_password',
          accountLocked: lockoutResult.locked,
          correlationId: CorrelationContextManager.getCurrentId()
        }
      })
      
      logAPIAuth(logger, 'login_attempt', false, user.user_id, 'invalid_password')
      throw AuthenticationError('Invalid email or password')
    }

    logger.info('Password verification successful', {
      userId: user.user_id
    })

    // Clear failed attempts on successful login
    AccountSecurity.clearFailedAttempts(email)

    // Generate device info
    const deviceGenStartTime = Date.now()
    const deviceFingerprint = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)
    const deviceName = TokenManager.generateDeviceName(userAgent)

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    }
    logPerformanceMetric(logger, 'device_info_generation', Date.now() - deviceGenStartTime)

    logger.debug('Device information generated', {
      deviceName,
      fingerprintHash: deviceFingerprint.substring(0, 8) + '...'
    })

    // Get user's RBAC context to determine roles
    const rbacStartTime = Date.now()
    const userContext = await getUserContextSafe(user.user_id)
    logPerformanceMetric(logger, 'rbac_context_fetch', Date.now() - rbacStartTime)

    logger.debug('User RBAC context loaded', {
      userId: user.user_id,
      roleCount: userContext?.roles?.length || 0,
      permissionCount: userContext?.all_permissions?.length || 0
    })

    // Create token pair with email parameter for audit logging
    const tokenStartTime = Date.now()
    const tokenPair = await TokenManager.createTokenPair(
      user.user_id,
      deviceInfo,
      remember || false,
      email // Pass email for audit logging
    )
    logPerformanceMetric(logger, 'token_generation', Date.now() - tokenStartTime)

    // Set secure httpOnly cookies for both tokens
    const cookieStartTime = Date.now()
    const cookieStore = await cookies()
    const isProduction = process.env.NODE_ENV === 'production'
    const maxAge = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60 // 30 days or 7 days

    logger.debug('Preparing authentication cookies', {
      isProduction,
      maxAge,
      rememberMe: remember,
      refreshTokenLength: tokenPair.refreshToken.length,
      accessTokenLength: tokenPair.accessToken.length
    })

    // Set HTTP-only refresh token cookie (server-only)
    const refreshResult = cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge
    })

    // Set secure access token cookie (server-only, much more secure)
    const accessResult = cookieStore.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    })

    // Verify cookies were set
    const refreshCookie = cookieStore.get('refresh-token')
    const accessCookie = cookieStore.get('access-token')

    const cookiesValid = !!refreshCookie?.value && !!accessCookie?.value
    logPerformanceMetric(logger, 'cookie_setup', Date.now() - cookieStartTime, {
      cookiesSet: cookiesValid,
      refreshCookieLength: refreshCookie?.value?.length || 0,
      accessCookieLength: accessCookie?.value?.length || 0
    })

    if (!cookiesValid) {
      logger.error('Authentication cookies failed to set', {
        refreshCookieExists: !!refreshCookie,
        accessCookieExists: !!accessCookie,
        refreshHasValue: !!refreshCookie?.value,
        accessHasValue: !!accessCookie?.value
      })
      throw new Error('Failed to set authentication cookies')
    }

    logger.info('Authentication cookies set successfully', {
      userId: user.user_id,
      sessionId: tokenPair.sessionId
    })

    // Log successful login
    await AuditLogger.logAuth({
      action: 'login',
      userId: user.user_id,
      ipAddress,
      userAgent,
      metadata: {
        email,
        sessionId: tokenPair.sessionId,
        rememberMe: remember,
        deviceFingerprint,
        correlationId: CorrelationContextManager.getCurrentId()
      }
    })

    // Get the user's actual assigned roles
    const userRoles = userContext?.roles?.map(r => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    const totalDuration = Date.now() - startTime
    
    logger.info('Login completed successfully', {
      userId: user.user_id,
      sessionId: tokenPair.sessionId,
      roleCount: userRoles.length,
      primaryRole,
      totalDuration
    })

    logAPIAuth(logger, 'login_complete', true, user.user_id)
    logPerformanceMetric(logger, 'total_login_duration', totalDuration, {
      userId: user.user_id,
      success: true
    })

    // Generate new authenticated CSRF token tied to the user
    const csrfToken = await CSRFProtection.setCSRFToken(user.user_id)
    
    const response = createSuccessResponse({
      user: {
        id: user.user_id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        role: primaryRole, // First role as primary, or 'user' if none
        emailVerified: user.email_verified,
        roles: userRoles, // All explicitly assigned roles
        permissions: userContext?.all_permissions?.map(p => p.name) || []
      },
      accessToken: tokenPair.accessToken,
      sessionId: tokenPair.sessionId,
      expiresAt: tokenPair.expiresAt.toISOString(),
      csrfToken // Include new CSRF token in response
    }, 'Login successful')
    
    logger.info('Authenticated CSRF token generated for user', {
      userId: user.user_id,
      tokenLength: csrfToken.length
    })
    
    return response
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('Login failed with error', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })

    logPerformanceMetric(logger, 'total_login_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export as public route with correlation wrapper
export const POST = publicRoute(
  withCorrelation(loginHandler), 
  'Authentication endpoint - must be public', 
  { rateLimit: 'auth' }
)
