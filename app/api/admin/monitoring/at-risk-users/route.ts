/**
 * At-Risk Users API
 *
 * GET /api/admin/monitoring/at-risk-users
 *
 * Returns users with failed logins, locked accounts, or suspicious activity.
 * Calculates risk scores (0-100) based on security factors.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import { eq, gt, or, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { account_security, db, login_attempts, users } from '@/lib/db';
import { log } from '@/lib/logger';
import { calculateRiskScore, getRiskFactors } from '@/lib/monitoring/risk-score';
import type { AtRiskUser, AtRiskUsersResponse } from '@/lib/monitoring/types';

const atRiskUsersHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const minRiskScore = parseInt(searchParams.get('minRiskScore') || '0', 10);

    log.info('At-risk users query initiated', {
      operation: 'query_at_risk_users',
      limit,
      minRiskScore,
      component: 'monitoring',
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query users with security issues
    const atRiskUsersData = await db
      .select({
        userId: users.user_id,
        email: users.email,
        firstName: users.first_name,
        lastName: users.last_name,
        failedAttempts: account_security.failed_login_attempts,
        lastFailedAttempt: account_security.last_failed_attempt,
        lockedUntil: account_security.locked_until,
        suspiciousActivity: account_security.suspicious_activity_detected,
        lockoutReason: account_security.lockout_reason,
      })
      .from(users)
      .leftJoin(account_security, eq(users.user_id, account_security.user_id))
      .where(
        or(
          gt(account_security.failed_login_attempts, 0),
          gt(account_security.locked_until, now),
          eq(account_security.suspicious_activity_detected, true)
        )
      )
      .orderBy(
        sql`${account_security.failed_login_attempts} DESC, ${account_security.last_failed_attempt} DESC NULLS LAST`
      )
      .limit(limit);

    // Get all user IDs for batch query
    const userIds = atRiskUsersData.map((u) => u.userId);

    // Batch query for recent activity stats (fixes N+1 query problem)
    const recentStatsArray =
      userIds.length > 0
        ? await db
            .select({
              userId: login_attempts.user_id,
              attempts24h: sql<string>`COUNT(*) FILTER (WHERE ${login_attempts.attempted_at} > ${twentyFourHoursAgo})`,
              uniqueIPs7d: sql<string>`COUNT(DISTINCT ${login_attempts.ip_address}) FILTER (WHERE ${login_attempts.attempted_at} > ${sevenDaysAgo})`,
            })
            .from(login_attempts)
            .where(sql`${login_attempts.user_id} = ANY(${userIds})`)
            .groupBy(login_attempts.user_id)
        : [];

    // Create lookup map for O(1) access
    const statsLookup = new Map(
      recentStatsArray.map((stat) => [
        stat.userId,
        {
          attempts24h: parseInt(stat.attempts24h || '0', 10),
          uniqueIPs7d: parseInt(stat.uniqueIPs7d || '0', 10),
        },
      ])
    );

    // Enrich with recent activity stats and calculate risk scores
    const enrichedUsers: AtRiskUser[] = atRiskUsersData.map((user) => {
      // Lookup stats from map (O(1) operation)
      const stats = statsLookup.get(user.userId);
      const recentAttempts24h = stats?.attempts24h || 0;
      const uniqueIPs7d = stats?.uniqueIPs7d || 0;

      // Calculate risk score
      const riskScore = calculateRiskScore({
        failedAttempts: user.failedAttempts || 0,
        lockedUntil: user.lockedUntil?.toISOString() || null,
        suspiciousActivity: user.suspiciousActivity || false,
        recentAttempts24h,
        uniqueIPs7d,
      });

      // Get risk factors
      const riskFactors = getRiskFactors({
        failedAttempts: user.failedAttempts || 0,
        lockedUntil: user.lockedUntil?.toISOString() || null,
        suspiciousActivity: user.suspiciousActivity || false,
        recentAttempts24h,
        uniqueIPs7d,
      });

      return {
        userId: user.userId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        failedAttempts: user.failedAttempts || 0,
        lastFailedAttempt: user.lastFailedAttempt?.toISOString() || null,
        lockedUntil: user.lockedUntil?.toISOString() || null,
        suspiciousActivity: user.suspiciousActivity || false,
        lockoutReason: user.lockoutReason || null,
        riskScore,
        riskFactors,
        recentAttempts24h,
        uniqueIPs7d,
      };
    });

    // Filter by minimum risk score if specified
    const filteredUsers = enrichedUsers.filter((user) => user.riskScore >= minRiskScore);

    // Calculate summary
    const summary = {
      locked: filteredUsers.filter((u) => u.lockedUntil && new Date(u.lockedUntil) > now).length,
      suspicious: filteredUsers.filter((u) => u.suspiciousActivity).length,
      monitoring: filteredUsers.filter(
        (u) =>
          !u.suspiciousActivity &&
          (!u.lockedUntil || new Date(u.lockedUntil) <= now) &&
          u.failedAttempts > 0
      ).length,
    };

    const response: AtRiskUsersResponse = {
      users: filteredUsers,
      totalCount: filteredUsers.length,
      summary,
    };

    const duration = Date.now() - startTime;

    log.info('At-risk users retrieved', {
      operation: 'query_at_risk_users',
      duration,
      userCount: filteredUsers.length,
      locked: summary.locked,
      suspicious: summary.suspicious,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get at-risk users',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_at_risk_users',
        duration,
        component: 'monitoring',
      }
    );

    // Return empty result on error
    const fallback: AtRiskUsersResponse = {
      users: [],
      totalCount: 0,
      summary: { locked: 0, suspicious: 0, monitoring: 0 },
    };

    return createSuccessResponse(fallback);
  }
};

// Export with RBAC protection - only super admins can access
export const GET = rbacRoute(atRiskUsersHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
