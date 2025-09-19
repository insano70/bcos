import { NextRequest, NextResponse } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { 
  createAPILogger, 
  logPerformanceMetric,
  logSecurityEvent 
} from '@/lib/logger'

/**
 * CSRF Token Generation Endpoint
 * Provides anonymous CSRF tokens for public endpoints (login, register)
 * and authenticated tokens for logged-in users
 */
const getCSRFTokenHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const logger = createAPILogger(request)
  
  logger.info('CSRF token request initiated', {
    endpoint: '/api/csrf',
    method: 'GET',
    isAnonymous: true
  })

  try {
    // Generate anonymous CSRF token based on request fingerprint
    const tokenStartTime = Date.now()
    const token = CSRFProtection.generateAnonymousToken(request)
    logPerformanceMetric(logger, 'csrf_token_generation', Date.now() - tokenStartTime)

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
      tokenType: 'anonymous',
      tokenLength: token.length
    })

    const totalDuration = Date.now() - startTime
    logger.info('Anonymous CSRF token issued successfully', {
      duration: totalDuration
    })

    logPerformanceMetric(logger, 'csrf_request_duration', totalDuration, {
      success: true,
      tokenType: 'anonymous'
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
export const GET = publicRoute(
  getCSRFTokenHandler,
  'CSRF tokens must be available to anonymous users for login protection',
  { rateLimit: 'api' }
)


