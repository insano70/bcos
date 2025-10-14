/**
 * Security Events API
 *
 * GET /api/admin/monitoring/security-events
 *
 * Returns recent security events from CloudWatch Logs and database.
 * Includes failed logins, rate limiting, CSRF attacks, and other security incidents.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { querySecurityEvents } from '@/lib/monitoring/cloudwatch-queries';
import type { SecurityEventsResponse } from '@/lib/monitoring/types';

const securityEventsHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const timeRange = searchParams.get('timeRange') || '1h';
    const severityParam = searchParams.getAll('severity');
    const severities = severityParam.length > 0 ? severityParam : undefined;

    log.info('Security events query initiated', {
      operation: 'query_security_events',
      timeRange,
      severities,
      limit,
      component: 'monitoring',
    });

    // Query security events from CloudWatch
    // Note: Returns mock data until CloudWatch SDK is configured
    const events = await querySecurityEvents(timeRange, severities, limit);

    // Calculate summary by severity
    const summary = events.reduce(
      (acc, event) => {
        acc[event.severity] = (acc[event.severity] || 0) + 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 }
    );

    const response: SecurityEventsResponse = {
      events,
      totalCount: events.length,
      summary,
      timeRange,
    };

    const duration = Date.now() - startTime;

    log.info('Security events retrieved', {
      operation: 'query_security_events',
      duration,
      eventCount: events.length,
      timeRange,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get security events',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_security_events',
        duration,
        component: 'monitoring',
      }
    );

    // Return empty result on error (don't fail completely)
    const fallback: SecurityEventsResponse = {
      events: [],
      totalCount: 0,
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
      timeRange: '1h',
    };

    return createSuccessResponse(fallback);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(securityEventsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

