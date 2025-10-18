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

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { calculateHealthScore } from '@/lib/monitoring/health-score';
import { metricsCollector } from '@/lib/monitoring/metrics-collector';
import type { MonitoringMetrics } from '@/lib/monitoring/types';
import { createSecurityMetricsService } from '@/lib/services/security-metrics-service';
import type { UserContext } from '@/lib/types/rbac';

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
    const fallbackMetrics: MonitoringMetrics = {
      timestamp: new Date().toISOString(),
      timeRange: '5m',
      systemHealth: {
        status: 'degraded',
        score: 50,
        factors: {
          uptime: 'degraded',
          errorRate: 'degraded',
          responseTime: 'degraded',
          cachePerformance: 'degraded',
          databaseLatency: 'degraded',
        },
      },
      performance: {
        requests: { total: 0, perSecond: 0, byEndpoint: {} },
        responseTime: {
          p50: 0,
          p95: 0,
          p99: 0,
          avg: 0,
          min: 0,
          max: 0,
          count: 0,
          byEndpoint: {},
        },
        errors: { total: 0, rate: 0, byEndpoint: {}, byType: {} },
        slowRequests: { count: 0, threshold: 1000, endpoints: [] },
      },
      analytics: {
        requests: { total: 0, byEndpoint: {} },
        responseTime: {
          p50: 0,
          p95: 0,
          p99: 0,
          avg: 0,
          min: 0,
          max: 0,
          count: 0,
        },
        errors: { total: 0, rate: 0, byEndpoint: {} },
        slowRequests: { count: 0, threshold: 5000, endpoints: [] },
      },
      cache: { hitRate: 0, hits: 0, misses: 0, opsPerSec: 0 },
      security: {
        failedLogins: 0,
        rateLimitBlocks: 0,
        csrfBlocks: 0,
        suspiciousUsers: 0,
        lockedAccounts: 0,
      },
      activeUsers: { current: 0 },
    };

    return createSuccessResponse(fallbackMetrics);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(metricsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
