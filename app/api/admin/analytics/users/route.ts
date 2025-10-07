import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createRBACUsersService } from '@/lib/services/rbac-users-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - User Metrics
 * Provides comprehensive user analytics for admin dashboard
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  let timeframe: string | undefined;

  log.info('User analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    const rateLimitStart = Date.now();
    await applyRateLimit(request, 'api');
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStart });

    const { searchParams } = new URL(request.url);
    timeframe = searchParams.get('timeframe') || '30d';

    log.info('User analytics parameters parsed', {
      timeframe,
    });

    // Create RBAC users service
    const usersService = createRBACUsersService(userContext);

    // Get analytics data through service with automatic permission checking
    const [userAnalytics, registrationTrends, userActivity, topActions, recentRegistrations] =
      await Promise.all([
        usersService.getUserAnalytics(timeframe),
        usersService.getRegistrationTrends(timeframe),
        usersService.getUserActivity(timeframe),
        usersService.getTopUserActions(timeframe, 10),
        usersService.getRecentRegistrations(10),
      ]);

    const analytics = {
      overview: userAnalytics.overview,
      trends: {
        registrations: registrationTrends,
        activity: userActivity,
      },
      engagement: {
        topActions,
        totalActions: topActions.reduce((sum, action) => sum + action.count, 0),
      },
      recent: {
        registrations: recentRegistrations,
      },
      practices: userAnalytics.practices,
      metadata: {
        timeframe,
        startDate: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
      },
    };

    return createSuccessResponse(analytics, 'User analytics retrieved successfully');
  } catch (error) {
    log.error('User analytics error', error, {
      timeframe,
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics request failed', { duration: Date.now() - startTime });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    log.info('User analytics total', { duration: Date.now() - startTime });
  }
};

// Export as permission-based protected route
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
