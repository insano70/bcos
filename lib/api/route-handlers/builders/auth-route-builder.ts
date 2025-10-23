/**
 * Auth Route Builder
 *
 * Builds authenticated route handlers without RBAC.
 * Replaces the legacySecureRoute() / secureRoute() function.
 *
 * Pipeline: Correlation → RateLimit → Auth → Handler
 *
 * Features:
 * - Authentication without RBAC permission checking
 * - Handler receives session object (not userContext)
 * - Used by MFA/auth system routes
 * - Backward compatible with legacy pattern
 *
 * Usage:
 * ```typescript
 * export const GET = AuthRouteBuilder.build(handler, {
 *   rateLimit: 'api',
 *   requireAuth: true,
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import { correlation, log } from '@/lib/logger';
import type { AuthSession } from '../types';
import { AuthMiddleware } from '../middleware/auth-middleware';
import { CorrelationMiddleware } from '../middleware/correlation-middleware';
import { MiddlewarePipeline } from '../middleware/pipeline';
import { RateLimitMiddleware } from '../middleware/rate-limit-middleware';
import type { AuthRouteOptions } from '../types';
import { RouteErrorHandler } from '../utils/error-handler';
import { MetricsRecorder } from '../utils/metrics-recorder';
import { TimingTracker } from '../utils/timing-tracker';

/**
 * Build authenticated route handler (without RBAC)
 *
 * @param handler - Route handler function receiving session
 * @param options - Auth route options (rateLimit, requireAuth)
 * @returns Next.js route handler function
 */
export function buildAuthRoute(
  handler: (request: NextRequest, session?: AuthSession, ...args: unknown[]) => Promise<Response>,
  options: AuthRouteOptions = {}
) {
    // Build pipeline without RBAC
    const pipeline = new MiddlewarePipeline([
      new CorrelationMiddleware(),
      new RateLimitMiddleware(options.rateLimit),
      new AuthMiddleware(options.requireAuth !== false, options.publicReason),
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
              routeType: 'auth',
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
                  routeType: 'auth',
                  userId: result.context?.userId,
                  totalDuration: timingTracker.getTotalDuration(),
                },
                errorResponse
              );
              return errorResponse;
            }

            // Middleware passed - call handler with session
            const context = result.context;

            // Convert AuthResult to AuthSession for backward compatibility
            const session: AuthSession | undefined = context.session
              ? {
                  user: context.session.user,
                  accessToken: context.session.accessToken,
                  sessionId: context.session.sessionId,
                  userContext: context.session.userContext,
                }
              : undefined;

            const endHandlerTiming = context.timingTracker.start('handler');
            const response = await handler(request, session, ...args);
            endHandlerTiming();

            const totalDuration = context.timingTracker.getTotalDuration();

            // Log single completion entry with all context
            log.api(
              `${request.method} ${url.pathname} completed`,
              request,
              response.status,
              totalDuration
            );

            // Record metrics
            await MetricsRecorder.recordRequest(
              request,
              {
                routeType: 'auth',
                userId: context.userId,
                totalDuration,
              },
              response
            );

            return response;
          } catch (error) {
            return RouteErrorHandler.handleError(error, request, {
              routeType: 'auth',
              totalDuration: timingTracker.getTotalDuration(),
              endpoint: url.pathname,
              method: request.method,
            });
          }
        }
      );
    };
}
