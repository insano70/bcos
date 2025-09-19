import type { NextRequest } from 'next/server'
import { CSRFProtection } from '@/lib/security/csrf'
import { createErrorResponse } from '../responses/error'
import { 
  createAPILogger, 
  logSecurityEvent,
  logPerformanceMetric 
} from '@/lib/logger'
import type { UserContext } from '@/lib/types/rbac'

/**
 * Validates CSRF token for state-changing operations
 * Should be used at the beginning of all POST/PUT/PATCH/DELETE handlers
 */
export async function validateCSRFToken(
  request: NextRequest, 
  userContext: UserContext,
  endpoint: string,
  action: string
): Promise<{ valid: boolean; response?: Response }> {
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
  
  const csrfStartTime = Date.now()
  const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
  logPerformanceMetric(logger, 'csrf_validation', Date.now() - csrfStartTime)
  
  if (!isValidCSRF) {
    logSecurityEvent(logger, 'csrf_validation_failed', 'high', {
      endpoint,
      action,
      userId: userContext.user_id
    })
    
    return {
      valid: false,
      response: createErrorResponse('CSRF token validation failed', 403, request)
    }
  }
  
  logger.debug('CSRF validation successful', {
    endpoint,
    action
  })
  
  return { valid: true }
}

/**
 * Wrapper function that adds CSRF protection to a handler
 * Use this to wrap existing handlers that need CSRF protection
 */
export function withCSRFProtection<T extends any[]>(
  handler: (request: NextRequest, userContext: UserContext, ...args: T) => Promise<Response>,
  endpoint: string,
  action: string
) {
  return async (request: NextRequest, userContext: UserContext, ...args: T): Promise<Response> => {
    const csrfValidation = await validateCSRFToken(request, userContext, endpoint, action)
    
    if (!csrfValidation.valid && csrfValidation.response) {
      return csrfValidation.response
    }
    
    return handler(request, userContext, ...args)
  }
}
