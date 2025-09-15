/**
 * Winston Logger Implementation
 * Production-grade logging with Next.js compatibility
 */

import winston from 'winston'
import { nanoid } from 'nanoid'

// Log levels configuration
export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
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

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

/**
 * Create Winston logger with proper configuration
 */
function createWinstonLogger(): winston.Logger {
  const logLevel = isTest ? 'error' : 
                   isDevelopment ? 'debug' : 
                   (process.env.LOG_LEVEL || 'info')

  const logger = winston.createLogger({
    level: logLevel,
    levels: LOG_LEVELS,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf((info) => {
        // Sanitize sensitive data
        const sanitized = sanitizeLogData({ ...info })
        
        if (isDevelopment) {
          // Pretty format for development
          const emoji = info.level === 'error' ? '❌' : 
                       info.level === 'warn' ? '⚠️' : 
                       info.level === 'info' ? 'ℹ️' : '🔍'
          
          const module = sanitized.module ? `[${sanitized.module}]` : ''
          const context = sanitized.userId ? ` user:${sanitized.userId}` : ''
          const duration = sanitized.duration ? ` (${sanitized.duration}ms)` : ''
          
          return `${emoji} ${module} ${sanitized.message}${context}${duration}`
        } else {
          // JSON format for production
          return JSON.stringify({
            timestamp: sanitized.timestamp,
            level: sanitized.level.toUpperCase(),
            message: sanitized.message,
            service: 'bendcare-os',
            environment: process.env.NODE_ENV || 'unknown',
            ...sanitized
          })
        }
      })
    ),
    transports: [
      new winston.transports.Console({
        silent: isTest
      })
    ]
  })

  return logger
}

/**
 * Sanitize sensitive data from log objects
 */
function sanitizeLogData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj

  const sanitized = { ...obj }
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'auth', 'authorization', 'cookie',
    // Healthcare-specific PII
    'ssn', 'social_security_number', 'date_of_birth', 'dob', 'phone', 
    'phone_number', 'email', 'address', 'medical_record_number', 
    'patient_id', 'insurance_number'
  ]

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitized[key]
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key])
    }
  }

  return sanitized
}

// Singleton logger instance
let baseLogger: winston.Logger | null = null

function getBaseLogger(): winston.Logger {
  if (!baseLogger) {
    baseLogger = createWinstonLogger()
  }
  return baseLogger
}

/**
 * Enhanced Logger with Context Support
 */
export class StructuredLogger {
  private context: LogContext = {}
  private module: string

  constructor(module: string, context: LogContext = {}) {
    this.module = module
    this.context = { ...context }
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
    try {
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
    } catch {
      return this.child({ requestId: nanoid(10) })
    }
  }

  /**
   * Add user context to logger
   */
  withUser(userId: string, organizationId?: string): StructuredLogger {
    return this.child({ userId, organizationId })
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
      stack: isDevelopment ? error.stack : undefined,
      ...data
    } : { error, ...data }

    this.log('error', message, errorData)
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
    const level = severity === 'critical' || severity === 'high' ? 'error' : 
                  severity === 'medium' ? 'warn' : 'info'
    
    this.log(level, `Security: ${event}`, { severity, ...data })
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, data?: any): void {
    const logger = getBaseLogger()
    
    const logData = {
      module: this.module,
      ...this.context,
      ...data
    }

    logger.log(level, message, logData)
  }
}

/**
 * Factory function to create module-specific loggers
 */
export function createAppLogger(module: string, context?: LogContext): StructuredLogger {
  return new StructuredLogger(module, context)
}

/**
 * Default application logger
 */
export const logger = createAppLogger('app')

/**
 * Pre-configured domain loggers
 */
export const loggers = {
  auth: createAppLogger('auth'),
  db: createAppLogger('database'),
  api: createAppLogger('api'),
  rbac: createAppLogger('rbac'),
  security: createAppLogger('security'),
  email: createAppLogger('email'),
  webhooks: createAppLogger('webhooks'),
  upload: createAppLogger('upload'),
  system: createAppLogger('system')
}

export default logger
