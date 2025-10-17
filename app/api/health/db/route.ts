import { sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { checkDbHealth, db } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Database health check endpoint
 * Tests database connectivity, connection pooling, and performance
 * Protected - only admin users can access detailed health information
 */
const healthCheckHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Check main database health with connection pooling info
    const mainDbHealth = await checkDbHealth();

    // Check analytics database health
    const analyticsDbHealth = await checkAnalyticsDbHealth();

    // Test basic connectivity and queries
    const queryStartTime = Date.now();
    const [result] = await db.execute(sql`SELECT 1 as health_check, NOW() as current_time`);
    const queryEndTime = Date.now();
    const responseTime = queryEndTime - queryStartTime;

    // Test queries on real tables
    const [userCount] = await db.execute(
      sql`SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`
    );
    const [practiceCount] = await db.execute(
      sql`SELECT COUNT(*) as count FROM practices WHERE deleted_at IS NULL`
    );

    // Determine overall status
    const isMainDbHealthy = mainDbHealth.isHealthy;
    const isAnalyticsDbHealthy = analyticsDbHealth.isHealthy;
    const isSlowResponse = responseTime > 1000;

    let overallStatus = 'healthy';
    if (!isMainDbHealthy) {
      overallStatus = 'unhealthy';
    } else if (!isAnalyticsDbHealthy || isSlowResponse) {
      overallStatus = 'degraded';
    }

    const healthData = {
      status: overallStatus,
      databases: {
        main: {
          connected: isMainDbHealthy,
          responseTime: `${responseTime}ms`,
          poolingEnabled: true,
          latency: mainDbHealth.latency ? `${mainDbHealth.latency}ms` : undefined,
          error: mainDbHealth.error,
          currentTime: result?.current_time || new Date().toISOString(),
          queries: {
            basic: 'success',
            users: 'success',
            practices: 'success',
          },
        },
        analytics: {
          connected: isAnalyticsDbHealthy,
          poolingEnabled: true,
          latency: analyticsDbHealth.latency ? `${analyticsDbHealth.latency}ms` : undefined,
          error: analyticsDbHealth.error,
          configured: !!process.env.ANALYTICS_DATABASE_URL,
        },
      },
      statistics: {
        totalUsers: Number(userCount?.count || 0),
        totalPractices: Number(practiceCount?.count || 0),
      },
      timestamp: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;

    // Log warnings for degraded performance
    if (isSlowResponse) {
      log.warn('Database response time is slow', {
        operation: 'db_health_check',
        userId: userContext.user_id,
        responseTime,
        duration,
        component: 'health',
      });
    }
    if (!isAnalyticsDbHealthy && process.env.ANALYTICS_DATABASE_URL) {
      log.warn('Analytics database is unhealthy', {
        operation: 'db_health_check',
        userId: userContext.user_id,
        error: analyticsDbHealth.error,
        duration,
        component: 'health',
      });
    }

    // Log health check completion
    log.info('Database health check completed', {
      operation: 'db_health_check',
      userId: userContext.user_id,
      status: overallStatus,
      mainDbHealthy: isMainDbHealthy,
      analyticsDbHealthy: isAnalyticsDbHealthy,
      responseTime,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'health',
    });

    if (overallStatus === 'unhealthy') {
      return createErrorResponse('Database health check failed', 503, request);
    }

    return createSuccessResponse(healthData, `Database status: ${overallStatus}`);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Database health check failed', error, {
      operation: 'db_health_check',
      userId: userContext.user_id,
      duration,
      component: 'health',
    });

    const _healthData = {
      status: 'unhealthy',
      databases: {
        main: {
          connected: false,
          poolingEnabled: true,
          error: error instanceof Error ? error.message : 'Unknown database error',
        },
        analytics: {
          connected: false,
          poolingEnabled: true,
          configured: !!process.env.ANALYTICS_DATABASE_URL,
        },
      },
      timestamp: new Date().toISOString(),
    };

    return createErrorResponse('Database health check failed', 503, request);
  }
};

// Export with RBAC protection - only users with admin permissions can access
export const GET = rbacRoute(healthCheckHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
