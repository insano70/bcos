import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { audit_logs, db, practices, users } from '@/lib/db';
import { log } from '@/lib/logger';
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
    timeframe = searchParams.get('timeframe') || '30d'; // 7d, 30d, 90d, 1y
    const startDate = getStartDate(timeframe);

    log.info('User analytics parameters parsed', {
      timeframe,
      startDate: startDate.toISOString(),
    });

    // Get user statistics
    const [userStats] = await db
      .select({
        totalUsers: sql<number>`count(*)`,
        activeUsers: sql<number>`count(case when is_active = true then 1 end)`,
        verifiedUsers: sql<number>`count(case when email_verified = true then 1 end)`,
        newUsersThisPeriod: sql<number>`count(case when created_at >= ${startDate} then 1 end)`,
      })
      .from(users)
      .where(isNull(users.deleted_at));

    // Get user registration trend
    const registrationTrend = await db
      .select({
        date: sql<string>`date(created_at)`,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(and(isNull(users.deleted_at), gte(users.created_at, startDate)))
      .groupBy(sql`date(created_at)`)
      .orderBy(sql`date(created_at)`);

    // Get user activity from audit logs
    const userActivity = await db
      .select({
        date: sql<string>`date(created_at)`,
        uniqueUsers: sql<number>`count(distinct user_id)`,
        totalActions: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), sql`user_id is not null`))
      .groupBy(sql`date(created_at)`)
      .orderBy(sql`date(created_at)`);

    // Get top user actions
    const topActions = await db
      .select({
        action: audit_logs.action,
        count: sql<number>`count(*)`,
      })
      .from(audit_logs)
      .where(and(gte(audit_logs.created_at, startDate), sql`user_id is not null`))
      .groupBy(audit_logs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    // Get recent user registrations
    const recentRegistrations = await db
      .select({
        userId: users.user_id,
        email: users.email,
        firstName: users.first_name,
        lastName: users.last_name,
        createdAt: users.created_at,
        isActive: users.is_active,
        emailVerified: users.email_verified,
      })
      .from(users)
      .where(isNull(users.deleted_at))
      .orderBy(desc(users.created_at))
      .limit(10);

    // Get user practices relationship
    const userPracticesStats = await db
      .select({
        totalPractices: sql<number>`count(distinct ${practices.practice_id})`,
        practicesWithOwners: sql<number>`count(distinct case when ${practices.owner_user_id} is not null then ${practices.practice_id} end)`,
        averagePracticesPerUser: sql<number>`round(count(distinct ${practices.practice_id})::decimal / nullif(count(distinct ${users.user_id}), 0), 2)`,
      })
      .from(practices)
      .leftJoin(users, eq(practices.owner_user_id, users.user_id))
      .where(and(isNull(practices.deleted_at), isNull(users.deleted_at)));

    const analytics = {
      overview: {
        totalUsers: userStats?.totalUsers || 0,
        activeUsers: userStats?.activeUsers || 0,
        verifiedUsers: userStats?.verifiedUsers || 0,
        newUsersThisPeriod: userStats?.newUsersThisPeriod || 0,
        verificationRate:
          (userStats?.totalUsers || 0) > 0
            ? Math.round(((userStats?.verifiedUsers || 0) / (userStats?.totalUsers || 1)) * 100)
            : 0,
        activationRate:
          (userStats?.totalUsers || 0) > 0
            ? Math.round(((userStats?.activeUsers || 0) / (userStats?.totalUsers || 1)) * 100)
            : 0,
      },
      trends: {
        registrations: registrationTrend,
        activity: userActivity,
      },
      engagement: {
        topActions,
        totalActions: topActions.reduce((sum, action) => sum + action.count, 0),
      },
      recent: {
        registrations: recentRegistrations,
      },
      practices: userPracticesStats[0] || {
        totalPractices: 0,
        practicesWithOwners: 0,
        averagePracticesPerUser: 0,
      },
      metadata: {
        timeframe,
        startDate: startDate.toISOString(),
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

function getStartDate(timeframe: string): Date {
  const now = new Date();

  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// Export as permission-based protected route
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
