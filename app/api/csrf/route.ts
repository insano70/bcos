import { NextRequest, NextResponse } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { requireAuth } from '@/lib/api/middleware/auth'
import { 
  createAPILogger, 
  logPerformanceMetric,
  logSecurityEvent 
} from '@/lib/logger'

/**
 * CSRF Token Generation Endpoint
 * 
 * This endpoint is PUBLIC but behaves differently based on authentication status:
 * - Unauthenticated users: Get anonymous tokens (for login/register)
 * - Authenticated users: Get authenticated tokens (for API calls)
 * 
 * Security measures:
 * - Rate limited to prevent token farming
 * - Tokens bound to IP/User-Agent/Time window
 * - Short expiration times
 */
const getCSRFTokenHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const logger = createAPILogger(request)
  
  // Check if user is authenticated (but don't require it)
  let session = null
  let isAuthenticated = false
  try {
    session = await requireAuth(request)
    isAuthenticated = true
  } catch {
    // User is not authenticated - this is fine for CSRF endpoint
    isAuthenticated = false
  }
  
  logger.info('CSRF token request initiated', {
    endpoint: '/api/csrf',
    method: 'GET',
    isAuthenticated,
    userId: session?.user?.id
  })

  try {
    let token: string
    let tokenType: string
    
    if (isAuthenticated && session?.user?.id) {
      // Generate authenticated CSRF token for logged-in user
      const tokenStartTime = Date.now()
      token = await CSRFProtection.setCSRFToken(session.user.id)
      tokenType = 'authenticated'
      logPerformanceMetric(logger, 'csrf_token_generation', Date.now() - tokenStartTime)
      
      logger.debug('Authenticated CSRF token generated', {
        userId: session.user.id,
        tokenLength: token.length
      })
    } else {
      // Generate anonymous CSRF token based on request fingerprint
      const tokenStartTime = Date.now()
      token = CSRFProtection.generateAnonymousToken(request)
      tokenType = 'anonymous'
      logPerformanceMetric(logger, 'csrf_token_generation', Date.now() - tokenStartTime)
      
      logger.debug('Anonymous CSRF token generated', {
        tokenLength: token.length
      })
    }

    // Set the token in a non-httpOnly cookie so JavaScript can read it
    const response = createSuccessResponse({ csrfToken: token }, 'CSRF token issued')
    
    // Cast to NextResponse to access cookies
    if (response instanceof NextResponse) {
      response.cookies.set('csrf-token', token, {
        httpOnly: false, // Must be readable by JavaScript
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600, // 1 hour for anonymous tokens
        path: '/'
      })
    }

    // Log successful token generation
    logSecurityEvent(logger, 'csrf_token_issued', 'low', {
      tokenType,
      tokenLength: token.length,
      userId: session?.user?.id
    })

    const totalDuration = Date.now() - startTime
    logger.info(`${tokenType} CSRF token issued successfully`, {
      duration: totalDuration,
      tokenType,
      userId: session?.user?.id
    })

    logPerformanceMetric(logger, 'csrf_request_duration', totalDuration, {
      success: true,
      tokenType,
      isAuthenticated
    })

    return response
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('CSRF token generation error', error, {
      duration: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    logSecurityEvent(logger, 'csrf_generation_error', 'high', {
      tokenType: 'anonymous',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    logPerformanceMetric(logger, 'csrf_request_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export as public route - CSRF tokens must be available before authentication
// Uses stricter 'auth' rate limiting to prevent token farming attacks
export const GET = publicRoute(
  getCSRFTokenHandler,
  'CSRF tokens must be available to anonymous users for login protection',
  { rateLimit: 'auth' }
)


