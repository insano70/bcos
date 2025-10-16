/**
 * Metrics Recorder Utility
 *
 * Consolidates 3 duplicate metrics recording try-catch blocks from route handlers.
 * Provides consistent metrics recording with security event tracking.
 *
 * Extracted from:
 * - publicRoute success metrics (lines 149-170)
 * - rbacRoute success metrics (lines 275-300)
 * - rbacRoute denied metrics (lines 326-345)
 *
 * Features:
 * - Standardized metrics recording for all route types
 * - Automatic security event tracking (rate limits, failed auth, permission denied)
 * - Silent failure if metrics collector unavailable (development/test)
 * - Endpoint categorization (standard, analytics, monitoring, health)
 *
 * Usage:
 * ```typescript
 * await MetricsRecorder.recordRequest(request, {
 *   routeType: 'rbac',
 *   userId: session.user.id,
 *   totalDuration: 245,
 *   rbacDenied: false,
 * }, response);
 * ```
 */

import type { NextRequest } from 'next/server';

/**
 * Context for metrics recording
 */
export interface MetricsRecorderContext {
  routeType: 'rbac' | 'public' | 'auth';
  userId?: string | undefined;
  totalDuration: number;
  rbacDenied?: boolean | undefined;
  endpoint?: string | undefined;
}

export class MetricsRecorder {
  /**
   * Record request metrics with security event tracking
   *
   * Silently fails if metrics collector unavailable (development/test).
   * Records security events based on response status:
   * - 429: Rate limit exceeded
   * - 401/403: Failed authentication
   * - 403 + rbacDenied: Permission denied
   *
   * @param request - The NextRequest object
   * @param context - Metrics context (route type, userId, duration)
   * @param response - The Response object
   */
  static async recordRequest(
    request: NextRequest,
    context: MetricsRecorderContext,
    response: Response
  ): Promise<void> {
    try {
      const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
      const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');

      const url = new URL(request.url);
      const endpoint = context.endpoint || url.pathname;
      const category = categorizeEndpoint(endpoint);

      // Record basic request metrics
      metricsCollector.recordRequest(
        endpoint,
        context.totalDuration,
        response.status,
        context.userId,
        category
      );

      // Record security events based on response status
      MetricsRecorder.recordSecurityEvents(response.status, context);
    } catch {
      // Silently fail if metrics collector not available
      // Don't break the response if monitoring fails
    }
  }

  /**
   * Record security events based on response status
   *
   * Automatically tracks:
   * - Rate limit blocks (429)
   * - Failed authentication (401, 403)
   * - RBAC permission denials (403 + rbacDenied flag)
   *
   * @param status - HTTP response status code
   * @param context - Metrics context
   */
  private static async recordSecurityEvents(
    status: number,
    context: MetricsRecorderContext
  ): Promise<void> {
    try {
      const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');

      // Rate limit exceeded
      if (status === 429) {
        metricsCollector.recordRateLimitBlock();
      }

      // Failed authentication (generic)
      if (status === 401 || status === 403) {
        metricsCollector.recordFailedLogin();
      }

      // RBAC permission denied (specific)
      if (status === 403 && context.rbacDenied) {
        metricsCollector.recordSecurityEvent('permission_denied');
      }
    } catch {
      // Silently fail - security events are best-effort
    }
  }
}
