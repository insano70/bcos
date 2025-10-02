/**
 * Simplified Logger - Streamlined Edge-based Logging
 * Preserves all valuable enhanced features without adapter complexity
 */

import type { LoggerConfig } from './universal-logger';

/**
 * Simplified logger interface (matches UniversalLogger for compatibility)
 */
export interface SimpleLogger {
  // Basic logging methods
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;

  // Context management
  child(context: Record<string, unknown>, module?: string): SimpleLogger;
  withRequest(request: Request | { headers: Headers; url: string; method: string }): SimpleLogger;
  withUser(userId: string, organizationId?: string): SimpleLogger;

  // Specialized logging methods (enhanced features)
  timing(message: string, startTime: number, data?: Record<string, unknown>): void;
  http(
    message: string,
    statusCode: number,
    duration?: number,
    data?: Record<string, unknown>
  ): void;
  db(operation: string, table: string, duration?: number, data?: Record<string, unknown>): void;
  auth(action: string, success: boolean, data?: Record<string, unknown>): void;
  security(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    data?: Record<string, unknown>
  ): void;
}

/**
 * Log entry structure for sanitization purposes
 */
interface LogEntry {
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  module?: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
}

/**
 * Streamlined Logger Implementation
 * Preserves all valuable EdgeAdapter features without abstraction complexity
 */
export class AppLogger implements SimpleLogger {
  private context: Record<string, unknown>;
  private config: LoggerConfig;

  constructor(
    private module: string,
    context: Record<string, unknown> = {},
    config: LoggerConfig = {}
  ) {
    this.context = { ...context };
    this.config = {
      level: 'info',
      format: 'json',
      sanitizeData: true,
      silent: false,
      ...config,
    };
  }

  // Basic logging methods
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData =
      error instanceof Error
        ? {
            error: error.message,
            stack: error.stack,
            ...data,
          }
        : {
            error: String(error),
            ...data,
          };
    this.log('error', message, errorData);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  // Context management (preserved valuable features)
  child(childContext: Record<string, unknown>, childModule?: string): SimpleLogger {
    return new AppLogger(
      childModule || this.module,
      { ...this.context, ...childContext },
      this.config
    );
  }

  withRequest(request: Request | { headers: Headers; url: string; method: string }): SimpleLogger {
    const requestContext = {
      requestUrl: request.url,
      requestMethod: 'method' in request ? request.method : 'GET',
    };
    return this.child(requestContext);
  }

  withUser(userId: string, organizationId?: string): SimpleLogger {
    const userContext = {
      userId,
      ...(organizationId && { organizationId }),
    };
    return this.child(userContext);
  }

  // Specialized logging methods (enhanced features preserved)
  timing(message: string, startTime: number, data?: Record<string, unknown>): void {
    const duration = Date.now() - startTime;
    this.info(message, { duration, performanceOptimized: duration < 100, ...data });
  }

  http(
    message: string,
    statusCode: number,
    duration?: number,
    data?: Record<string, unknown>
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.log(level, message, { statusCode, duration, ...data });
  }

  db(operation: string, table: string, duration?: number, data?: Record<string, unknown>): void {
    this.debug(`Database: ${operation} on ${table}`, {
      operation,
      table,
      duration,
      performance: duration
        ? duration < 100
          ? 'fast'
          : duration < 500
            ? 'moderate'
            : 'slow'
        : 'unknown',
      ...data,
    });
  }

  auth(action: string, success: boolean, data?: Record<string, unknown>): void {
    const level = success ? 'info' : 'warn';
    this.log(level, `Auth: ${action}`, { action, success, component: 'authentication', ...data });
  }

  security(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    data?: Record<string, unknown>
  ): void {
    const level =
      severity === 'critical' || severity === 'high'
        ? 'error'
        : severity === 'medium'
          ? 'warn'
          : 'info';
    this.log(level, `Security: ${event}`, { severity, component: 'security', ...data });
  }

  /**
   * Core logging implementation with enhanced features preserved
   */
  private log(level: string, message: string, data?: Record<string, unknown>): void {
    if (this.config.silent) return;

    // Log level filtering
    if (!this.shouldLog(level)) return;

    // Build enhanced log entry (preserve valuable structured logging)
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message,
      module: this.module,
      service: 'bendcare-os',
      environment: this.getEnvironment(),
      runtime: 'edge' as const,
      metadata: this.buildMetadata(data),
    };

    // PII sanitization (preserve healthcare compliance)
    const sanitizedEntry = this.config.sanitizeData ? this.sanitizeLogEntry(logEntry) : logEntry;

    // Console output with proper method selection
    const consoleMethod = this.getConsoleMethod(level);

    if (this.config.format === 'pretty') {
      this.logPretty(level, message, sanitizedEntry.metadata as Record<string, unknown>);
    } else {
      consoleMethod(JSON.stringify(sanitizedEntry));
    }
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = { debug: 3, info: 2, warn: 1, error: 0 };
    const configLevel = levels[this.config.level || 'info'] ?? 2; // default to info level
    const logLevel = levels[level] ?? 2; // default to info level if unknown
    return logLevel <= configLevel;
  }

  private getEnvironment(): string {
    try {
      return process.env.NODE_ENV || 'development';
    } catch {
      return 'edge';
    }
  }

  private buildMetadata(data?: Record<string, unknown>): Record<string, unknown> {
    const metadata = {
      ...this.context,
      ...(data || {}),
    };

    // Apply field suppression if configured
    if (this.config.suppressFields && this.config.suppressFields.length > 0) {
      const suppressed = { ...metadata };
      this.config.suppressFields.forEach((field) => {
        delete suppressed[field];
      });
      return suppressed;
    }

    return metadata;
  }

  /**
   * PII Sanitization (preserve healthcare compliance features)
   */
  private sanitizeLogEntry(entry: LogEntry): LogEntry {
    const sanitized = { ...entry };

    // Sanitize sensitive data patterns
    if (sanitized.metadata) {
      sanitized.metadata = this.sanitizeData(sanitized.metadata) as Record<string, unknown>;
    }

    return sanitized;
  }

  private sanitizeData(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeData(item));
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Healthcare-specific PII sanitization
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeStringValue(key, value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'ssn',
      'medicalRecordNumber',
      'patientId',
      'email',
      'phone',
      'address',
    ];

    const lowerKey = key.toLowerCase();

    // More specific auth-related patterns (avoid over-broad 'auth' matching)
    if (lowerKey.includes('auth')) {
      // Only redact if it's clearly sensitive auth data
      return (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('password') ||
        lowerKey === 'authorization' ||
        lowerKey === 'auth_token' ||
        lowerKey === 'access_token' ||
        lowerKey === 'refresh_token'
      );
    }

    return sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive));
  }

  private sanitizeStringValue(_key: string, value: string): string {
    // UUID pattern sanitization
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return '[UUID]';
    }

    // Email pattern sanitization
    if (value.includes('@') && value.includes('.')) {
      return '[EMAIL]';
    }

    return value;
  }

  private getConsoleMethod(level: string): (message: string) => void {
    switch (level) {
      case 'error':
        return console.error;
      case 'warn':
        return console.warn;
      case 'debug':
        return console.debug;
      default:
        return console.log;
    }
  }

  private logPretty(level: string, message: string, metadata: Record<string, unknown>): void {
    const emoji =
      level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : 'ℹ️';
    console.log(`${emoji} [${this.module}] ${message}`, metadata);
  }
}

/**
 * Factory functions (maintain backward compatibility)
 */
export function createSimpleLogger(
  module: string,
  context?: Record<string, unknown>,
  config?: LoggerConfig
): SimpleLogger {
  return new AppLogger(module, context, config);
}
