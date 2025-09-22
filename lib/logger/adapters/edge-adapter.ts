/**
 * Edge Runtime Logger Adapter
 * Console-based logging for Edge Runtime environments
 */

import type { UniversalLogger, LoggerAdapter, LoggerConfig, LogMetadata } from '../universal-logger'

/**
 * Edge Runtime implementation of UniversalLogger
 * Uses console logging with structured data formatting
 */
class EdgeUniversalLogger implements UniversalLogger {
  private context: Record<string, unknown>
  private config: LoggerConfig
  
  constructor(
    private module: string,
    context: Record<string, unknown> = {},
    config: LoggerConfig = {}
  ) {
    this.context = { ...context }
    this.config = {
      level: 'info',
      format: 'json',
      sanitizeData: true,
      silent: false,
      ...config
    }
  }

  // Basic logging methods
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    let errorData = data || {}
    
    if (error instanceof Error) {
      errorData = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        ...errorData
      }
    } else if (error) {
      errorData = { error, ...errorData }
    }
    
    this.log('error', message, errorData)
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data)
  }

  // Context management
  child(context: Record<string, unknown>, module?: string): UniversalLogger {
    return new EdgeUniversalLogger(
      module || this.module,
      { ...this.context, ...context },
      this.config
    )
  }

  withRequest(request: Request | { headers: Headers; url: string; method: string }): UniversalLogger {
    try {
      const url = new URL(request.url)
      const requestContext: Record<string, unknown> = {
        requestId: this.generateRequestId(),
        method: request.method,
        path: url.pathname,
        userAgent: request.headers.get('user-agent') || 'unknown',
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
      }
      
      return this.child(requestContext)
    } catch {
      return this.child({ requestId: this.generateRequestId() })
    }
  }

  withUser(userId: string, organizationId?: string): UniversalLogger {
    const userContext: Record<string, unknown> = { userId }
    if (organizationId) {
      userContext.organizationId = organizationId
    }
    return this.child(userContext)
  }

  // Specialized logging methods
  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    const duration = Date.now() - startTime
    this.info(message, { duration, ...data })
  }

  http(message: string, statusCode: number, duration?: number, data?: Record<string, unknown>): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    this.log(level, message, { statusCode, duration, ...data })
  }

  db(operation: string, table: string, duration?: number, data?: Record<string, unknown>): void {
    this.debug(`DB ${operation}`, { table, duration, ...data })
  }

  auth(action: string, success: boolean, data?: Record<string, unknown>): void {
    const level = success ? 'info' : 'warn'
    this.log(level, `Auth: ${action}`, { success, ...data })
  }

  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', data?: Record<string, unknown>): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' :
                  severity === 'medium' ? 'warn' : 'info'
    this.log(level, `Security: ${event}`, { severity, ...data })
  }

  /**
   * Core logging implementation
   */
  private log(level: string, message: string, data?: Record<string, unknown>): void {
    if (this.config.silent) return
    
    // Check if log level should be output
    if (!this.shouldLog(level)) return
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      module: this.module,
      service: 'bendcare-os',
      environment: this.getEnvironment(),
      runtime: 'edge' as const,
      metadata: this.buildMetadata(data)
    }
    
    const sanitizedEntry = this.config.sanitizeData ? 
      this.sanitizeLogEntry(logEntry) : logEntry
    
    // Use appropriate console method
    const consoleMethod = this.getConsoleMethod(level)
    
    if (this.config.format === 'pretty') {
      this.logPretty(level, message, sanitizedEntry.metadata as LogMetadata)
    } else {
      consoleMethod(JSON.stringify(sanitizedEntry))
    }
  }
  
  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = { debug: 3, info: 2, warn: 1, error: 0 }
    const configLevel = this.config.level || 'info'
    const levelValue = levels[level]
    const configLevelValue = levels[configLevel]
    return levelValue !== undefined && configLevelValue !== undefined && levelValue <= configLevelValue
  }
  
  private buildMetadata(data?: Record<string, unknown>): LogMetadata {
    return {
      ...this.context,
      ...data
    } as LogMetadata
  }
  
  private getConsoleMethod(level: string): (...args: unknown[]) => void {
    switch (level) {
      case 'error': return console.error
      case 'warn': return console.warn  
      case 'debug': return console.debug
      default: return console.info
    }
  }
  
  private logPretty(level: string, message: string, metadata?: LogMetadata): void {
    const emoji = level === 'error' ? '❌' : 
                 level === 'warn' ? '⚠️' : 
                 level === 'info' ? 'ℹ️' : '🔍'
    
    const module = this.module ? `[${this.module}]` : ''
    const userId = metadata?.userId ? ` user:${metadata.userId}` : ''
    const duration = metadata?.duration ? ` (${metadata.duration}ms)` : ''
    
    console.info(`${emoji} ${module} ${message}${userId}${duration}`)
    
    if (metadata && Object.keys(metadata).length > 0) {
      console.info('  └─', metadata)
    }
  }
  
  private sanitizeLogEntry(entry: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(entry, this.sanitizer))
  }
  
  private sanitizer = (key: string, value: unknown): unknown => {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'auth', 'authorization', 'cookie',
      'ssn', 'social_security_number', 'date_of_birth', 'dob', 'phone', 
      'phone_number', 'email', 'address', 'medical_record_number', 
      'patient_id', 'insurance_number'
    ]
    
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      return '[REDACTED]'
    }
    
    if (typeof value === 'string') {
      return value
        .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
        .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gi, '[EMAIL]')
    }
    
    return value
  }
  
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  private getEnvironment(): string {
    try {
      return process?.env?.NODE_ENV || 'unknown'
    } catch {
      return 'edge'
    }
  }
}

/**
 * Edge Runtime Logger Adapter
 * Creates UniversalLogger instances for Edge Runtime
 */
export class EdgeLoggerAdapter implements LoggerAdapter {
  constructor(private config?: LoggerConfig) {}

  createLogger(module: string, context?: Record<string, unknown>): UniversalLogger {
    return new EdgeUniversalLogger(module, context, this.config)
  }

  isAvailable(): boolean {
    // Edge adapter is always available as it only uses console
    return typeof console !== 'undefined'
  }
}