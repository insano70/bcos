/**
 * Database Performance Monitoring Wrapper
 * Provides automatic logging for database operations
 */

import { createAppLogger } from './factory';

type LogData = Record<string, unknown>;

const dbLogger = createAppLogger('database');

/**
 * Database operation wrapper with performance monitoring
 */
export function withDBLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  operation: string,
  table: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const startTime = Date.now();
    const operationId = `${operation}_${table}_${Date.now()}`;

    dbLogger.debug(`DB operation started: ${operation} on ${table}`, {
      operation,
      table,
      operationId,
    });

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;

      // Determine record count if result is an array or has length
      const recordCount = Array.isArray(result)
        ? result.length
        : result && typeof result === 'object' && 'length' in result
          ? result.length
          : result
            ? 1
            : 0;

      // Log successful operation
      const level = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
      dbLogger[level](`DB operation completed: ${operation} on ${table}`, {
        operation,
        table,
        duration,
        recordCount,
        slow: duration > 500,
        operationId,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      dbLogger.error(`DB operation failed: ${operation} on ${table}`, error, {
        operation,
        table,
        duration,
        operationId,
        success: false,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });

      throw error;
    }
  }) as T;
}

/**
 * Slow query detection and logging
 */
export function logSlowQuery(
  operation: string,
  table: string,
  duration: number,
  query?: string,
  params?: unknown[]
): void {
  if (duration > 1000) {
    // Log queries over 1 second
    dbLogger.warn('Slow query detected', {
      operation,
      table,
      duration,
      query: query ? `${query.substring(0, 200)}...` : undefined,
      paramCount: params?.length || 0,
      severity: duration > 5000 ? 'critical' : duration > 2000 ? 'high' : 'medium',
    });
  }
}

/**
 * Database connection monitoring
 */
export function logDBConnection(
  action: 'connect' | 'disconnect' | 'error',
  details?: LogData
): void {
  const level = action === 'error' ? 'error' : 'info';

  dbLogger[level](`Database ${action}`, {
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Transaction logging
 */
export function logDBTransaction(
  action: 'begin' | 'commit' | 'rollback',
  transactionId: string,
  duration?: number
): void {
  const level = action === 'rollback' ? 'warn' : 'debug';

  dbLogger[level](`Transaction ${action}`, {
    action,
    transactionId,
    duration,
  });
}

/**
 * Database health monitoring
 */
export function logDBHealth(metrics: {
  connectionCount?: number;
  activeQueries?: number;
  avgResponseTime?: number;
  errorRate?: number;
}): void {
  const level = (metrics.errorRate || 0) > 0.05 ? 'warn' : 'info';

  dbLogger[level]('Database health metrics', {
    ...metrics,
    timestamp: new Date().toISOString(),
  });
}

export default dbLogger;
