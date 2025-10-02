/**
 * Request Correlation ID System
 * Provides request tracing across distributed operations
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from 'nanoid';

// Correlation context interface
export interface CorrelationContext {
  correlationId: string;
  parentId?: string;
  operationName?: string;
  startTime: number;
  metadata: Record<string, unknown>;
}

// AsyncLocalStorage for correlation context
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Correlation ID generator with configurable format
 */
export class CorrelationIdGenerator {
  /**
   * Generate a new correlation ID
   */
  static generate(prefix?: string): string {
    const timestamp = Date.now().toString(36);
    const random = nanoid(8);
    return prefix ? `${prefix}_${timestamp}_${random}` : `cor_${timestamp}_${random}`;
  }

  /**
   * Generate a request-specific correlation ID
   */
  static forRequest(method: string, path: string): string {
    const pathHash = path.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    const timestamp = Date.now().toString(36);
    const random = nanoid(6);
    return `${method.toLowerCase()}_${pathHash}_${timestamp}_${random}`;
  }

  /**
   * Generate a child correlation ID from parent
   */
  static forChild(parentId: string, operation: string): string {
    const opHash = operation.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6);
    const random = nanoid(4);
    return `${parentId}.${opHash}_${random}`;
  }

  /**
   * Generate correlation ID for background operations
   */
  static forBackground(operation: string): string {
    return CorrelationIdGenerator.generate(`bg_${operation.substring(0, 8)}`);
  }

  /**
   * Generate correlation ID for scheduled tasks
   */
  static forScheduled(taskName: string): string {
    return CorrelationIdGenerator.generate(`sch_${taskName.substring(0, 8)}`);
  }
}

/**
 * Correlation Context Manager
 */
export class CorrelationContextManager {
  /**
   * Create and run code within a correlation context
   */
  static async withContext<T>(
    correlationId: string,
    operationName: string,
    metadata: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const context: CorrelationContext = {
      correlationId,
      operationName,
      startTime: Date.now(),
      metadata: { ...metadata },
    };

    return correlationStorage.run(context, fn);
  }

  /**
   * Create child context with new correlation ID
   */
  static async withChildContext<T>(
    operationName: string,
    metadata: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const parentContext = CorrelationContextManager.getCurrentContext();
    const childId = parentContext
      ? CorrelationIdGenerator.forChild(parentContext.correlationId, operationName)
      : CorrelationIdGenerator.generate();

    const context: CorrelationContext = {
      correlationId: childId,
      ...(parentContext && { parentId: parentContext.correlationId }),
      operationName,
      startTime: Date.now(),
      metadata: {
        ...parentContext?.metadata,
        ...metadata,
      },
    };

    return correlationStorage.run(context, fn);
  }

  /**
   * Get current correlation context
   */
  static getCurrentContext(): CorrelationContext | undefined {
    return correlationStorage.getStore();
  }

  /**
   * Get current correlation ID
   */
  static getCurrentId(): string | undefined {
    return CorrelationContextManager.getCurrentContext()?.correlationId;
  }

  /**
   * Add metadata to current context
   */
  static addMetadata(metadata: Record<string, unknown>): void {
    const context = CorrelationContextManager.getCurrentContext();
    if (context) {
      Object.assign(context.metadata, metadata);
    }
  }

  /**
   * Update operation name in current context
   */
  static setOperationName(name: string): void {
    const context = CorrelationContextManager.getCurrentContext();
    if (context) {
      context.operationName = name;
    }
  }
}

/**
 * Correlation middleware for Next.js API routes
 * Simplified to avoid serialization issues
 */
export function withCorrelation<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    // For now, just call the handler directly
    // Correlation context will be managed within the handler
    return handler(...args);
  };
}

/**
 * Database operation correlation wrapper
 */
export function withDBCorrelation<T extends (...args: unknown[]) => Promise<unknown | Response>>(
  operation: string,
  table: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    return CorrelationContextManager.withChildContext(
      `db_${operation}_${table}`,
      { operation, table },
      () => fn(...args)
    );
  }) as T;
}

/**
 * External API call correlation wrapper
 */
export function withExternalAPICorrelation<
  T extends (...args: unknown[]) => Promise<unknown | Response>,
>(service: string, endpoint: string, fn: T): T {
  return (async (...args: unknown[]) => {
    return CorrelationContextManager.withChildContext(
      `ext_api_${service}_${endpoint}`,
      { service, endpoint, type: 'external_api' },
      () => fn(...args)
    );
  }) as T;
}

/**
 * Background job correlation wrapper
 */
export function withBackgroundJobCorrelation<
  T extends (...args: unknown[]) => Promise<unknown | Response>,
>(jobName: string, fn: T): T {
  return (async (...args: unknown[]) => {
    const correlationId = CorrelationIdGenerator.forBackground(jobName);

    return CorrelationContextManager.withContext(
      correlationId,
      `job_${jobName}`,
      { type: 'background_job', jobName },
      () => fn(...args)
    );
  }) as T;
}

/**
 * Scheduled task correlation wrapper
 */
export function withScheduledTaskCorrelation<
  T extends (...args: unknown[]) => Promise<unknown | Response>,
>(taskName: string, fn: T): T {
  return (async (...args: unknown[]) => {
    const correlationId = CorrelationIdGenerator.forScheduled(taskName);

    return CorrelationContextManager.withContext(
      correlationId,
      `task_${taskName}`,
      { type: 'scheduled_task', taskName },
      () => fn(...args)
    );
  }) as T;
}

/**
 * Correlation header constants
 */
export const CorrelationHeaders = {
  REQUEST_ID: 'x-correlation-id',
  PARENT_ID: 'x-parent-correlation-id',
  OPERATION: 'x-operation-name',
  TRACE_ID: 'x-trace-id',
} as const;

/**
 * Helper functions for correlation ID usage
 */
export const CorrelationHelpers = {
  /**
   * Get correlation ID from request headers
   */
  getFromRequest: (request: { headers: Headers | Record<string, string> }): string | undefined => {
    if (request.headers instanceof Headers) {
      return request.headers.get(CorrelationHeaders.REQUEST_ID) || undefined;
    }
    return (
      request.headers[CorrelationHeaders.REQUEST_ID] ||
      request.headers['x-correlation-id'] ||
      undefined
    );
  },

  /**
   * Add correlation ID to response headers
   */
  addToResponse: (response: Response, correlationId?: string): Response => {
    const id = correlationId || CorrelationContextManager.getCurrentId();
    if (id) {
      response.headers.set(CorrelationHeaders.REQUEST_ID, id);
    }
    return response;
  },

  /**
   * Create correlation headers for outbound requests
   */
  createHeaders: (additionalHeaders?: Record<string, string>): Record<string, string> => {
    const context = CorrelationContextManager.getCurrentContext();
    const headers: Record<string, string> = {
      ...additionalHeaders,
    };

    if (context) {
      headers[CorrelationHeaders.REQUEST_ID] = context.correlationId;
      if (context.operationName) {
        headers[CorrelationHeaders.OPERATION] = context.operationName;
      }
    }

    return headers;
  },

  /**
   * Extract timing information from current context
   */
  getTimingInfo: (): { duration: number; startTime: number } | undefined => {
    const context = CorrelationContextManager.getCurrentContext();
    if (context) {
      return {
        duration: Date.now() - context.startTime,
        startTime: context.startTime,
      };
    }
    return undefined;
  },
};
