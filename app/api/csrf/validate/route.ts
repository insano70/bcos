import { NextRequest, NextResponse } from 'next/server'
import { UnifiedCSRFProtection } from '@/lib/security/csrf-unified'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { validateRequest } from '@/lib/api/middleware/validation'
import { z } from 'zod'
import { 
  createAPILogger, 
  logPerformanceMetric,
  logSecurityEvent 
} from '@/lib/logger'

/**
 * CSRF Token Validation Endpoint
 * Validates CSRF tokens without side effects (no state changes)
 * Used by client-side code to check token validity before making requests
 */

// Validation schema for the request
const validateTokenSchema = z.object({
  validateOnly: z.boolean().optional().default(true),
  token: z.string().optional() // Optional - will use header token if not provided
})

const validateTokenHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const logger = createAPILogger(request)
  
  logger.info('CSRF token validation request initiated', {
    endpoint: '/api/csrf/validate',
    method: 'POST'
  })

  try {
    // Apply rate limiting (use 'auth' limits since this is security-related)
    const rateLimitStartTime = Date.now()
    await applyRateLimit(request, 'auth')
    logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStartTime)
    
    // Validate request body (optional)
    const validationStartTime = Date.now()
    const validatedData = await validateRequest(request, validateTokenSchema)
    logPerformanceMetric(logger, 'request_validation', Date.now() - validationStartTime)

    // Get token to validate
    const headerToken = request.headers.get('x-csrf-token')
    const tokenToValidate = validatedData.token || headerToken

    if (!tokenToValidate) {
      logger.warn('CSRF validation request missing token', {
        hasHeaderToken: !!headerToken,
        hasBodyToken: !!validatedData.token
      })
      
      return createSuccessResponse({
        valid: false,
        reason: 'missing_token',
        details: 'No CSRF token provided in header or request body'
      }, 'Token validation completed')
    }

    // Validate token structure and content
    const validationStart = Date.now()
    
    try {
      // Determine token type by parsing the token itself, not the endpoint
      let isValidToken = false
      let validationReason = 'unknown'
      let tokenType = 'unknown'

      // Parse token to determine its type
      try {
        const [encodedPayload] = tokenToValidate.split('.')
        if (encodedPayload) {
          const payload = JSON.parse(atob(encodedPayload))
          tokenType = payload.type || 'unknown'
        }
      } catch (parseError) {
        validationReason = 'invalid_token_format'
        isValidToken = false
      }

      if (tokenType === 'anonymous') {
        // Validate as anonymous token
        isValidToken = await UnifiedCSRFProtection.validateAnonymousToken(request, tokenToValidate)
        validationReason = isValidToken ? 'anonymous_token_valid' : 'anonymous_token_invalid'
      } else if (tokenType === 'authenticated') {
        // Validate as authenticated token
        isValidToken = await UnifiedCSRFProtection.validateAuthenticatedToken(tokenToValidate)
        validationReason = isValidToken ? 'authenticated_token_valid' : 'authenticated_token_invalid'
      } else {
        validationReason = 'unknown_token_type'
        isValidToken = false
      }

      logPerformanceMetric(logger, 'token_validation', Date.now() - validationStart)

      // Log validation result for monitoring
      if (isValidToken) {
        logger.debug('CSRF token validation successful', {
          tokenType: tokenType,
          validationReason
        })
      } else {
        logger.warn('CSRF token validation failed', {
          tokenType: tokenType, 
          validationReason,
          tokenLength: tokenToValidate.length
        })
        
        // Log as security event for monitoring
        logSecurityEvent(logger, 'csrf_token_validation_failed', 'low', {
          endpoint: '/api/csrf/validate',
          reason: validationReason,
          tokenType: tokenType,
          tokenLength: tokenToValidate.length
        })
      }

      const totalDuration = Date.now() - startTime
      logPerformanceMetric(logger, 'total_validation_duration', totalDuration)

      return createSuccessResponse({
        valid: isValidToken,
        reason: validationReason,
        tokenType: tokenType,
        validationDuration: totalDuration
      }, 'Token validation completed')

    } catch (validationError) {
      logger.error('CSRF token validation error', validationError, {
        tokenLength: tokenToValidate.length
      })

      return createSuccessResponse({
        valid: false,
        reason: 'validation_error',
        details: validationError instanceof Error ? validationError.message : 'Unknown validation error'
      }, 'Token validation completed with error')
    }

  } catch (error) {
    const totalDuration = Date.now() - startTime
    logger.error('CSRF validation endpoint error', error, {
      totalDuration
    })
    
    return createErrorResponse(
      error instanceof Error ? error : 'Unknown error', 
      500, 
      request
    )
  }
}

// Additional GET endpoint for simple health checks
const healthCheckHandler = async (request: NextRequest) => {
  const logger = createAPILogger(request)
  
  // Simple token presence check without validation
  const headerToken = request.headers.get('x-csrf-token')
  const cookieToken = request.cookies.get('csrf-token')?.value
  
  logger.debug('CSRF health check', {
    hasHeaderToken: !!headerToken,
    hasCookieToken: !!cookieToken
  })

  return createSuccessResponse({
    hasHeaderToken: !!headerToken,
    hasCookieToken: !!cookieToken,
    endpoint: '/api/csrf/validate',
    methods: ['POST', 'GET']
  }, 'CSRF validation endpoint health check')
}

// Export handlers with proper route protection
// These are public routes since they're used for token validation before authentication
export const POST = publicRoute(
  validateTokenHandler,
  'CSRF token validation must be available for token health checks',
  { rateLimit: 'auth' }
)

export const GET = publicRoute(
  healthCheckHandler,
  'CSRF health check must be available for monitoring',
  { rateLimit: 'api' }
)
