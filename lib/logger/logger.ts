/**
 * BendCare OS Logging System
 *
 * Minimal, native console-based logging with automatic context capture,
 * CloudWatch integration, and HIPAA-compliant PII sanitization.
 *
 * Key Features:
 * - Full stack traces in error logs
 * - Automatic file:line:function capture
 * - Request correlation tracking via AsyncLocalStorage
 * - PII sanitization (emails, phones, SSNs, credit cards, etc.)
 * - Production sampling (1% debug, 10% info, 100% errors)
 * - CloudWatch-optimized JSON format
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';

/**
 * Request context stored in AsyncLocalStorage
 * Automatically propagated to all logs within async scope
 */
interface RequestContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  method?: string;
  path?: string;
  ipAddress?: string;
  userAgent?: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Correlation ID utilities
 * Used for request tracing and distributed operations
 */
export const correlation = {
  /**
   * Generate unique correlation ID
   */
  generate(): string {
    return `cor_${Date.now().toString(36)}_${nanoid(8)}`;
  },

  /**
   * Get current correlation ID from context
   */
  current(): string | undefined {
    return requestContext.getStore()?.correlationId;
  },

  /**
   * Run code within a correlation context
   * All logs within this scope will share the same correlation ID
   */
  async withContext<T>(
    correlationId: string,
    metadata: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const context: RequestContext = {
      correlationId,
      startTime: Date.now(),
      metadata,
    };
    return requestContext.run(context, fn);
  },

  /**
   * Add metadata to current context
   * Useful for adding context discovered during request processing
   */
  addMetadata(metadata: Record<string, unknown>): void {
    const ctx = requestContext.getStore();
    if (ctx) {
      Object.assign(ctx.metadata, metadata);
    }
  },

  /**
   * Set user context for current request
   * All subsequent logs will include user information
   */
  setUser(userId: string, organizationId?: string): void {
    const ctx = requestContext.getStore();
    if (ctx) {
      ctx.userId = userId;
      if (organizationId) ctx.organizationId = organizationId;
    }
  },

  /**
   * Set request details in context
   */
  setRequest(request: {
    method: string;
    path: string;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    const ctx = requestContext.getStore();
    if (ctx) {
      ctx.method = request.method;
      ctx.path = request.path;
      if (request.ipAddress) ctx.ipAddress = request.ipAddress;
      if (request.userAgent) ctx.userAgent = request.userAgent;
    }
  },
};

/**
 * HIPAA-compliant PII sanitization
 * Recursively redacts sensitive information from log data
 * Handles circular references safely
 */
function sanitize(obj: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;

  // Detect circular references
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'ssn',
    'socialsecurity',
    'medicalrecordnumber',
    'patientid',
    'email',
    'phone',
    'phonenumber',
    'address',
    'creditcard',
    'ccn',
    'cvv',
    'pin',
  ];

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive pattern
    const isSensitive = sensitiveKeys.some((sk) => lowerKey.includes(sk));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value, seen);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize string values that match PII patterns
 */
function sanitizeString(value: string): string {
  // Redact email patterns
  if (value.includes('@') && value.includes('.') && value.length < 100) {
    return '[EMAIL]';
  }

  // Redact UUID patterns
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return '[UUID]';
  }

  // Redact phone patterns (various formats)
  if (/\(?[\d]{3}\)?[\s.-]?[\d]{3}[\s.-]?[\d]{4}/.test(value)) {
    return '[PHONE]';
  }

  // Redact SSN patterns
  if (/\d{3}-\d{2}-\d{4}/.test(value)) {
    return '[SSN]';
  }

  // Redact credit card patterns
  if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(value)) {
    return '[CREDIT_CARD]';
  }

  return value;
}

/**
 * Serialize error object with full stack trace
 * Error objects are not enumerable, so JSON.stringify loses them
 * Handles circular references safely
 */
function serializeError(error: unknown, seen = new WeakSet<object>()): Record<string, unknown> {
  if (error instanceof Error) {
    // Prevent infinite recursion on circular references
    if (seen.has(error)) {
      return { circular: '[Circular Reference]' };
    }
    seen.add(error);

    const result: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      // Split stack into array for better CloudWatch parsing
      stack: error.stack?.split('\n').map((line) => line.trim()),
    };

    // Capture error cause chain (if present)
    if (error.cause) {
      result.cause = serializeError(error.cause, seen);
    }

    // Capture any custom properties on the error, safely handling circular refs
    const customProps = Object.getOwnPropertyNames(error).reduce(
      (acc, key) => {
        if (!['name', 'message', 'stack', 'cause'].includes(key)) {
          const value = (error as unknown as Record<string, unknown>)[key];

          // Handle different value types safely
          if (typeof value === 'object' && value !== null) {
            // Check for circular reference
            if (seen.has(value)) {
              acc[key] = '[Circular]';
            } else {
              // Try to safely serialize complex objects
              try {
                // Test if object can be serialized without circular refs
                JSON.stringify(value);
                acc[key] = value;
              } catch {
                // Object has circular refs or is non-serializable
                acc[key] = '[Non-serializable Object]';
              }
            }
          } else if (typeof value === 'function') {
            acc[key] = '[Function]';
          } else if (typeof value === 'symbol') {
            acc[key] = '[Symbol]';
          } else {
            // Primitive values are safe
            acc[key] = value;
          }
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    return { ...result, ...customProps };
  }

  // Not an Error object, just convert to string
  return { error: String(error) };
}

/**
 * Capture caller location (file, line, function)
 * Uses Error().stack parsing to determine where log was called from
 */
function captureLocation(): { file?: string; line?: number; function?: string } {
  const stack = new Error().stack;
  if (!stack) return {};

  // Parse stack trace to get caller info
  // Skip first 4 lines: Error, captureLocation, buildLogEntry, log method
  const lines = stack.split('\n');
  const callerLine = lines[4];

  if (!callerLine) return {};

  // Parse stack line format: "at functionName (file:line:column)" or "at file:line:column"
  const match = callerLine.match(/at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);
  if (!match) return {};

  const [, functionName, filePath, lineNumber] = match;

  // Extract just the filename from full path for readability
  const file = filePath ? filePath.split('/').pop() : undefined;
  const line = lineNumber ? parseInt(lineNumber, 10) : undefined;
  const func = functionName?.trim() || 'anonymous';

  const result: { file?: string; line?: number; function?: string } = {};
  if (file !== undefined) result.file = file;
  if (line !== undefined) result.line = line;
  if (func !== undefined) result.function = func;

  return result;
}

/**
 * Build complete log entry with all context
 * This is the core function that assembles the final log structure
 */
function buildLogEntry(
  level: string,
  message: string,
  error?: Error | unknown,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const ctx = requestContext.getStore();

  // PERFORMANCE: Only capture stack trace location for errors/warnings in production
  // In development, always capture for better debugging experience
  const shouldCaptureLocation =
    process.env.NODE_ENV !== 'production' ||
    level === 'error' ||
    level === 'warn' ||
    context?.captureLocation === true;

  const location = shouldCaptureLocation ? captureLocation() : {};

  // Extract correlation ID from AsyncLocalStorage OR request headers (edge runtime fallback)
  let correlationId = ctx?.correlationId;
  if (
    !correlationId &&
    context &&
    'request' in context &&
    context.request &&
    typeof context.request === 'object'
  ) {
    // Fallback to header-based correlation (works in Edge Runtime)
    const req = context.request as { headers?: { get: (key: string) => string | null } };
    if (req.headers && typeof req.headers.get === 'function') {
      correlationId = req.headers.get('x-correlation-id') ?? undefined;
    }
  }

  const entry: Record<string, unknown> = {
    // CloudWatch standard fields (@timestamp for automatic time indexing)
    '@timestamp': new Date().toISOString(),
    level: level.toUpperCase(),
    message,

    // Service identification
    service: 'bendcare-os',
    env: process.env.NODE_ENV || 'development',

    // Caller location (file:line:function)
    ...(location.file && { file: location.file }),
    ...(location.line && { line: location.line }),
    ...(location.function && { function: location.function }),

    // Correlation ID (from AsyncLocalStorage or request headers)
    ...(correlationId && { correlationId }),

    // Request context from AsyncLocalStorage
    ...(ctx && {
      ...(ctx.userId && { userId: ctx.userId }),
      ...(ctx.organizationId && { organizationId: ctx.organizationId }),
      ...(ctx.method && { method: ctx.method }),
      ...(ctx.path && { path: ctx.path }),
      ...(ctx.requestId && { requestId: ctx.requestId }),
      ...(ctx.ipAddress && { ipAddress: ctx.ipAddress }),
      ...(ctx.userAgent && { userAgent: ctx.userAgent }),
      // Add request duration if not explicitly provided
      ...(context?.duration === undefined && { duration: Date.now() - ctx.startTime }),
    }),
  };

  // Error details (properly serialized with stack trace)
  if (error) {
    entry.error = serializeError(error);
  }

  // Additional context (PII-sanitized)
  if (context) {
    const sanitized = sanitize(context);
    if (typeof sanitized === 'object' && sanitized !== null) {
      Object.assign(entry, sanitized);
    }
  }

  // Context metadata (if any)
  if (ctx?.metadata && Object.keys(ctx.metadata).length > 0) {
    const sanitized = sanitize(ctx.metadata);
    entry._contextMetadata = sanitized;
  }

  return entry;
}

/**
 * Sampling decision for production log volume optimization
 * Reduces log volume in production while preserving important logs
 */
function shouldLog(level: string, context?: Record<string, unknown>): boolean {
  // Always log in non-production
  if (process.env.NODE_ENV !== 'production') return true;

  // Always log errors and warnings
  if (level === 'error' || level === 'warn') return true;

  // Always log security events
  if (context?.component === 'security') return true;

  // Sample debug and info logs
  const samplingRates: Record<string, number> = {
    debug: 0.01, // 1% of debug logs
    info: 0.1, // 10% of info logs
  };

  const rate = samplingRates[level] ?? 1.0;
  return Math.random() < rate;
}

/**
 * Main logging interface
 * Use these methods throughout the application
 */
export const log = {
  /**
   * Info level logging
   * Use for general informational messages, successful operations
   */
  info(message: string, context?: Record<string, unknown>) {
    if (!shouldLog('info', context)) return;
    const entry = buildLogEntry('info', message, undefined, context);
    console.log(JSON.stringify(entry));
  },

  /**
   * Warning level logging
   * Use for potential issues, degraded performance, security warnings
   */
  warn(message: string, context?: Record<string, unknown>) {
    if (!shouldLog('warn', context)) return;
    const entry = buildLogEntry('warn', message, undefined, context);
    console.warn(JSON.stringify(entry));
  },

  /**
   * Error level logging
   * Use for application errors, exceptions, failures
   * Always includes full stack trace if error object provided
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
    if (!shouldLog('error', context)) return;
    const entry = buildLogEntry('error', message, error, context);
    console.error(JSON.stringify(entry));
  },

  /**
   * Debug level logging
   * Use for detailed debugging information, variable values
   * Heavily sampled in production (1%)
   */
  debug(message: string, context?: Record<string, unknown>) {
    if (!shouldLog('debug', context)) return;
    const entry = buildLogEntry('debug', message, undefined, context);
    console.debug(JSON.stringify(entry));
  },

  /**
   * Authentication event logging
   * Specialized method for auth-related events
   */
  auth(action: string, success: boolean, context?: Record<string, unknown>) {
    const level = success ? 'info' : 'warn';
    const entry = buildLogEntry(level, `Auth: ${action}`, undefined, {
      component: 'auth',
      action,
      success,
      ...context,
    });
    const consoleMethod = level === 'info' ? console.log : console.warn;
    consoleMethod(JSON.stringify(entry));
  },

  /**
   * Security event logging
   * Specialized method for security-related events
   * Never sampled - always logged
   */
  security(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    context?: Record<string, unknown>
  ) {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    const entry = buildLogEntry(level, `Security: ${event}`, undefined, {
      component: 'security',
      event,
      severity,
      ...context,
    });
    const consoleMethod = level === 'error' ? console.error : console.warn;
    consoleMethod(JSON.stringify(entry));
  },

  /**
   * API request/response logging
   * Specialized method for HTTP-related logs
   * Automatically extracts correlation ID from request headers
   * Note: Metrics are now tracked at the route handler level (rbacRoute/publicRoute)
   */
  api(
    message: string,
    request: { method: string; url: string; headers?: { get: (key: string) => string | null } },
    statusCode?: number,
    duration?: number
  ) {
    const level =
      statusCode && statusCode >= 500 ? 'error' : statusCode && statusCode >= 400 ? 'warn' : 'info';
    const url = new URL(request.url);
    const entry = buildLogEntry(level, message, undefined, {
      component: 'api',
      method: request.method,
      path: url.pathname,
      request, // Pass request to extract correlation from headers
      ...(statusCode && { statusCode }),
      ...(duration && { duration }),
    });
    const consoleMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(JSON.stringify(entry));
  },

  /**
   * Database operation logging
   * Specialized method for DB-related logs
   */
  db(operation: string, table: string, duration?: number, context?: Record<string, unknown>) {
    if (!shouldLog('debug', { component: 'database' })) return;
    const entry = buildLogEntry('debug', `DB: ${operation} on ${table}`, undefined, {
      component: 'database',
      operation,
      table,
      ...(duration && { duration }),
      ...context,
    });
    console.debug(JSON.stringify(entry));
  },

  /**
   * Performance timing logging
   * Use for tracking operation duration
   * @param message - Description of the operation
   * @param startTime - Start timestamp (from Date.now())
   * @param context - Additional context
   */
  timing(message: string, startTime: number, context?: Record<string, unknown>) {
    const duration = Date.now() - startTime;
    if (!shouldLog('info', context)) return;
    const entry = buildLogEntry('info', message, undefined, {
      duration,
      performanceTiming: true,
      ...context,
    });
    console.log(JSON.stringify(entry));
  },
};

// Export correlation utilities as named export
export { requestContext };

// Export types
export type { RequestContext };

// Default export
export default log;
