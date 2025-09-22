/**
 * Winston Logger Implementation
 * Production-grade logging with Next.js compatibility
 */

const winston = require('winston')
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

// Log data type for flexible metadata
export type LogData = Record<string, unknown>

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

  try {
    // Safe Winston format access with fallback
    const format = winston.format || {};
    const combine = format.combine || ((a: any) => a);
    const timestamp = format.timestamp || (() => ({}));
    const errors = format.errors || (() => ({}));
    const json = format.json || (() => ({}));
    const printf = format.printf || ((fn: any) => fn);

    const logger = winston.createLogger({
      level: logLevel,
      levels: LOG_LEVELS,
      format: combine(
        timestamp(),
        errors({ stack: true }),
        json(),
        printf((info: any) => {
        // Sanitize sensitive data
        const sanitized = sanitizeLogData({ ...info }) as LogData & {
          module?: string;
          userId?: string;
          duration?: number;
          timestamp?: string;
          level?: string;
          message?: string;
        }
        
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
            level: sanitized.level?.toUpperCase() || 'INFO',
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

  } catch (error) {
    // Fallback to simple console logger if Winston fails
    console.warn('Winston initialization failed, using fallback logger:', error);
    
    // Create a simple fallback logger that matches Winston interface
    return {
      log: (level: string, message: string, meta?: any) => {
        if (!isTest) {
          console.log(`[${level.toUpperCase()}] ${message}`, meta);
        }
      },
      info: (message: string, meta?: any) => {
        if (!isTest) {
          console.log(`[INFO] ${message}`, meta);
        }
      },
      warn: (message: string, meta?: any) => {
        if (!isTest) {
          console.warn(`[WARN] ${message}`, meta);
        }
      },
      error: (message: string, meta?: any) => {
        console.error(`[ERROR] ${message}`, meta);
      },
      debug: (message: string, meta?: any) => {
        if (isDevelopment) {
          console.debug(`[DEBUG] ${message}`, meta);
        }
      }
    } as any;
  }
}

/**
 * Sanitize sensitive data from log objects
 */
function sanitizeLogData(obj: unknown): LogData {
  if (!obj || typeof obj !== 'object') return obj as LogData

  const sanitized = { ...obj } as LogData
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
      sanitized[key] = (sanitized[key] as string)
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
    return this.child({ userId, ...(organizationId && { organizationId }) })
  }

  /**
   * Debug level logging
   */
  debug(message: string, data?: LogData): void {
    this.log('debug', message, data)
  }

  /**
   * Info level logging
   */
  info(message: string, data?: LogData): void {
    this.log('info', message, data)
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: LogData): void {
    this.log('warn', message, data)
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error | unknown, data?: LogData): void {
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
  timing(message: string, startTime: number, data?: LogData): void {
    const duration = Date.now() - startTime
    this.info(message, { duration, ...data })
  }

  /**
   * HTTP request/response logging
   */
  http(message: string, statusCode: number, duration?: number, data?: LogData): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    this.log(level, message, { statusCode, duration, ...data })
  }

  /**
   * Database operation logging
   */
  db(operation: string, table: string, duration?: number, data?: LogData): void {
    this.debug(`DB ${operation}`, { table, duration, ...data })
  }

  /**
   * Authentication/authorization logging
   */
  auth(action: string, success: boolean, data?: LogData): void {
    const level = success ? 'info' : 'warn'
    this.log(level, `Auth: ${action}`, { success, ...data })
  }

  /**
   * Security event logging
   */
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', data?: LogData): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' :
                  severity === 'medium' ? 'warn' : 'info'

    this.log(level, `Security: ${event}`, { severity, ...data })
  }

  /**
   * Core logging method
   */
  private log(level: string, message: string, data?: LogData): void {
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
