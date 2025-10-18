/**
 * Monitoring Metrics API
 *
 * GET /api/admin/monitoring/metrics
 *
 * Returns real-time application metrics for the admin command center dashboard.
 * Combines data from:
 * - MetricsCollector (in-memory real-time metrics)
 * - Redis INFO (cache statistics)
 * - Database (security metrics)
 *
 * RBAC: settings:read:all (Super Admin only)
 */

// Next.js
import type { NextRequest } from 'next/server';

// API responses
import { createSuccessResponse } from '@/lib/api/responses/success';

// API route handlers
import { rbacRoute } from '@/lib/api/route-handlers';

// Logging
import { log } from '@/lib/logger';

// Monitoring utilities
import { calculateHealthScore } from '@/lib/monitoring/health-score';
import { metricsCollector } from '@/lib/monitoring/metrics-collector';

// Services
import { createSecurityMetricsService } from '@/lib/services/security-metrics-service';

// Types
import type { UserContext } from '@/lib/types/rbac';
import type { MonitoringMetrics } from '@/lib/monitoring/types';

// Constants
import { FALLBACK_MONITORING_METRICS } from '@/lib/constants/security-monitoring';

const metricsHandler = async (_request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Get current metrics snapshot from collector
    const snapshot = metricsCollector.getSnapshot();

    // Get security metrics from service
    const service = createSecurityMetricsService(userContext);
    const cacheStats = await service.getRedisStats();
    const securityMetrics = await service.getSecurityMetrics();

    // Calculate system health score
    const systemHealth = calculateHealthScore({
      errorRate: snapshot.errors.rate,
      responseTimeP95: snapshot.responseTime.p95,
      cacheHitRate: cacheStats?.hitRate || 0,
      dbLatencyP95: 0, // TODO: Add DB latency tracking in Phase 4
      securityIncidents: snapshot.security.totalEvents,
    });

    // Build response with separated standard and analytics metrics
    const metrics: MonitoringMetrics = {
      timestamp: snapshot.timestamp,
      timeRange: '5m', // MetricsCollector tracks last 5 minutes

      systemHealth,

      // Standard API performance (CRUD operations)
      performance: {
        requests: {
          total: snapshot.requests.total,
          perSecond: snapshot.requests.perSecond,
          byEndpoint: snapshot.requests.byEndpoint,
        },
        responseTime: {
          ...snapshot.responseTime,
          byEndpoint: {}, // TODO: Add per-endpoint percentiles in Phase 4
        },
        errors: {
          total: snapshot.errors.total,
          rate: snapshot.errors.rate,
          byEndpoint: snapshot.errors.byEndpoint,
          byType: snapshot.errors.byType,
        },
        slowRequests: {
          count: snapshot.slowRequests.count,
          threshold: snapshot.slowRequests.threshold,
          endpoints: Object.keys(snapshot.slowRequests.byEndpoint),
        },
      },

      // Analytics performance (dashboards, charts, complex queries)
      analytics: {
        requests: {
          total: snapshot.analytics.requests.total,
          byEndpoint: snapshot.analytics.requests.byEndpoint,
        },
        responseTime: snapshot.analytics.responseTime,
        errors: {
          total: snapshot.analytics.errors.total,
          rate: snapshot.analytics.errors.rate,
          byEndpoint: snapshot.analytics.errors.byEndpoint,
        },
        slowRequests: {
          count: snapshot.analytics.slowRequests.count,
          threshold: snapshot.analytics.slowRequests.threshold,
          endpoints: Object.keys(snapshot.analytics.slowRequests.byEndpoint),
        },
      },

      cache: {
        hitRate: cacheStats?.hitRate || 0,
        hits: cacheStats?.hits || 0,
        misses: cacheStats?.misses || 0,
        opsPerSec: cacheStats?.opsPerSec || 0,
      },

      security: {
        failedLogins: snapshot.security.failedLogins,
        rateLimitBlocks: snapshot.security.rateLimitBlocks,
        csrfBlocks: securityMetrics.csrfBlocks,
        suspiciousUsers: securityMetrics.suspiciousUsers,
        lockedAccounts: securityMetrics.lockedAccounts,
      },

      activeUsers: {
        current: snapshot.activeUsers.count,
        // TODO: Track peak users in Phase 4
      },
    };

    const duration = Date.now() - startTime;

    log.info('Monitoring metrics retrieved', {
      operation: 'get_monitoring_metrics',
      duration,
      systemHealth: systemHealth.score,
      activeUsers: metrics.activeUsers.current,
      requestsPerSec: metrics.performance.requests.perSecond,
      component: 'monitoring',
    });

    return createSuccessResponse(metrics);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to get monitoring metrics', error, {
      operation: 'get_monitoring_metrics',
      duration,
      component: 'monitoring',
    });

    // Return degraded metrics on error (don't fail completely)
    return createSuccessResponse({
      ...FALLBACK_MONITORING_METRICS,
      timestamp: new Date().toISOString(),
    } as MonitoringMetrics);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(metricsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
