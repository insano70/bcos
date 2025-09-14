/**
 * Structured Logger Implementation
 * Provides consistent, performant logging across the application
 */

import pino from 'pino'
import { nanoid } from 'nanoid'
import { getLogConfig } from './config'

// Log levels configuration
export const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60
} as const

// Request context interface
export interface LogContext {
  requestId?: string
  userId?: string
  organizationId?: string
  ipAddress?: string
  userAgent?: string
  method?: string
  path?: string
  duration?: number
  statusCode?: number
}

// Logger configuration based on environment
const createLogger = () => {
  const config = getLogConfig()
  
  return pino({
    level: config.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: config.redact ? {
      paths: config.redact,
      censor: '[REDACTED]'
    } : undefined,
    formatters: config.formatters,
    serializers: config.serializers,
    transport: config.transport
  })
}

const baseLogger = createLogger()

/**
 * Enhanced Logger with Context Support
 */
class StructuredLogger {
  private context: LogContext = {}
  private module: string

  constructor(module: string, context: LogContext = {}) {
    this.module = module
    this.context = context
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Partial<LogContext>, module?: string): StructuredLogger {
    return new StructuredLogger(
      module || this.module,
      { ...this.context, ...context }
    )
  }

  /**
   * Add request context to logger
   */
  withRequest(request: Request | { headers: Headers; url: string; method: string }): StructuredLogger {
    const url = new URL(request.url)
    const requestContext: LogContext = {
      requestId: nanoid(10),
      method: request.method,
      path: url.pathname,
      ipAddress: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown'
    }

    return this.child(requestContext)
  }

  /**
   * Add user context to logger
   */
  withUser(userId: string, organizationId?: string): StructuredLogger {
    return this.child({ userId, organizationId })
  }

  /**
   * Trace level logging
   */
  trace(message: string, data?: any): void {
    this.log('trace', message, data)
  }

  /**
   * Debug level logging
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data)
  }

  /**
   * Info level logging
   */
  info(message: string, data?: any): void {
    this.log('info', message, data)
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data)
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | any, data?: any): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ...data
    } : { error, ...data }

    this.log('error', message, errorData)
  }

  /**
   * Fatal level logging
   */
  fatal(message: string, error?: Error | any, data?: any): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...data
    } : { error, ...data }

    this.log('fatal', message, errorData)
  }

  /**
   * Performance timing logging
   */
  timing(message: string, startTime: number, data?: any): void {
    const duration = Date.now() - startTime
    this.info(message, { duration, ...data })
  }

  /**
   * HTTP request/response logging
   */
  http(message: string, statusCode: number, duration?: number, data?: any): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    this.log(level, message, { statusCode, duration, ...data })
  }

  /**
   * Database operation logging
   */
  db(operation: string, table: string, duration?: number, data?: any): void {
    this.debug(`DB ${operation}`, { table, duration, ...data })
  }

  /**
   * Authentication/authorization logging
   */
  auth(action: string, success: boolean, data?: any): void {
    const level = success ? 'info' : 'warn'
    this.log(level, `Auth: ${action}`, { success, ...data })
  }

  /**
   * Security event logging
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', data?: any): void {
    const level = severity === 'critical' ? 'fatal' : 
                  severity === 'high' ? 'error' : 
                  severity === 'medium' ? 'warn' : 'info'
    
    this.log(level, `Security: ${event}`, { severity, ...data })
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, data?: any): void {
    const logData = {
      module: this.module,
      ...this.context,
      ...data
    }

    baseLogger[level as keyof typeof baseLogger](logData, message)
  }
}


/**
 * Factory function to create module-specific loggers
 */
export function createLogger(module: string, context?: LogContext): StructuredLogger {
  return new StructuredLogger(module, context)
}

/**
 * Default application logger
 */
export const logger = createLogger('app')

/**
 * Pre-configured domain loggers
 */
export const loggers = {
  auth: createLogger('auth'),
  db: createLogger('database'),
  api: createLogger('api'),
  rbac: createLogger('rbac'),
  security: createLogger('security'),
  email: createLogger('email'),
  webhooks: createLogger('webhooks'),
  upload: createLogger('upload'),
  system: createLogger('system')
}

export default logger
