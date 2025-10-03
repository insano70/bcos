import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { validateRequest } from '@/lib/api/middleware/validation'
import { loginSchema } from '@/lib/validations/auth'
import {
  verifyPassword,
  isAccountLocked,
  recordFailedAttempt,
  clearFailedAttempts
} from '@/lib/auth/security'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager'
import { AuditLogger, log, correlation } from '@/lib/logger'
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context'
import { UnifiedCSRFProtection } from '@/lib/security/csrf-unified'
import { publicRoute } from '@/lib/api/route-handler'

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now()

  // Log API request
  log.api('POST /api/auth/login - Login attempt', request, 0, 0)

  try {
    // Apply rate limiting
    const rateLimitStartTime = Date.now()
    await applyRateLimit(request, 'auth')
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStartTime })

    // Validate request data
    const validationStartTime = Date.now()
    const validatedData = await validateRequest(request, loginSchema)
    const { email, password, remember } = validatedData
    log.info('Request validation completed', { duration: Date.now() - validationStartTime })

    // Validation success logging
    log.auth('login_validation', true, {
      method: 'session',
      sessionDuration: remember ? 86400 * 30 : 86400,
      emailMasked: email.replace(/(.{2}).*@/, '$1***@'),
      rememberMe: remember
    })

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check account lockout
    const lockoutStartTime = Date.now()
    const lockoutStatus = await isAccountLocked(email)
    log.info('Account lockout check completed', { duration: Date.now() - lockoutStartTime })

    if (lockoutStatus.locked) {
      // Account lockout logging
      log.auth('login_attempt', false, {
        reason: 'account_locked',
        lockedUntil: lockoutStatus.lockedUntil
      })

      log.security('account_lockout_triggered', 'medium', {
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
          correlationId: correlation.current()
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
    log.db('SELECT', 'users', Date.now() - dbStartTime, { rowCount: user ? 1 : 0 })

    if (!user) {
      // Security logging for non-existent user attempts
      log.security('authentication_failure', 'medium', {
        action: 'login_attempt_nonexistent_user',
        blocked: true,
        threat: 'credential_attack',
        reason: 'user_not_found'
      })

      log.warn('Login attempt with non-existent user', {
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      // Record failed attempt
      await recordFailedAttempt(email)

      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'user_not_found',
          correlationId: correlation.current()
        }
      })

      log.auth('login_attempt', false, { reason: 'user_not_found' })
      throw AuthenticationError('Invalid email or password')
    }
    
    if (!user.is_active) {
      log.warn('Login attempt with inactive user', {
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
          correlationId: correlation.current()
        }
      })

      log.auth('login_attempt', false, { userId: user.user_id, reason: 'user_inactive' })
      throw AuthenticationError('Account is inactive')
    }

    log.debug('User found and active', {
      userId: user.user_id,
      emailVerified: user.email_verified
    })
    
    // Check if user is SSO-only (no password set)
    if (!user.password_hash) {
      log.warn('Password login attempted for SSO-only user', {
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@')
      })

      log.security('sso_only_user_password_attempt', 'medium', {
        action: 'password_login_blocked',
        userId: user.user_id,
        blocked: true,
        threat: 'authentication_bypass_attempt',
        reason: 'sso_only_user'
      })

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'sso_only_user_password_attempt',
          correlationId: correlation.current()
        }
      })

      throw AuthenticationError('This account uses Single Sign-On. Please sign in with Microsoft.')
    }
    
    // Verify password
    const passwordStartTime = Date.now()
    const isValidPassword = await verifyPassword(password, user.password_hash)
    log.info('Password verification completed', { duration: Date.now() - passwordStartTime })

    if (!isValidPassword) {
      // Password failure logging
      log.auth('login_attempt', false, {
        userId: user.user_id,
        reason: 'invalid_password'
      })

      log.security('authentication_failure', 'medium', {
        action: 'password_verification_failed',
        userId: user.user_id,
        threat: 'credential_attack',
        blocked: true
      })

      // Record failed attempt
      const lockoutResult = await recordFailedAttempt(email)

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'invalid_password',
          accountLocked: lockoutResult.locked,
          correlationId: correlation.current()
        }
      })

      throw AuthenticationError('Invalid email or password')
    }

    // Authentication success logging
    log.auth('password_verification', true, {
      userId: user.user_id,
      method: 'session'
    })

    log.info('Password verification successful', {
      userId: user.user_id
    })

    // Clear failed attempts on successful login
    await clearFailedAttempts(email)

    // Generate device info
    const deviceGenStartTime = Date.now()
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent)
    const deviceName = generateDeviceName(userAgent)

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    }
    log.info('Device info generated', { duration: Date.now() - deviceGenStartTime })

    log.debug('Device information generated', {
      deviceName,
      fingerprintHash: deviceFingerprint.substring(0, 8) + '...'
    })

    // Get user's RBAC context to determine roles
    const rbacStartTime = Date.now()
    const userContext = await getCachedUserContextSafe(user.user_id)
    log.info('RBAC context fetched', { duration: Date.now() - rbacStartTime })

    log.debug('User RBAC context loaded', {
      userId: user.user_id,
      roleCount: userContext?.roles?.length || 0,
      permissionCount: userContext?.all_permissions?.length || 0
    })

    // Create token pair with email parameter for audit logging
    const tokenStartTime = Date.now()
    const tokenPair = await createTokenPair(
      user.user_id,
      deviceInfo,
      remember || false,
      email // Pass email for audit logging
    )
    log.info('Tokens generated', { duration: Date.now() - tokenStartTime })

    // Set secure httpOnly cookies for both tokens
    const cookieStartTime = Date.now()
    const cookieStore = await cookies()
    // Use NODE_ENV to determine cookie security (staging should use NODE_ENV=production)
    const isSecureEnvironment = process.env.NODE_ENV === 'production'
    const maxAge = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60 // 30 days or 7 days

    log.debug('Preparing authentication cookies', {
      nodeEnv: process.env.NODE_ENV,
      environment: process.env.ENVIRONMENT,
      isSecureEnvironment,
      maxAge,
      rememberMe: remember,
      refreshTokenLength: tokenPair.refreshToken.length,
      accessTokenLength: tokenPair.accessToken.length
    })

    // Set HTTP-only refresh token cookie (server-only)
    const refreshResult = cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge
    })

    // Set secure access token cookie (server-only, much more secure)
    const accessResult = cookieStore.set('access-token', tokenPair.accessToken, {
      httpOnly: true, // ✅ SECURE: JavaScript cannot access this token
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 // 15 minutes
    })

    // Verify cookies were set
    const refreshCookie = cookieStore.get('refresh-token')
    const accessCookie = cookieStore.get('access-token')

    const cookiesValid = !!refreshCookie?.value && !!accessCookie?.value
    log.info('Cookie setup completed', {
      duration: Date.now() - cookieStartTime,
      cookiesSet: cookiesValid,
      refreshCookieLength: refreshCookie?.value?.length || 0,
      accessCookieLength: accessCookie?.value?.length || 0
    })

    if (!cookiesValid) {
      log.error('Authentication cookies failed to set', undefined, {
        refreshCookieExists: !!refreshCookie,
        accessCookieExists: !!accessCookie,
        refreshHasValue: !!refreshCookie?.value,
        accessHasValue: !!accessCookie?.value
      })
      throw new Error('Failed to set authentication cookies')
    }

    log.info('Authentication cookies set successfully', {
      userId: user.user_id,
      sessionId: tokenPair.sessionId
    })

    // Successful authentication logging
    log.auth('login_success', true, {
      userId: user.user_id,
      ...(userContext?.current_organization_id && {
        organizationId: userContext.current_organization_id
      }),
      sessionDuration: remember ? 2592000 : 86400,
      permissions: userContext?.all_permissions?.map(p => p.name) || []
    })

    // Security success event
    log.security('successful_authentication', 'low', {
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
        correlationId: correlation.current()
      }
    })

    // Get the user's actual assigned roles
    const userRoles = userContext?.roles?.map(r => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    const totalDuration = Date.now() - startTime

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

    log.info('Authenticated CSRF token generated for user', {
      userId: user.user_id,
      tokenLength: csrfToken.length
    })

    log.api('POST /api/auth/login - Success', request, 200, totalDuration)
    
    return response
    
  } catch (error) {
    const totalDuration = Date.now() - startTime

    log.error('Login failed with error', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })

    log.api('POST /api/auth/login - Error', request, 500, totalDuration)

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export as public route with correlation wrapper
export const POST = publicRoute(
  async (request: NextRequest) => {
    const correlationId = correlation.generate()
    return correlation.withContext(correlationId, {}, () => loginHandler(request))
  },
  'Authentication endpoint - must be public',
  { rateLimit: 'auth' }
)
