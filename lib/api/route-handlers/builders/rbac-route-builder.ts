/**
 * RBAC Route Builder
 *
 * Builds RBAC-protected route handlers using middleware pipeline.
 * Replaces the monolithic rbacRoute() function with composable architecture.
 *
 * Pipeline: Correlation → RateLimit → Auth → RBAC → Handler
 *
 * Features:
 * - Permission-based access control
 * - Resource and organization scoping
 * - Automatic metrics recording
 * - Security event tracking
 * - Error handling with context
 *
 * Usage:
 * ```typescript
 * export const GET = RBACRouteBuilder.build(handler, {
 *   permission: 'users:read:all',
 *   rateLimit: 'api',
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { correlation, log } from '@/lib/logger';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { AuthMiddleware } from '../middleware/auth-middleware';
import { CorrelationMiddleware } from '../middleware/correlation-middleware';
import { MiddlewarePipeline } from '../middleware/pipeline';
import { RateLimitMiddleware } from '../middleware/rate-limit-middleware';
import { RBACMiddleware } from '../middleware/rbac-middleware';
import type { RBACRouteOptions } from '../types';
import { RouteErrorHandler } from '../utils/error-handler';
import { MetricsRecorder } from '../utils/metrics-recorder';
import { TimingTracker } from '../utils/timing-tracker';

export class RBACRouteBuilder {
  /**
   * Build RBAC-protected route handler
   *
   * @param handler - Route handler function receiving userContext
   * @param options - RBAC route options (permission, rateLimit, etc.)
   * @returns Next.js route handler function
   */
  static build(
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>,
    options: RBACRouteOptions & { permission: PermissionName | PermissionName[] }
  ) {
    // Build middleware pipeline
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
      new AuthMiddleware(options.requireAuth !== false),
      new RBACMiddleware(options.permission, {
        ...(options.requireAllPermissions !== undefined && {
          requireAllPermissions: options.requireAllPermissions,
        }),
        ...(options.extractResourceId && { extractResourceId: options.extractResourceId }),
        ...(options.extractOrganizationId && {
          extractOrganizationId: options.extractOrganizationId,
        }),
      }),
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
            // Log route initiation
            log.api(`${request.method} ${url.pathname} - RBAC route`, request, 0, 0);

            log.info('RBAC route initiated', {
              endpoint: url.pathname,
              method: request.method,
              permissions: Array.isArray(options.permission)
                ? options.permission
                : [options.permission],
            });

            // Execute middleware pipeline
            const result = await pipeline.execute(request, {
              routeType: 'rbac',
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
                  routeType: 'rbac',
                  userId: result.context?.userId,
                  totalDuration: timingTracker.getTotalDuration(),
                  rbacDenied: result.context?.rbacDenied,
                },
                errorResponse
              );
              return errorResponse;
            }

            // All middleware passed - call handler
            const context = result.context;

            // userContext must be set by auth middleware at this point
            if (!context.userContext) {
              throw new Error('userContext missing after successful auth middleware');
            }

            const endHandlerTiming = context.timingTracker.start('handler');
            const response = await handler(request, context.userContext, ...args);
            endHandlerTiming();

            log.info('Handler execution completed', {
              duration: context.timingTracker.getTiming('handler'),
              userId: context.userContext?.user_id,
              statusCode: response.status,
            });

            const totalDuration = context.timingTracker.getTotalDuration();

            log.info('RBAC route completed successfully', {
              userId: context.userContext?.user_id,
              statusCode: response.status,
              totalDuration,
            });

            // Record metrics
            await MetricsRecorder.recordRequest(
              request,
              {
                routeType: 'rbac',
                userId: context.userContext?.user_id,
                totalDuration,
                rbacDenied: false,
              },
              response
            );

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'rbac',
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
