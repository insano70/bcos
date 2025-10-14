/**
 * Login History API
 *
 * GET /api/admin/monitoring/login-history?userId={userId}
 *
 * Returns login attempt history for a specific user.
 * Includes both successful and failed attempts with IP addresses and device info.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { db, login_attempts } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import type { LoginHistoryResponse, LoginAttempt } from '@/lib/monitoring/types';

const loginHistoryHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const successOnly = searchParams.get('successOnly') === 'true';
    const failureOnly = searchParams.get('failureOnly') === 'true';

    if (!userId) {
      return createErrorResponse('userId parameter is required', 400, request);
    }

    log.info('Login history query initiated', {
      operation: 'query_login_history',
      userId,
      limit,
      successOnly,
      failureOnly,
      component: 'monitoring',
    });

    // Build where clause
    const whereConditions = [eq(login_attempts.user_id, userId)];
    
    if (successOnly) {
      whereConditions.push(eq(login_attempts.success, true));
    } else if (failureOnly) {
      whereConditions.push(eq(login_attempts.success, false));
    }

    // Query login attempts
    const attempts = await db
      .select()
      .from(login_attempts)
      .where(sql`${sql.join(whereConditions, sql` AND `)}`)
      .orderBy(desc(login_attempts.attempted_at))
      .limit(limit);

    // Calculate summary statistics
    const [summaryStats] = await db
      .select({
        totalAttempts: sql<number>`COUNT(*)`,
        successfulLogins: sql<number>`COUNT(*) FILTER (WHERE ${login_attempts.success} = true)`,
        failedAttempts: sql<number>`COUNT(*) FILTER (WHERE ${login_attempts.success} = false)`,
        uniqueIPs: sql<number>`COUNT(DISTINCT ${login_attempts.ip_address})`,
        mostRecentSuccess: sql<string>`MAX(${login_attempts.attempted_at}) FILTER (WHERE ${login_attempts.success} = true)`,
        mostRecentFailure: sql<string>`MAX(${login_attempts.attempted_at}) FILTER (WHERE ${login_attempts.success} = false)`,
      })
      .from(login_attempts)
      .where(eq(login_attempts.user_id, userId));

    // Transform to response format
    const loginAttempts: LoginAttempt[] = attempts.map((attempt) => ({
      attemptId: attempt.attempt_id,
      email: attempt.email,
      userId: attempt.user_id || undefined,
      ipAddress: attempt.ip_address,
      userAgent: attempt.user_agent || undefined,
      deviceFingerprint: attempt.device_fingerprint || undefined,
      success: attempt.success,
      failureReason: attempt.failure_reason || undefined,
      rememberMeRequested: attempt.remember_me_requested,
      sessionId: attempt.session_id || undefined,
      attemptedAt: attempt.attempted_at.toISOString(),
    }));

    const response: LoginHistoryResponse = {
      userId,
      attempts: loginAttempts,
      totalCount: loginAttempts.length,
      summary: {
        totalAttempts: summaryStats?.totalAttempts || 0,
        successfulLogins: summaryStats?.successfulLogins || 0,
        failedAttempts: summaryStats?.failedAttempts || 0,
        uniqueIPs: summaryStats?.uniqueIPs || 0,
        mostRecentSuccess: summaryStats?.mostRecentSuccess || undefined,
        mostRecentFailure: summaryStats?.mostRecentFailure || undefined,
      },
    };

    const duration = Date.now() - startTime;

    log.info('Login history retrieved', {
      operation: 'query_login_history',
      duration,
      userId,
      attemptCount: loginAttempts.length,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get login history',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_login_history',
        duration,
        component: 'monitoring',
      }
    );

    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(loginHistoryHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

