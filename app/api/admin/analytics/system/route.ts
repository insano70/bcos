import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createAnalyticsSystemService } from '@/lib/services/analytics-system-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - System Metrics
 * Provides system health, performance, and security analytics
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  let timeframe: string | undefined;

  log.info('System analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    // Rate limit already applied by rbacRoute wrapper - no need to apply here

    const { searchParams } = new URL(request.url);
    timeframe = searchParams.get('timeframe') || '24h';

    log.info('Analytics parameters parsed', {
      timeframe,
    });

    // Create analytics system service
    const analyticsService = createAnalyticsSystemService(userContext);

    // Get system analytics with automatic permission checking
    const analytics = await analyticsService.getSystemAnalytics(timeframe);

    return createSuccessResponse(analytics, 'System analytics retrieved successfully');
  } catch (error) {
    log.error('System analytics error', error, {
      timeframe,
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics request failed', { duration: Date.now() - startTime });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    log.info('System analytics total', { duration: Date.now() - startTime });
  }
};

// Export as permission-based protected route
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
