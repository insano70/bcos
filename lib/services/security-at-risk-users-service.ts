/**
 * Security At-Risk Users Service
 *
 * Handles querying and analyzing users with security risks.
 * Identifies users with failed login attempts, locked accounts, or suspicious activity.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * @example
 * ```typescript
 * const service = createSecurityAtRiskUsersService(userContext);
 * const atRiskUsers = await service.getAtRiskUsers({ minRiskScore: 50 });
 * ```
 */

import { eq, gt, or, sql } from 'drizzle-orm';
import { account_security, db, login_attempts, users } from '@/lib/db';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { AuthorizationError } from '@/lib/api/responses/error';
import { calculateRiskScore, getRiskFactors } from '@/lib/monitoring/risk-score';
import type { UserContext } from '@/lib/types/rbac';
import type { AtRiskUser, AtRiskUsersResponse } from '@/lib/monitoring/types';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityAtRiskUsersServiceInterface {
  getAtRiskUsers(filters?: AtRiskUsersFilters): Promise<AtRiskUsersResponse>;
}

export interface AtRiskUsersFilters {
  limit?: number;
  minRiskScore?: number;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityAtRiskUsersService {
  constructor(private readonly userContext: UserContext) {
    // Super admin only - no complex RBAC needed
    if (!userContext.is_super_admin) {
      throw AuthorizationError('Super admin access required for security monitoring');
    }
  }

  async getAtRiskUsers(filters: AtRiskUsersFilters = {}): Promise<AtRiskUsersResponse> {
    const startTime = Date.now();

    try {
      const limit = Math.min(filters.limit || 50, 500);
      const minRiskScore = filters.minRiskScore || 0;

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Query users with security issues
      const queryStart = Date.now();
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

      const queryDuration = Date.now() - queryStart;

      // Get all user IDs for batch query
      const userIds = atRiskUsersData.map((u) => u.userId);

      // Batch query for recent activity stats (prevents N+1 query problem)
      const statsStart = Date.now();
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

      const statsDuration = Date.now() - statsStart;

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
        const stats = statsLookup.get(user.userId);
        const recentAttempts24h = stats?.attempts24h || 0;
        const uniqueIPs7d = stats?.uniqueIPs7d || 0;

        const riskScore = calculateRiskScore({
          failedAttempts: user.failedAttempts || 0,
          lockedUntil: user.lockedUntil?.toISOString() || null,
          suspiciousActivity: user.suspiciousActivity || false,
          recentAttempts24h,
          uniqueIPs7d,
        });

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

      // Filter by minimum risk score
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

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.list('at_risk_users', {
        userId: this.userContext.user_id,
        filters: { limit, minRiskScore },
        results: { returned: filteredUsers.length, total: filteredUsers.length, page: 1 },
        duration,
        metadata: {
          queryDuration,
          statsDuration,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowStats: statsDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
      });

      log.info(template.message, template.context);

      return {
        users: filteredUsers,
        totalCount: filteredUsers.length,
        summary,
      };
    } catch (error) {
      log.error('get at-risk users failed', error, {
        operation: 'get_at_risk_users',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Security At-Risk Users Service
 *
 * Handles querying users with security risks.
 * Super admin access required.
 *
 * @param userContext - User context (must be super admin)
 * @returns Service interface
 * @throws {AuthorizationError} If user is not super admin
 *
 * @example
 * ```typescript
 * const service = createSecurityAtRiskUsersService(userContext);
 * const result = await service.getAtRiskUsers({ minRiskScore: 50, limit: 100 });
 * console.log(`Found ${result.totalCount} at-risk users`);
 * ```
 */
export function createSecurityAtRiskUsersService(
  userContext: UserContext
): SecurityAtRiskUsersServiceInterface {
  return new SecurityAtRiskUsersService(userContext);
}
