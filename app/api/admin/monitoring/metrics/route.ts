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
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { metricsCollector } from '@/lib/monitoring/metrics-collector';
import { calculateHealthScore } from '@/lib/monitoring/health-score';
import { getRedisClient } from '@/lib/redis';
import { db, account_security, csrf_failure_events } from '@/lib/db';
import { sql, gte } from 'drizzle-orm';
import type { MonitoringMetrics } from '@/lib/monitoring/types';

const metricsHandler = async (_request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get current metrics snapshot from collector
    const snapshot = metricsCollector.getSnapshot();

    // Get Redis cache stats
    const cacheStats = await getRedisStats();

    // Get security metrics from database
    const securityMetrics = await getSecurityMetrics();

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

    log.error(
      'Failed to get monitoring metrics',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'get_monitoring_metrics',
        duration,
        component: 'monitoring',
      }
    );

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

/**
 * Get Redis cache statistics
 * Returns null if Redis is unavailable
 */
async function getRedisStats(): Promise<{
  hitRate: number;
  hits: number;
  misses: number;
  opsPerSec: number;
} | null> {
  try {
    const redis = getRedisClient();
    if (!redis) {
      return null;
    }

    // Get Redis INFO stats section
    const info = await redis.info('stats');

    // Parse INFO string
    const stats = parseRedisInfo(info);

    // Calculate hit rate
    const hits = stats.keyspace_hits || 0;
    const misses = stats.keyspace_misses || 0;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;

    return {
      hitRate,
      hits,
      misses,
      opsPerSec: stats.instantaneous_ops_per_sec || 0,
    };
  } catch (error) {
    log.error(
      'Failed to get Redis stats',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'get_redis_stats',
        component: 'monitoring',
      }
    );
    return null;
  }
}

/**
 * Parse Redis INFO command output
 */
function parseRedisInfo(infoString: string): Record<string, number> {
  const lines = infoString.split('\r\n');
  const info: Record<string, number> = {};

  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        const numValue = parseFloat(value);
        if (!Number.isNaN(numValue)) {
          info[key] = numValue;
        }
      }
    }
  }

  return info;
}

/**
 * Get security metrics from database
 */
async function getSecurityMetrics(): Promise<{
  suspiciousUsers: number;
  lockedAccounts: number;
  csrfBlocks: number;
}> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get counts from account_security table
    const [securityStats] = await db
      .select({
        suspiciousUsers: sql<number>`COUNT(*) FILTER (WHERE ${account_security.suspicious_activity_detected} = true)`,
        lockedAccounts: sql<number>`COUNT(*) FILTER (WHERE ${account_security.locked_until} > ${now})`,
      })
      .from(account_security);

    // Get CSRF blocks from last hour
    const [csrfStats] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(csrf_failure_events)
      .where(gte(csrf_failure_events.timestamp, oneHourAgo));

    return {
      suspiciousUsers: securityStats?.suspiciousUsers || 0,
      lockedAccounts: securityStats?.lockedAccounts || 0,
      csrfBlocks: csrfStats?.count || 0,
    };
  } catch (error) {
    log.error(
      'Failed to get security metrics',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'get_security_metrics',
        component: 'monitoring',
      }
    );

    return {
      suspiciousUsers: 0,
      lockedAccounts: 0,
      csrfBlocks: 0,
    };
  }
}

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(metricsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

