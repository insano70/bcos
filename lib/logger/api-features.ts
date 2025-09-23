/**
 * Enhanced API Logging Features
 * Specialized utilities for comprehensive API request/response logging
 */

import type { NextRequest } from 'next/server'
import type { UniversalLogger } from './universal-logger'
import { createAppLogger } from './factory'

// Enhanced interfaces for API logging
export interface APIRequestContext extends Record<string, unknown> {
  requestId: string
  method: string
  path: string
  query?: Record<string, string>
  userAgent?: string | undefined
  ipAddress?: string | undefined
  contentType?: string | undefined
  contentLength?: number | undefined
  timestamp: number
}

export interface APIResponseContext {
  statusCode: number
  duration: number
  responseSize?: number
  cacheHit?: boolean
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export interface APISecurityContext {
  authType?: 'bearer' | 'session' | 'api-key' | 'none'
  userId?: string
  organizationId?: string
  permissions?: string[]
  rateLimit?: {
    limit: number
    remaining: number
    resetTime: Date
  }
  suspicious?: boolean
  blockedReason?: string
}

/**
 * Enhanced API Logger with comprehensive features
 * Provides specialized logging for API operations with security and performance tracking
 */
export class APILogger {
  private logger: UniversalLogger
  private startTime: number
  private requestContext: APIRequestContext

  constructor(
    request: NextRequest,
    module: string = 'api'
  ) {
    this.startTime = Date.now()
    this.requestContext = this.buildRequestContext(request)
    this.logger = createAppLogger(module, this.requestContext)
  }

  /**
   * Build comprehensive request context from NextRequest
   */
  private buildRequestContext(request: NextRequest): APIRequestContext {
    const url = new URL(request.url)
    const searchParams = Object.fromEntries(url.searchParams)
    
    return {
      requestId: this.generateRequestId(),
      method: request.method,
      path: url.pathname,
      query: Object.keys(searchParams).length > 0 ? searchParams : {} as Record<string, string>,
      userAgent: request.headers.get('user-agent') || undefined,
      ipAddress: this.extractIPAddress(request),
      contentType: request.headers.get('content-type') || undefined,
      contentLength: request.headers.get('content-length') ? 
        parseInt(request.headers.get('content-length')!, 10) : undefined,
      timestamp: this.startTime
    }
  }

  /**
   * Log API request initiation
   */
  logRequest(securityContext?: Partial<APISecurityContext>): void {
    this.logger.info('API Request Started', {
      ...this.requestContext,
      security: securityContext && Object.keys(securityContext).length > 0 ? 
        securityContext : undefined,
      headers: this.sanitizeHeaders(this.getHeaders())
    })
  }

  /**
   * Log API response completion
   */
  logResponse(
    statusCode: number,
    responseData?: {
      size?: number
      cacheHit?: boolean
      recordCount?: number
      processingTimeBreakdown?: Record<string, number>
    },
    error?: Error
  ): void {
    const duration = Date.now() - this.startTime
    const level = statusCode >= 500 ? 'error' : 
                 statusCode >= 400 ? 'warn' : 'info'

    const responseContext: APIResponseContext = {
      statusCode,
      duration,
      ...(responseData?.size !== undefined && { responseSize: responseData.size }),
      ...(responseData?.cacheHit !== undefined && { cacheHit: responseData.cacheHit })
    }

    if (error) {
      responseContext.error = {
        name: error.name,
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && error.stack && { stack: error.stack })
      }
    }

    this.logger[level]('API Request Completed', {
      ...responseContext,
      recordCount: responseData?.recordCount,
      performance: responseData?.processingTimeBreakdown,
      // Flag slow requests
      slow: duration > 1000,
      veryslow: duration > 5000
    })
  }

  /**
   * Log database operations with performance tracking
   */
  logDatabase(
    operation: string,
    table: string,
    options?: {
      duration?: number
      recordCount?: number
      queryComplexity?: 'simple' | 'complex' | 'aggregate'
      cacheHit?: boolean
      indexUsed?: boolean
    }
  ): void {
    const duration = options?.duration || Date.now() - this.startTime
    
    this.logger.db(operation, table, duration, {
      recordCount: options?.recordCount,
      queryComplexity: options?.queryComplexity,
      cacheHit: options?.cacheHit,
      indexUsed: options?.indexUsed,
      slow: duration > 500,
      veryString: duration > 2000
    })
  }

  /**
   * Log authentication events with detailed context
   */
  logAuth(
    action: string,
    success: boolean,
    details?: {
      userId?: string
      method?: 'session' | 'bearer' | 'api-key'
      reason?: string
      organizationId?: string
      permissions?: string[]
      sessionDuration?: number
    }
  ): void {
    this.logger.auth(action, success, {
      ...details,
      ipAddress: this.requestContext.ipAddress,
      userAgent: this.requestContext.userAgent
    })
  }

  /**
   * Log validation errors with field-specific details
   */
  logValidation(
    errors: Array<{
      field: string
      value?: unknown
      message: string
      code?: string
    }>
  ): void {
    this.logger.warn('Validation Errors', {
      errorCount: errors.length,
      errors: errors.map(err => ({
        field: err.field,
        message: err.message,
        code: err.code,
        value: this.sanitizeValue(err.value)
      }))
    })
  }

  /**
   * Log rate limiting events
   */
  logRateLimit(
    limit: number,
    remaining: number,
    resetTime: Date,
    action?: 'warn' | 'block'
  ): void {
    this.logger.warn('Rate Limit Applied', {
      limit,
      remaining,
      resetTime: resetTime.toISOString(),
      action: action || 'warn',
      severity: remaining === 0 ? 'high' : 'medium'
    })
  }

  /**
   * Log security events with severity levels
   */
  logSecurity(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: {
      blocked?: boolean
      reason?: string
      threat?: string
      action?: string
      userId?: string
    }
  ): void {
    this.logger.security(event, severity, {
      ...details,
      ipAddress: this.requestContext.ipAddress,
      userAgent: this.requestContext.userAgent,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Log business logic operations
   */
  logBusiness(
    operation: string,
    entity: string,
    outcome: 'success' | 'failure' | 'partial',
    metrics?: {
      recordsProcessed?: number
      duration?: number
      businessRules?: string[]
      notifications?: number
    }
  ): void {
    const level = outcome === 'failure' ? 'error' : 
                 outcome === 'partial' ? 'warn' : 'info'

    this.logger[level](`Business Operation: ${operation}`, {
      entity,
      outcome,
      ...metrics,
      duration: metrics?.duration || Date.now() - this.startTime
    })
  }

  /**
   * Log external API calls
   */
  logExternalAPI(
    service: string,
    endpoint: string,
    method: string,
    outcome: 'success' | 'failure' | 'timeout',
    metrics?: {
      duration?: number
      statusCode?: number
      retryAttempts?: number
      cached?: boolean
    }
  ): void {
    const level = outcome === 'failure' ? 'error' : 
                 outcome === 'timeout' ? 'warn' : 'info'

    this.logger[level]('External API Call', {
      service,
      endpoint,
      method,
      outcome,
      ...metrics,
      duration: metrics?.duration || Date.now() - this.startTime
    })
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, unknown>, module?: string): UniversalLogger {
    return this.logger.child(context, module)
  }

  /**
   * Get the underlying universal logger for direct access
   */
  getLogger(): UniversalLogger {
    return this.logger
  }

  // Helper methods

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private extractIPAddress(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
           request.headers.get('x-real-ip') ||
           request.headers.get('cf-connecting-ip') ||
           'unknown'
  }

  private getHeaders(): Record<string, string> {
    // This would need to be passed in or stored during construction
    // For now, return empty object as we don't have access to raw headers
    return {}
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {}
    const sensitiveHeaders = [
      'authorization', 'cookie', 'x-api-key', 'x-auth-token',
      'x-access-token', 'set-cookie', 'proxy-authorization'
    ]
    
    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.some(sh => key.toLowerCase().includes(sh))) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = value
      }
    }
    
    return sanitized
  }

  private sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value
        .replace(/password/gi, '[PASSWORD]')
        .replace(/token/gi, '[TOKEN]')
        .replace(/key/gi, '[KEY]')
        .replace(/secret/gi, '[SECRET]')
    }
    return value
  }
}

/**
 * Factory function for creating enhanced API loggers
 */
export function createAPILogger(
  request: NextRequest,
  module?: string
): APILogger {
  return new APILogger(request, module)
}

/**
 * Middleware helper for automatic request/response logging
 */
export function withAPILogging<T>(
  handler: (request: NextRequest, logger: APILogger) => Promise<Response>,
  module?: string
): (request: NextRequest) => Promise<Response> {
  return async (request: NextRequest): Promise<Response> => {
    const logger = new APILogger(request, module)
    
    try {
      logger.logRequest()
      const response = await handler(request, logger)
      
      logger.logResponse(
        response.status,
        {
          ...(response.headers.get('content-length') && { 
            size: parseInt(response.headers.get('content-length')!, 10) 
          }),
          cacheHit: response.headers.get('x-cache-status') === 'HIT'
        }
      )
      
      return response
    } catch (error) {
      logger.logResponse(
        500,
        {},
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }
}

export default createAPILogger