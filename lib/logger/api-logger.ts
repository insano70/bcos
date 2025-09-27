/**
 * API Request/Response Logger
 * Provides structured HTTP logging with performance metrics
 */

import type { NextRequest } from 'next/server'
import { createAppLogger } from './factory'
import type { LogContext } from './universal-logger'

// Logger interface for API logging functions
interface APILogger {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => void
  debug: (message: string, data?: Record<string, unknown>) => void
}

const apiLogger = createAppLogger('api')

export interface APILogContext extends LogContext {
  requestId: string
  method: string
  path: string
  query?: Record<string, string>
  userAgent?: string
  ipAddress?: string
}

/**
 * Create API logger with request context
 */
export function createAPILogger(request: NextRequest) {
  const url = new URL(request.url)
  const searchParams = Object.fromEntries(url.searchParams)
  
  const context: APILogContext = {
    requestId: generateRequestId(),
    method: request.method,
    path: url.pathname,
    query: Object.keys(searchParams).length > 0 ? searchParams : {} as Record<string, string>,
    ipAddress: extractIPAddress(request),
    ...(request.headers.get('user-agent') && { userAgent: request.headers.get('user-agent') || 'Unknown' })
  }

  return apiLogger.child(context)
}

/**
 * Log API request start
 */
export function logAPIRequest(logger: APILogger, request: NextRequest): void {
  const contentLength = request.headers.get('content-length')
  
  logger.info('API Request Started', {
    contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
    headers: sanitizeHeaders(request.headers)
  })
}

/**
 * Log API response
 */
export function logAPIResponse(
  logger: APILogger,
  statusCode: number,
  startTime: number,
  responseSize?: number,
  error?: Error
): void {
  const duration = Date.now() - startTime
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'

  const logData: Record<string, unknown> = {
    statusCode,
    duration,
    responseSize
  }

  if (error) {
    logData.error = {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  }

  logger[level]('API Request Completed', logData)
}

/**
 * Log database operations within API calls
 */
export function logDBOperation(
  logger: APILogger,
  operation: string,
  table: string,
  startTime: number,
  recordCount?: number
): void {
  const duration = Date.now() - startTime
  
  logger.debug('Database Operation', {
    operation,
    table,
    duration,
    recordCount
  })
}

/**
 * Log authentication events within API calls
 */
export function logAPIAuth(
  logger: APILogger,
  action: string,
  success: boolean,
  userId?: string,
  reason?: string
): void {
  const level = success ? 'info' : 'warn'
  
  logger[level]('API Authentication', {
    action,
    success,
    userId,
    reason
  })
}

/**
 * Log validation errors
 */
export function logValidationError(
  logger: APILogger,
  field: string,
  value: unknown,
  message: string
): void {
  logger.warn('Validation Error', {
    field,
    value: sanitizeValue(value),
    message
  })
}

/**
 * Log rate limiting events
 */
export function logRateLimit(
  logger: APILogger,
  limit: number,
  remaining: number,
  resetTime: Date
): void {
  logger.warn('Rate Limit Applied', {
    limit,
    remaining,
    resetTime: resetTime.toISOString()
  })
}

/**
 * Log security events within API calls
 */
export function logSecurityEvent(
  logger: APILogger,
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details?: Record<string, unknown>
): void {
  const level = severity === 'critical' ? 'error' : 
                severity === 'high' ? 'error' : 
                severity === 'medium' ? 'warn' : 'info'
  
  logger[level]('Security Event', {
    event,
    severity,
    ...details
  })
}

/**
 * Performance monitoring for specific operations
 */
export function logPerformanceMetric(
  logger: APILogger,
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
): void {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug'
  
  logger[level]('Performance Metric', {
    operation,
    duration,
    slow: duration > 1000,
    ...metadata
  })
}

// Helper functions

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function extractIPAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') ||
         request.headers.get('x-real-ip') ||
         'unknown'
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {}
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
  
  headers.forEach((value, key) => {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  })
  
  return sanitized
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // Sanitize potential sensitive strings
    return value
      .replace(/password/gi, '[PASSWORD]')
      .replace(/token/gi, '[TOKEN]')
      .replace(/key/gi, '[KEY]')
  }
  return value
}

export default apiLogger
