import { NextRequest } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import type { UserContext } from '@/lib/types/rbac'
import { 
  createAPILogger, 
  logPerformanceMetric,
  logSecurityEvent 
} from '@/lib/logger'

/**
 * CSRF Token Generation Endpoint
 * Provides CSRF tokens to authenticated users for state-changing operations
 * Requires authentication to prevent token farming
 */
const getCSRFTokenHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  logger.info('CSRF token request initiated', {
    userId: userContext.user_id,
    endpoint: '/api/csrf',
    method: 'GET'
  })

  try {
    // Generate and set CSRF token cookie, and return token for header use
    const tokenStartTime = Date.now()
    const token = await CSRFProtection.setCSRFToken()
    logPerformanceMetric(logger, 'csrf_token_generation', Date.now() - tokenStartTime)

    if (!token) {
      logger.error('Failed to generate CSRF token', {
        userId: userContext.user_id
      })
      
      logSecurityEvent(logger, 'csrf_generation_failed', 'high', {
        userId: userContext.user_id,
        reason: 'token_generation_error'
      })
      
      return createErrorResponse('Failed to generate CSRF token', 500, request)
    }

    // Log successful token generation
    logSecurityEvent(logger, 'csrf_token_issued', 'low', {
      userId: userContext.user_id,
      tokenLength: token.length
    })

    const totalDuration = Date.now() - startTime
    logger.info('CSRF token issued successfully', {
      userId: userContext.user_id,
      duration: totalDuration
    })

    logPerformanceMetric(logger, 'csrf_request_duration', totalDuration, {
      success: true,
      userId: userContext.user_id
    })

    return createSuccessResponse({ csrfToken: token }, 'CSRF token issued')
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('CSRF token generation error', error, {
      userId: userContext.user_id,
      duration: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    logSecurityEvent(logger, 'csrf_generation_error', 'high', {
      userId: userContext.user_id,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    
    logPerformanceMetric(logger, 'csrf_request_duration', totalDuration, {
      success: false,
      errorType: error instanceof Error ? error.name : 'unknown'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export with RBAC protection - requires basic authentication
// Uses the most minimal permission to ensure user is authenticated
export const GET = rbacRoute(
  getCSRFTokenHandler,
  {
    permission: 'users:read:own',
    rateLimit: 'api'
  }
)


