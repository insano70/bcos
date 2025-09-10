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
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    await applyRateLimit(request, 'auth')
    
    // Validate request data
    const validatedData = await validateRequest(request, loginSchema)
    const { email, password, remember } = validatedData

    // Extract device info
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     request.ip || 
                     'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Check account lockout
    const lockoutStatus = AccountSecurity.isAccountLocked(email)
    if (lockoutStatus.locked) {
      await AuditLogger.logAuth({
        action: 'login_blocked_locked',
        ipAddress,
        userAgent,
        metadata: {
          email,
          lockedUntil: lockoutStatus.lockedUntil
        }
      })
      
      throw AuthenticationError('Account temporarily locked due to multiple failed attempts. Please try again later.')
    }

    // Fetch user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      
    if (!user) {
      // Record failed attempt
      AccountSecurity.recordFailedAttempt(email)
      
      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'user_not_found'
        }
      })
      
      throw AuthenticationError('Invalid email or password')
    }
    
    if (!user.is_active) {
      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent,
        metadata: {
          email,
          reason: 'user_inactive'
        }
      })
      
      throw AuthenticationError('Account is inactive')
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash)
    if (!isValidPassword) {
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
          accountLocked: lockoutResult.locked
        }
      })
      
      throw AuthenticationError('Invalid email or password')
    }

    // Clear failed attempts on successful login
    AccountSecurity.clearFailedAttempts(email)

    // Generate device info
    const deviceFingerprint = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)
    const deviceName = TokenManager.generateDeviceName(userAgent)

    const deviceInfo = {
      ipAddress,
      userAgent,
      fingerprint: deviceFingerprint,
      deviceName
    }

    // Create token pair
    const tokenPair = await TokenManager.createTokenPair(
      user.user_id,
      deviceInfo,
      remember || false
    )

    // Set secure httpOnly cookie for refresh token
    const cookieStore = cookies()
    const isProduction = process.env.NODE_ENV === 'production'
    const maxAge = remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60 // 30 days or 7 days
    
    cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge
    })

    // Log successful login
    await AuditLogger.logAuth({
      action: 'login_success',
      userId: user.user_id,
      ipAddress,
      userAgent,
      metadata: {
        email,
        sessionId: tokenPair.sessionId,
        rememberMe: remember,
        deviceFingerprint
      }
    })

    return createSuccessResponse({
      user: {
        id: user.user_id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        role: 'admin',
        emailVerified: user.email_verified
      },
      accessToken: tokenPair.accessToken,
      sessionId: tokenPair.sessionId,
      expiresAt: tokenPair.expiresAt.toISOString()
    }, 'Login successful')
    
  } catch (error) {
    console.error('Login error:', error)
    return createErrorResponse(error, error instanceof AuthenticationError ? 401 : 500, request)
  }
}
