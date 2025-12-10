import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createPracticeAnalyticsService } from '@/lib/services/practice-analytics-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Practice Metrics
 * Provides comprehensive practice analytics for admin dashboard
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  let timeframe: string | undefined;

  log.info('Practice analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    const { searchParams } = new URL(request.url);
    timeframe = searchParams.get('timeframe') || '30d';

    log.info('Practice analytics parameters parsed', {
      timeframe,
    });

    // Create analytics service
    const analyticsService = createPracticeAnalyticsService(userContext);

    // Get analytics data through service
    const [
      practiceAnalytics,
      creationTrends,
      templateUsage,
      statusDistribution,
      staffStats,
      topPractices,
      recentPractices,
      attributesCompletion,
    ] = await Promise.all([
      analyticsService.getPracticeAnalytics(timeframe),
      analyticsService.getCreationTrends(timeframe),
      analyticsService.getTemplateUsage(),
      analyticsService.getStatusDistribution(),
      analyticsService.getStaffStatistics(),
      analyticsService.getPracticesWithMostStaff(10),
      analyticsService.getRecentPractices(10),
      analyticsService.getAttributesCompletion(),
    ]);

    const analytics = {
      overview: (practiceAnalytics as { overview: unknown }).overview,
      trends: {
        creations: creationTrends,
      },
      templates: {
        usage: templateUsage,
        mostPopular: (templateUsage as unknown[])[0] || null,
      },
      status: {
        distribution: statusDistribution,
      },
      staff: {
        totalStaff: (staffStats as { totalStaff: number; averageStaffPerPractice: number })
          .totalStaff,
        averagePerPractice: (staffStats as { totalStaff: number; averageStaffPerPractice: number })
          .averageStaffPerPractice,
        topPractices,
      },
      completion: {
        attributes: attributesCompletion,
      },
      recent: {
        practices: recentPractices,
      },
      metadata: {
        timeframe,
        startDate: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
      },
    };

    return createSuccessResponse(analytics, 'Practice analytics retrieved successfully');
  } catch (error) {
    log.error('Practice analytics error', error, {
      timeframe,
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics request failed', { duration: Date.now() - startTime });
    return handleRouteError(error, 'Failed to retrieve analytics practices', request);
  } finally {
    log.info('Practice analytics total', { duration: Date.now() - startTime });
  }
};

// Export as permission-based protected route
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
