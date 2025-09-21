/**
 * Logging Middleware for Next.js API Routes
 * Automatically logs all API requests and responses
 */

import type { NextRequest, NextResponse } from 'next/server'
import { createAPILogger, logAPIRequest, logAPIResponse } from './api-logger'

/**
 * Logging middleware for API routes
 * Wraps API handlers to provide automatic request/response logging
 */
export function withLogging<T extends unknown[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse | Response>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    const startTime = Date.now()
    const logger = createAPILogger(request)
    
    // Log incoming request
    logAPIRequest(logger, request)
    
    try {
      // Execute the handler
      const response = await handler(request, ...args)
      
      // Log successful response
      logAPIResponse(logger, response.status, startTime)
      
      return response
    } catch (error) {
      // Log error response
      const errorStatus = error instanceof Error && 'status' in error
        ? (error as { status?: number }).status ?? 500
        : 500
      
      logAPIResponse(logger, errorStatus, startTime, undefined, error as Error)
      
      // Re-throw the error to maintain normal error handling
      throw error
    }
  }
}

/**
 * Logging middleware for RBAC-protected routes
 */
// Type for auth result - should match the one in global-auth.ts
interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    role: string;
    emailVerified: boolean;
    practiceId: string | null;
    roles: string[];
    permissions: string[];
    isSuperAdmin: boolean;
    organizationAdminFor: string[];
  };
  accessToken: string;
  sessionId: string;
}

export function withRBACLogging<T extends unknown[]>(
  handler: (request: NextRequest, userContext: AuthResult, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, userContext: AuthResult, ...args: T): Promise<NextResponse> => {
    const startTime = Date.now()
    const logger = createAPILogger(request).withUser(userContext.user.id, userContext.user.practiceId || undefined)
    
    // Log incoming request with user context
    logger.info('RBAC API Request Started', {
      userId: userContext.user.id,
      organizationId: userContext.user.practiceId,
      roles: userContext.user.roles
    })
    
    try {
      // Execute the handler
      const response = await handler(request, userContext, ...args)
      
      // Log successful response
      logAPIResponse(logger, response.status, startTime)
      
      return response
    } catch (error) {
      // Log error response with user context
      const errorStatus = error instanceof Error && 'status' in error
        ? (error as { status?: number }).status ?? 500
        : 500
      
      logAPIResponse(logger, errorStatus, startTime, undefined, error as Error)
      
      throw error
    }
  }
}

/**
 * Higher-order function to add performance monitoring
 */
export function withPerformanceLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const startTime = Date.now()
    
    try {
      const result = await fn(...args)
      const duration = Date.now() - startTime
      
      // Log performance metric
      const logger = createAPILogger(args[0] as NextRequest)
      logger.debug('Operation Performance', {
        operation,
        duration,
        success: true
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Log failed operation
      const logger = createAPILogger(args[0] as NextRequest)
      logger.error('Operation Failed', error, {
        operation,
        duration,
        success: false
      })
      
      throw error
    }
  }) as T
}

/**
 * Database operation logging wrapper
 */
export function withDBLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  table: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const startTime = Date.now()
    
    try {
      const result = await fn(...args)
      const duration = Date.now() - startTime
      
      // Determine record count if result is an array
      const recordCount = Array.isArray(result) ? result.length : 
                         result && typeof result === 'object' && 'length' in result ? result.length :
                         result ? 1 : 0
      
      // Log successful database operation
      const logger = createAPILogger(args[0] as NextRequest)
      logger.debug('Database Operation', {
        operation,
        table,
        duration,
        recordCount,
        success: true
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Log failed database operation
      const logger = createAPILogger(args[0] as NextRequest)
      logger.error('Database Operation Failed', error, {
        operation,
        table,
        duration,
        success: false
      })
      
      throw error
    }
  }) as T
}

/**
 * Export convenience functions for direct use
 */
export { createAPILogger, logAPIRequest, logAPIResponse } from './api-logger'