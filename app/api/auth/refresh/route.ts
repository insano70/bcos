import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { TokenManager } from '@/lib/auth/token-manager'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { AuditLogger } from '@/lib/api/services/audit'

/**
 * Refresh Token Endpoint
 * Handles token rotation with sliding window expiration
 */
export async function POST(request: NextRequest) {
  try {
    // Apply aggressive rate limiting for token refresh
    await applyRateLimit(request, 'auth')
    
    // Get refresh token from httpOnly cookie
    const cookieStore = cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    
    if (!refreshToken) {
      return createErrorResponse('Refresh token not found', 401, request)
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
      // Log failed refresh attempt
      await AuditLogger.logAuth({
        action: 'token_refresh_failed',
        ipAddress,
        userAgent,
        metadata: {
          reason: 'invalid_refresh_token',
          deviceFingerprint
        }
      })
      
      return createErrorResponse('Invalid or expired refresh token', 401, request)
    }

    // Set new refresh token in httpOnly cookie
    const response = createSuccessResponse({
      accessToken: tokenPair.accessToken,
      expiresAt: tokenPair.expiresAt.toISOString(),
      sessionId: tokenPair.sessionId
    }, 'Tokens refreshed successfully')

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
    await AuditLogger.logSecurity({
      action: 'token_refresh_error',
      ipAddress,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      severity: 'medium'
    })
    
    return createErrorResponse(error, 500, request)
  }
}
