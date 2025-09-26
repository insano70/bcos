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

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
import { TokenManager } from '@/lib/auth/token-manager'
import { AccountSecurity } from '@/lib/auth/security'
import { AuditLogger, BufferedAuditLogger } from '@/lib/logger'
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context'
import { UnifiedCSRFProtection } from '@/lib/security/csrf-unified'
import { publicRoute } from '@/lib/api/route-handler'
import { 
  logAPIAuth, 
  logDBOperation,
  logSecurityEvent,
  logPerformanceMetric,
  withCorrelation,
  CorrelationContextManager 
} from '@/lib/logger'
import { createAPILogger } from '@/lib/logger/api-features'

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  
  // Create enhanced API logger for authentication
  const apiLogger = createAPILogger(request, 'authentication')
  const logger = apiLogger.getLogger()
  
  // Enhanced login attempt logging - permanently enabled
  apiLogger.logRequest({
    authType: 'none',
    suspicious: false
  })

  try {
    // Apply rate limiting
    const rateLimitStartTime = Date.now()
    await applyRateLimit(request, 'auth')
    logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStartTime)
    
    // Validate request data
    const validationStartTime = Date.now()
    const validatedData = await validateRequest(request, loginSchema)
    const { email, password, remember } = validatedData
    logPerformanceMetric(logger, 'request_validation', Date.now() - validationStartTime)

    // Enhanced validation success logging
    apiLogger.logAuth('login_validation', true, {
      method: 'session', // This will be a session-based login
      sessionDuration: remember ? 86400 * 30 : 86400 // 30 days if remember, else 1 day
    })
    
    // Log validation details separately with PII masking
    apiLogger.info('Login validation completed', {
      emailMasked: email.replace(/(.{2}).*@/, '$1***@'),
      rememberMe: remember,
      validationDuration: Date.now() - validationStartTime
    })

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check account lockout
    const lockoutStartTime = Date.now()
    const lockoutStatus = await AccountSecurity.isAccountLocked(email)
    logPerformanceMetric(logger, 'lockout_check', Date.now() - lockoutStartTime)
    
    if (lockoutStatus.locked) {
      // Enhanced account lockout logging - permanently enabled
      apiLogger.logAuth('login_attempt', false, {
        reason: 'account_locked',
        sessionDuration: lockoutStatus.lockedUntil ? 
          Math.ceil((new Date(lockoutStatus.lockedUntil).getTime() - Date.now()) / 60000) : 0 // minutes
      })
      
      apiLogger.logSecurity('account_lockout_triggered', 'medium', {
        blocked: true,
        reason: 'multiple_failed_attempts',
        action: 'login_blocked'
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
      // Enhanced security logging for non-existent user attempts
      apiLogger.logSecurity('authentication_failure', 'medium', {
        action: 'login_attempt_nonexistent_user',
        blocked: true,
        threat: 'credential_attack',
        reason: 'user_not_found'
      })
      
      logger.warn('Login attempt with non-existent user', {
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      // Record failed attempt
      await AccountSecurity.recordFailedAttempt(email)
      
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
      // Enhanced password failure logging - permanently enabled
      apiLogger.logAuth('login_attempt', false, {
        userId: user.user_id,
        reason: 'invalid_password'
      })
      
      apiLogger.logSecurity('authentication_failure', 'medium', {
        action: 'password_verification_failed',
        userId: user.user_id,
        threat: 'credential_attack',
        blocked: true
      })

      // Record failed attempt
      const lockoutResult = await AccountSecurity.recordFailedAttempt(email)
      
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

    // Enhanced authentication success logging
    apiLogger.logAuth('password_verification', true, {
      userId: user.user_id,
      method: 'session' // This login will create a session
    })
    
    logger.info('Password verification successful', {
      userId: user.user_id
    })

    // Clear failed attempts on successful login
    await AccountSecurity.clearFailedAttempts(email)

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
    const userContext = await getCachedUserContextSafe(user.user_id)
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

    // Enhanced successful authentication logging - permanently enabled
    apiLogger.logAuth('login_success', true, {
      userId: user.user_id,
      ...(userContext?.current_organization_id && { 
        organizationId: userContext.current_organization_id 
      }),
      sessionDuration: remember ? 2592000 : 86400, // 30 days or 24 hours in seconds
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    })
    
    // Business intelligence logging  
    apiLogger.logBusiness('user_authentication', 'sessions', 'success', {
      recordsProcessed: 1,
      businessRules: ['password_verification', 'account_lockout_check', 'rbac_context_load'],
      notifications: 0 // No notifications sent during login
    })
    
    // Security success event
    apiLogger.logSecurity('successful_authentication', 'low', {
      action: 'authentication_granted',
      userId: user.user_id,
      reason: 'valid_credentials'
    })

    // Log successful login to audit system
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

    // Enhanced completion logging - permanently enabled
    apiLogger.logResponse(200, {
      recordCount: 1,
      processingTimeBreakdown: {
        validation: validationStartTime ? Date.now() - validationStartTime : 0,
        lockoutCheck: lockoutStartTime ? Date.now() - lockoutStartTime : 0,
        passwordVerification: passwordStartTime ? Date.now() - passwordStartTime : 0,
        rbacContextFetch: rbacStartTime ? Date.now() - rbacStartTime : 0,
        tokenGeneration: tokenStartTime ? Date.now() - tokenStartTime : 0,
        cookieSetup: cookieStartTime ? Date.now() - cookieStartTime : 0
      }
    })

    // Generate new authenticated CSRF token tied to the user
    const csrfToken = await UnifiedCSRFProtection.setCSRFToken(user.user_id)
    
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
