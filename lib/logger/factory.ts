/**
 * Universal Logger Factory
 * Provides backward-compatible factory functions for creating loggers
 */

import type { NextRequest } from 'next/server';
import type { SimpleLogger } from './simple-logger';
import { AppLogger } from './simple-logger';
import type { LoggerConfig } from './universal-logger';

/**
 * Create application logger with module-specific context
 * Drop-in replacement for the existing createAppLogger function
 */
export function createAppLogger(
  module: string,
  context?: Record<string, unknown>,
  config?: LoggerConfig
): SimpleLogger {
  // Streamlined: Direct SimpleLogger usage (no adapter abstraction)
  return new AppLogger(module, context, config);
}

/**
 * Create API logger with request context
 * Drop-in replacement for the existing createAPILogger function
 */
export function createAPILogger(request: NextRequest, config?: LoggerConfig): SimpleLogger {
  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams);

  const context = {
    requestId: generateRequestId(),
    method: request.method,
    path: url.pathname,
    query: Object.keys(searchParams).length > 0 ? searchParams : ({} as Record<string, string>),
    ipAddress: extractIPAddress(request),
    ...(request.headers.get('user-agent') && {
      userAgent: request.headers.get('user-agent') || 'unknown',
    }),
  };

  // Streamlined: Direct SimpleLogger usage (no adapter abstraction)
  return new AppLogger('api', context, config);
}

/**
 * Create logger with development runtime tracking
 * Useful for monitoring which adapter is being used in different contexts
 */
export function createTrackedAppLogger(
  module: string,
  context?: Record<string, unknown>,
  config?: LoggerConfig
): SimpleLogger {
  // Streamlined: Direct SimpleLogger usage (tracking simplified)
  return new AppLogger(module, context, config);
}

/**
 * Create pre-configured domain-specific loggers
 * Maintains compatibility with existing logger exports
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
  system: createAppLogger('system'),
};

/**
 * Default application logger
 * Maintains compatibility with existing default export
 */
export const logger = createAppLogger('app');

/**
 * Helper functions (replicated from existing api-logger.ts)
 */

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractIPAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
}

// Re-export types for backward compatibility
export type { LogContext, LogData, LoggerConfig } from './universal-logger';

// Runtime utilities removed in simplified architecture
// No longer needed: getLoggerDiagnostics, clearLoggerCache, createLoggerWithAdapter

export default logger;
