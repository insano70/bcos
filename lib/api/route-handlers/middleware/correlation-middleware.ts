/**
 * Correlation Middleware
 *
 * Sets up correlation context for request tracing across logs.
 * Extracts or generates correlation ID and sets request metadata.
 *
 * Extracted from:
 * - rbacRoute lines 40-64
 * - publicRoute lines 405-428
 * - authRoute lines 439-458
 *
 * Features:
 * - Extract correlation ID from x-correlation-id header
 * - Generate new ID if not provided
 * - Set request context (IP, User-Agent, method, path)
 * - All subsequent logs include correlation ID automatically
 *
 * Usage:
 * ```typescript
 * const middleware = new CorrelationMiddleware();
 * const result = await middleware.execute(request, context);
 * // context.correlationId now set
 * ```
 */

import type { NextRequest } from 'next/server';
import { correlation } from '@/lib/logger';
import type { Middleware, MiddlewareResult, RouteContext } from '../types';

export class CorrelationMiddleware implements Middleware {
  name = 'correlation';

  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    // Extract or generate correlation ID
    const correlationId = request.headers.get('x-correlation-id') || correlation.generate();

    // Set request context for logging
    const ipAddress =
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    correlation.setRequest({
      method: request.method,
      path: context.url.pathname,
      ...(ipAddress && { ipAddress }),
      ...(userAgent && { userAgent }),
    });

    // Return updated context with correlation ID
    return {
      success: true,
      context: {
        ...context,
        correlationId,
      },
    };
  }
}
