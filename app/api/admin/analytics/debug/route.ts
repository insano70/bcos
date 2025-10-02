import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { getAnalyticsDatabaseConfig } from '@/lib/env';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Admin Analytics Debug Endpoint
 * Provides diagnostic information about analytics database connectivity
 */
const debugHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Analytics debug request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    // Check environment configuration
    const config = getAnalyticsDatabaseConfig();
    const hasAnalyticsUrl = !!config.url;

    // Perform health check
    const healthCheck = await checkAnalyticsDbHealth();

    const diagnostics = {
      environment: {
        hasAnalyticsUrl,
        analyticsUrlConfigured: hasAnalyticsUrl ? 'YES' : 'NO',
        nodeEnv: process.env.NODE_ENV,
      },
      database: {
        isHealthy: healthCheck.isHealthy,
        latency: healthCheck.latency,
        error: healthCheck.error,
      },
      authentication: {
        userId: userContext.user_id,
        isSuperAdmin: userContext.is_super_admin,
        roles: userContext.roles?.map(role => role.name) || [],
      },
      timestamp: new Date().toISOString(),
    };

    log.info('Analytics debug completed', diagnostics);

    return createSuccessResponse(diagnostics, 'Analytics diagnostics retrieved successfully');

  } catch (error) {
    log.error('Analytics debug error', error, {
      requestingUserId: userContext.user_id
    });

    log.info('Analytics debug failed', { duration: Date.now() - startTime });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    log.info('Analytics debug total', { duration: Date.now() - startTime });
  }
};

// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(
  debugHandler,
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);
