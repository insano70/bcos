/**
 * Client-Side Logger Utility
 *
 * Provides standardized logging for client-side code with consistent
 * prefixes, development-only guards, and structured format.
 *
 * NOTE: This is for CLIENT-SIDE code only. Server-side code should
 * use the main logger from @/lib/logger.
 */

interface LogContext {
  [key: string]: unknown;
}

/**
 * Base logger class with standardized formatting
 */
class ClientLogger {
  constructor(private prefix: string) {}

  /**
   * Log info message (development only)
   */
  log(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      if (context) {
        console.log(`[${this.prefix}]`, message, context);
      } else {
        console.log(`[${this.prefix}]`, message);
      }
    }
  }

  /**
   * Log warning message (development only)
   */
  warn(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      if (context) {
        console.warn(`[${this.prefix}]`, message, context);
      } else {
        console.warn(`[${this.prefix}]`, message);
      }
    }
  }

  /**
   * Log error message (development only)
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      if (context) {
        console.error(`[${this.prefix}]`, message, error, context);
      } else if (error) {
        console.error(`[${this.prefix}]`, message, error);
      } else {
        console.error(`[${this.prefix}]`, message);
      }
    }
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      if (context) {
        console.debug(`[${this.prefix}]`, message, context);
      } else {
        console.debug(`[${this.prefix}]`, message);
      }
    }
  }
}

/**
 * Authentication system logger
 */
export const authLogger = new ClientLogger('Auth');

/**
 * API client logger
 */
export const apiClientLogger = new ClientLogger('API');

/**
 * Generic client logger factory
 */
export function createClientLogger(prefix: string): ClientLogger {
  return new ClientLogger(prefix);
}
