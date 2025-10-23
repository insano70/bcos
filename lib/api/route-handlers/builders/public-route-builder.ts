/**
 * Public Route Builder
 *
 * Builds public route handlers (no authentication required).
 * Replaces the publicRoute() function with composable architecture.
 *
 * Pipeline: Correlation → RateLimit → Handler
 *
 * Features:
 * - No authentication required
 * - Rate limiting still applied
 * - Simpler pipeline (no auth/RBAC)
 * - Automatic metrics recording
 *
 * Usage:
 * ```typescript
 * export const GET = PublicRouteBuilder.build(
 *   handler,
 *   'Health check endpoint',
 *   { rateLimit: 'api' }
 * );
 * ```
 */

import type { NextRequest } from 'next/server';
import { correlation, log } from '@/lib/logger';
import { CorrelationMiddleware } from '../middleware/correlation-middleware';
import { MiddlewarePipeline } from '../middleware/pipeline';
import { RateLimitMiddleware } from '../middleware/rate-limit-middleware';
import type { PublicRouteOptions } from '../types';
import { RouteErrorHandler } from '../utils/error-handler';
import { MetricsRecorder } from '../utils/metrics-recorder';
import { TimingTracker } from '../utils/timing-tracker';

export class PublicRouteBuilder {
  // Private constructor prevents instantiation - this is a static utility class
  private constructor() {}

  /**
   * Build public route handler
   *
   * @param handler - Route handler function (no userContext)
   * @param _reason - Reason for public access (for documentation) - kept for backward compatibility
   * @param options - Public route options (rateLimit)
   * @returns Next.js route handler function
   */
  static build(
    handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
    _reason: string,
    options: PublicRouteOptions = {}
  ) {
    // Build simpler pipeline (no auth or RBAC)
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
    ]);

    return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
      const timingTracker = new TimingTracker();
      const url = new URL(request.url);

      // Extract or generate correlation ID
      const correlationId = request.headers.get('x-correlation-id') || correlation.generate();

      // Wrap entire request lifecycle in correlation context
      return correlation.withContext(
        correlationId,
        {
          method: request.method,
          path: url.pathname,
          requestId: request.headers.get('x-request-id') || undefined,
        },
        async () => {
          try {
            // Execute middleware pipeline
            const result = await pipeline.execute(request, {
              routeType: 'public',
              timingTracker,
              startTime: Date.now(),
              url,
            });

            // If middleware failed, record metrics and return error
            if (!result.success || !result.context) {
              const errorResponse =
                result.response || new Response('Internal Server Error', { status: 500 });
              await MetricsRecorder.recordRequest(
                request,
                {
                  routeType: 'public',
                  totalDuration: timingTracker.getTotalDuration(),
                },
                errorResponse
              );
              return errorResponse;
            }

            // Middleware passed - call handler
            const context = result.context;
            const endHandlerTiming = context.timingTracker.start('handler');
            const response = await handler(request, ...args);
            endHandlerTiming();

            const totalDuration = context.timingTracker.getTotalDuration();

            // Log single completion entry with all context
            log.api(
              `${request.method} ${url.pathname} completed`,
              request,
              response.status,
              totalDuration
            );

            // Record metrics (no userId for public routes)
            await MetricsRecorder.recordRequest(
              request,
              {
                routeType: 'public',
                totalDuration,
              },
              response
            );

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'public',
              totalDuration: timingTracker.getTotalDuration(),
              endpoint: url.pathname,
              method: request.method,
            });
          }
        }
      );
    };
  }
}
