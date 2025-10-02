/**
 * Simple Logger - Backward compatibility wrapper
 * Wraps the new simplified logger (log.*) with the old SimpleLogger interface
 */

import { log } from './logger';
import type { LoggerConfig } from './universal-logger';

export interface SimpleLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): SimpleLogger;
  timing(message: string, startTime: number, data?: Record<string, unknown>): void;
  withRequest(request: unknown): SimpleLogger;
  withUser(userId: string, organizationId?: string): SimpleLogger;
  http(message: string, statusCode: number, duration?: number, data?: Record<string, unknown>): void;
  db(operation: string, table: string, duration?: number, context?: Record<string, unknown>): void;
  auth(action: string, success: boolean, context?: Record<string, unknown>): void;
  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Record<string, unknown>): void;
}

/**
 * AppLogger - Backward compatibility wrapper around simplified logger
 * Maintains context from factory creation
 */
export class AppLogger implements SimpleLogger {
  constructor(
    private module: string,
    private defaultContext?: Record<string, unknown>,
    private config?: LoggerConfig
  ) {}

  private mergeContext(data?: Record<string, unknown>): Record<string, unknown> {
    return {
      module: this.module,
      ...this.defaultContext,
      ...data,
    };
  }

  info(message: string, data?: Record<string, unknown>): void {
    log.info(message, this.mergeContext(data));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    log.warn(message, this.mergeContext(data));
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    if (error instanceof Error) {
      log.error(message, error, this.mergeContext(data));
    } else if (error && typeof error === 'object') {
      // If error is actually data (old API compatibility)
      log.error(message, undefined, this.mergeContext(error as Record<string, unknown>));
    } else {
      log.error(message, undefined, this.mergeContext(data));
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    log.debug(message, this.mergeContext(data));
  }

  child(context: Record<string, unknown>): SimpleLogger {
    // Create a new logger with merged context
    return new AppLogger(this.module, this.mergeContext(context), this.config);
  }

  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    log.timing(message, startTime, this.mergeContext(data));
  }

  withRequest(request: unknown): SimpleLogger {
    // Return same instance - context is merged in each call
    return this;
  }

  withUser(userId: string, organizationId?: string): SimpleLogger {
    // Return same instance - context is merged in each call
    return this;
  }

  http(message: string, statusCode: number, duration?: number, data?: Record<string, unknown>): void {
    log.info(message, this.mergeContext({ statusCode, duration, ...data }));
  }

  db(operation: string, table: string, duration?: number, context?: Record<string, unknown>): void {
    log.db(operation, table, duration, this.mergeContext(context));
  }

  auth(action: string, success: boolean, context?: Record<string, unknown>): void {
    log.auth(action, success, this.mergeContext(context));
  }

  security(event: string, severity: 'low' | 'medium' | 'high' | 'critical', context?: Record<string, unknown>): void {
    log.security(event, severity, this.mergeContext(context));
  }
}
