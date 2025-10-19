/**
 * Security At-Risk Users Service
 *
 * Handles querying and analyzing users with security risks.
 * Identifies users with failed login attempts, locked accounts, or suspicious activity.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * ## Error Handling Strategy
 *
 * - **Authorization Errors**: Service constructor throws `AuthorizationError` if user is not super admin
 * - **Query Errors**: Database query failures are thrown as-is (not masked)
 * - **No Graceful Degradation**: All errors propagate to route handler for proper error responses
 *
 * @example
 * ```typescript
 * const service = createSecurityAtRiskUsersService(userContext);
 * const atRiskUsers = await service.getAtRiskUsers({ minRiskScore: 50 });
 * ```
 */

// Third-party libraries
import { eq, gt, inArray, or, sql } from 'drizzle-orm';

// Database
import { account_security, db, login_attempts, users } from '@/lib/db';

// API utilities
import { requireSuperAdmin } from '@/lib/api/utils/rbac-guards';

// Logging
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';

// Monitoring utilities
import { calculateRiskScore, getRiskFactors } from '@/lib/monitoring/risk-score';

// Types
import type { UserContext } from '@/lib/types/rbac';
import type { AtRiskUser, AtRiskUsersResponse } from '@/lib/monitoring/types';

// Constants
import { SECURITY_MONITORING_LIMITS, SECURITY_MONITORING_TIME } from '@/lib/constants/security-monitoring';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityAtRiskUsersServiceInterface {
  /**
   * Get users with security risks (failed logins, locked accounts, suspicious activity)
   *
   * Queries database for users with security issues and enriches with risk scores.
   * Uses batch queries to prevent N+1 query problems.
   *
   * @param filters - Optional filters for limit and minimum risk score
   * @returns Promise resolving to at-risk users with risk scores and summary
   * @throws {AuthorizationError} If user is not super admin
   *
   * @example
   * ```typescript
   * const result = await service.getAtRiskUsers({ minRiskScore: 50, limit: 100 });
   * console.log(`Found ${result.totalCount} at-risk users`);
   * console.log(`${result.summary.locked} locked accounts`);
   * ```
   */
  getAtRiskUsers(filters?: AtRiskUsersFilters): Promise<AtRiskUsersResponse>;
}

export interface AtRiskUsersFilters {
  /** Maximum number of users to return (default: 50, max: 500) */
  limit?: number;
  /** Minimum risk score to filter by (0-100) */
  minRiskScore?: number;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityAtRiskUsersService {
  constructor(private readonly userContext: UserContext) {
    requireSuperAdmin(userContext, 'security monitoring');
  }

  async getAtRiskUsers(filters: AtRiskUsersFilters = {}): Promise<AtRiskUsersResponse> {
    const startTime = Date.now();

    try {
      const limit = Math.min(
        filters.limit || SECURITY_MONITORING_LIMITS.DEFAULT_PAGE_SIZE,
        SECURITY_MONITORING_LIMITS.MAX_PAGE_SIZE
      );
      // Clamp minRiskScore to valid range (0-100)
      const minRiskScore = Math.max(
        0,
        Math.min(filters.minRiskScore || 0, SECURITY_MONITORING_LIMITS.MAX_RISK_SCORE)
      );

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - SECURITY_MONITORING_TIME.MS_PER_DAY);
      const sevenDaysAgo = new Date(now.getTime() - SECURITY_MONITORING_TIME.MS_PER_WEEK);

      // Convert to ISO strings for SQL queries
      const twentyFourHoursAgoISO = twentyFourHoursAgo.toISOString();
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

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
                attempts24h: sql<string>`COUNT(*) FILTER (WHERE ${login_attempts.attempted_at} > ${sql.raw(`'${twentyFourHoursAgoISO}'`)})`,
                uniqueIPs7d: sql<string>`COUNT(DISTINCT ${login_attempts.ip_address}) FILTER (WHERE ${login_attempts.attempted_at} > ${sql.raw(`'${sevenDaysAgoISO}'`)})`,
              })
              .from(login_attempts)
              .where(inArray(login_attempts.user_id, userIds))
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
