/**
 * Route Error Handler Utility
 *
 * Consolidates 2 duplicate error handling blocks from route handlers.
 * Provides consistent error logging, metrics recording, and response formatting.
 *
 * Extracted from:
 * - rbacRoute error handling (lines 349-391)
 * - authRoute error handling (lines 548-591)
 *
 * Features:
 * - Standardized error logging with context
 * - Automatic metrics recording on errors
 * - Consistent error response formatting
 * - Type-safe error handling
 *
 * Usage:
 * ```typescript
 * try {
 *   // ... route logic
 * } catch (error) {
 *   return RouteErrorHandler.handleError(error, request, {
 *     routeType: 'rbac',
 *     totalDuration: tracker.getTotalDuration(),
 *     userId: session?.user?.id,
 *   });
 * }
 * ```
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';

/**
 * Context for error handling
 */
export interface ErrorHandlerContext {
  routeType: 'rbac' | 'public' | 'auth';
  totalDuration?: number;
  userId?: string;
  endpoint?: string;
  method?: string;
}

export class RouteErrorHandler {
  /**
   * Handle route errors with consistent logging and metrics
   *
   * @param error - The error that occurred
   * @param request - The NextRequest object
   * @param context - Error context (route type, duration, etc.)
   * @returns Error response
   */
  static async handleError(
    error: unknown,
    request: NextRequest,
    context: ErrorHandlerContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const endpoint = context.endpoint || url.pathname;
    const method = context.method || request.method;
    const totalDuration = context.totalDuration || 0;

    // Log error with context
    log.error(`${context.routeType} route error`, error, {
      endpoint,
      method,
      totalDuration,
      errorType: RouteErrorHandler.getErrorType(error),
      ...(context.userId && { userId: context.userId }),
    });

    // Record metrics for error
    await RouteErrorHandler.recordErrorMetrics(
      endpoint,
      totalDuration,
      context.userId
    );

    // Return standardized error response
    return createErrorResponse(
      RouteErrorHandler.getErrorMessage(error),
      500,
      request
    ) as Response;
  }

  /**
   * Record metrics for error responses
   *
   * Silently fails if metrics collector unavailable (development/test).
   *
   * @param endpoint - API endpoint path
   * @param duration - Request duration in ms
   * @param userId - Optional user ID
   */
  private static async recordErrorMetrics(
    endpoint: string,
    duration: number,
    userId?: string
  ): Promise<void> {
    try {
      const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
      const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');

      const category = categorizeEndpoint(endpoint);

      metricsCollector.recordRequest(
        endpoint,
        duration,
        500, // Error status code
        userId,
        category
      );
    } catch {
      // Silently fail if metrics collector not available
    }
  }

  /**
   * Extract error type from unknown error
   *
   * @param error - Unknown error object
   * @returns Error type string (constructor name or typeof)
   */
  private static getErrorType(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'constructor' in error &&
      error.constructor &&
      'name' in error.constructor
    ) {
      return String(error.constructor.name);
    }
    return typeof error;
  }

  /**
   * Extract error message from unknown error
   *
   * @param error - Unknown error object
   * @returns Error message string
   */
  private static getErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'Unknown error';
  }
}
