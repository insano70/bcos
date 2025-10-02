/**
 * Universal Logger Interface
 * Provides a consistent logging API that works across Node.js and Edge Runtime
 */

// Re-export existing types for compatibility
// LogContext and LogData types defined locally
export type LogContext = Record<string, unknown>;
export type LogData = Record<string, unknown>;

/**
 * Universal logger interface that provides all logging functionality
 * regardless of runtime environment
 */
export interface UniversalLogger {
  // Basic logging methods
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;

  // Context management
  child(context: Record<string, unknown>, module?: string): UniversalLogger;
  withRequest(
    request: Request | { headers: Headers; url: string; method: string }
  ): UniversalLogger;
  withUser(userId: string, organizationId?: string): UniversalLogger;

  // Specialized logging methods (matching existing API)
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
 * Logger adapter interface for different runtime implementations
 */
export interface LoggerAdapter {
  createLogger(module: string, context?: Record<string, unknown>): UniversalLogger;
  isAvailable(): boolean;
}

/**
 * Runtime-specific logger configuration
 */
export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'pretty';
  silent?: boolean;
  sanitizeData?: boolean;
  suppressFields?: string[];
}

/**
 * Log metadata that can be attached to any log entry
 */
export interface LogMetadata {
  // Request context
  requestId?: string;
  correlationId?: string;

  // User context
  userId?: string;
  organizationId?: string;

  // Request details
  method?: string;
  path?: string;
  userAgent?: string;
  ipAddress?: string;

  // Performance data
  duration?: number;
  statusCode?: number;

  // Database context
  table?: string;
  operation?: string;
  recordCount?: number;

  // Security context
  severity?: 'low' | 'medium' | 'high' | 'critical';

  // Additional custom metadata
  [key: string]: unknown;
}

/**
 * Standard log entry structure used across all adapters
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  module?: string;
  service: string;
  environment: string;
  runtime: 'nodejs' | 'edge';
  metadata?: LogMetadata;
}
