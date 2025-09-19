import { NextRequest, NextResponse } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { EdgeCSRFProtection } from '@/lib/security/csrf-edge'
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
  
  // Simple logic: Check if user is authenticated
  let session = null
  let isAuthenticated = false
  try {
    session = await requireAuth(request)
    isAuthenticated = true
  } catch {
    isAuthenticated = false
  }
  
  logger.info('CSRF token request initiated', {
    isAuthenticated,
    userId: session?.user?.id
  })

  try {
    let token: string
    let tokenType: string
    
    if (isAuthenticated && session?.user?.id) {
      // Authenticated user gets authenticated token
      token = await CSRFProtection.setCSRFToken(session.user.id)
      tokenType = 'authenticated'
      
      logger.debug('Authenticated CSRF token generated', {
        userId: session.user.id
      })
    } else {
      // Unauthenticated user gets anonymous token (edge-compatible)
      token = await EdgeCSRFProtection.generateAnonymousToken(request)
      tokenType = 'anonymous'
      
      logger.debug('Anonymous CSRF token generated')
    }

    // Set cookie and return token
    const response = NextResponse.json({
      success: true,
      data: { csrfToken: token },
      message: 'CSRF token issued'
    })
    
    response.cookies.set('csrf-token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: tokenType === 'anonymous' ? 3600 : 86400,
      path: '/'
    })

    logger.info('CSRF token issued successfully', { tokenType })
    return response
    
  } catch (error) {
    logger.error('CSRF token generation error', error)
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


