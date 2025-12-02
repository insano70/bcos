/**
 * Monitoring Metrics API
 *
 * GET /api/admin/monitoring/metrics
 *
 * Returns real-time application metrics for the admin command center dashboard.
 * Combines data from:
 * - MetricsCollector (in-memory real-time metrics including cache hits/misses)
 * - Redis INFO (cache statistics)
 * - Database (security metrics)
 *
 * Cache hit rate is tracked from actual chart queries (via cache-operations.ts)
 * rather than Redis global keyspace stats.
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
    // This includes actual cache hit/miss tracking from chart queries
    const snapshot = metricsCollector.getSnapshot();

    // Get security metrics from service
    const service = createSecurityMetricsService(userContext);
    const cacheStats = await service.getRedisStats();
    const securityMetrics = await service.getSecurityMetrics();

    // Use actual cache hit rate from chart queries (tracked in cache-operations.ts)
    // This is the real metric - how many chart queries hit cache vs went to database
    // Falls back to 100% if no queries yet (don't penalize healthy idle state)
    const chartCacheHitRate = snapshot.cache.total > 0 ? snapshot.cache.hitRate : 100;

    // Calculate system health score using actual chart query cache hit rate
    const systemHealth = calculateHealthScore({
      errorRate: snapshot.errors.rate,
      responseTimeP95: snapshot.responseTime.p95,
      cacheHitRate: chartCacheHitRate, // Actual chart query cache hit rate
      dbLatencyP95: metricsCollector.getDbLatencyP95(), // Database operation latency tracking
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
          byEndpoint: metricsCollector.getPerEndpointPercentiles(),
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
        peak: metricsCollector.getPeakActiveUsers().count,
        peakTime: metricsCollector.getPeakActiveUsers().time,
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
