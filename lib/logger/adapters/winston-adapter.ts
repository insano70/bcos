/**
 * Winston Logger Adapter
 * Wraps existing Winston-based StructuredLogger as UniversalLogger
 */

import type { UniversalLogger, LoggerAdapter, LoggerConfig } from '../universal-logger'
import { type StructuredLogger, createAppLogger } from '../winston-logger'

/**
 * Winston-based implementation of UniversalLogger
 */
class WinstonUniversalLogger implements UniversalLogger {
  constructor(private winstonLogger: StructuredLogger) {}

  // Basic logging methods - delegate to winston logger
  info(message: string, data?: Record<string, unknown>): void {
    this.winstonLogger.info(message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.winstonLogger.warn(message, data)
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.winstonLogger.error(message, error, data)
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.winstonLogger.debug(message, data)
  }

  // Context management
  child(context: Record<string, unknown>, module?: string): UniversalLogger {
    const childLogger = this.winstonLogger.child(context, module)
    return new WinstonUniversalLogger(childLogger)
  }

  withRequest(request: Request | { headers: Headers; url: string; method: string }): UniversalLogger {
    const requestLogger = this.winstonLogger.withRequest(request)
    return new WinstonUniversalLogger(requestLogger)
  }

  withUser(userId: string, organizationId?: string): UniversalLogger {
    const userLogger = this.winstonLogger.withUser(userId, organizationId)
    return new WinstonUniversalLogger(userLogger)
  }

  // Specialized logging methods - delegate to existing methods
  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    this.winstonLogger.timing(message, startTime, data)
  }

  http(message: string, statusCode: number, duration?: number, data?: Record<string, unknown>): void {
    this.winstonLogger.http(message, statusCode, duration, data)
  }

  db(operation: string, table: string, duration?: number, data?: Record<string, unknown>): void {
    this.winstonLogger.db(operation, table, duration, data)
  }

  auth(action: string, success: boolean, data?: Record<string, unknown>): void {
    this.winstonLogger.auth(action, success, data)
  }

  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', data?: Record<string, unknown>): void {
    this.winstonLogger.security(event, severity, data)
  }
}

/**
 * Winston Logger Adapter
 * Creates UniversalLogger instances backed by Winston
 */
export class WinstonLoggerAdapter implements LoggerAdapter {
  constructor(private config?: LoggerConfig) {}

  createLogger(module: string, context?: Record<string, unknown>): UniversalLogger {
    const winstonLogger = createAppLogger(module, context)
    return new WinstonUniversalLogger(winstonLogger)
  }

  isAvailable(): boolean {
    try {
      // Check if winston and Node.js APIs are available
      return typeof process !== 'undefined' && 
             typeof process.env !== 'undefined' &&
             typeof require !== 'undefined'
    } catch {
      return false
    }
  }
}