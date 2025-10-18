/**
 * Security Login History Service
 *
 * Handles querying and analyzing login attempt history for users.
 * Provides detailed login history with summary statistics.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * @example
 * ```typescript
 * const service = createSecurityLoginHistoryService(userContext);
 * const history = await service.getLoginHistory('user-123', { limit: 50 });
 * ```
 */

import { desc, eq, sql } from 'drizzle-orm';
import { db, login_attempts } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { AuthorizationError, ValidationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';
import type { LoginAttempt, LoginHistoryResponse } from '@/lib/monitoring/types';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityLoginHistoryServiceInterface {
  getLoginHistory(userId: string, filters?: LoginHistoryFilters): Promise<LoginHistoryResponse>;
}

export interface LoginHistoryFilters {
  limit?: number;
  successOnly?: boolean;
  failureOnly?: boolean;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityLoginHistoryService {
  constructor(private readonly userContext: UserContext) {
    // Super admin only - no complex RBAC needed
    if (!userContext.is_super_admin) {
      throw AuthorizationError('Super admin access required for security monitoring');
    }
  }

  async getLoginHistory(
    userId: string,
    filters: LoginHistoryFilters = {}
  ): Promise<LoginHistoryResponse> {
    const startTime = Date.now();

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw ValidationError('Invalid userId format - must be a valid UUID');
    }

    try {
      const limit = Math.min(filters.limit || 50, 500);

      // Build where clause
      const whereConditions = [eq(login_attempts.user_id, userId)];

      if (filters.successOnly) {
        whereConditions.push(eq(login_attempts.success, true));
      } else if (filters.failureOnly) {
        whereConditions.push(eq(login_attempts.success, false));
      }

      // Query login attempts
      const queryStart = Date.now();
      const attempts = await db
        .select()
        .from(login_attempts)
        .where(sql`${sql.join(whereConditions, sql` AND `)}`)
        .orderBy(desc(login_attempts.attempted_at))
        .limit(limit);

      const queryDuration = Date.now() - queryStart;

      // Calculate summary statistics
      const statsStart = Date.now();
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

      const statsDuration = Date.now() - statsStart;

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

      const duration = Date.now() - startTime;

      log.info('login history retrieved', {
        operation: 'get_login_history',
        userId: this.userContext.user_id,
        targetUserId: userId,
        attemptCount: loginAttempts.length,
        duration,
        metadata: {
          queryDuration,
          statsDuration,
          slowQuery: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          slowStats: statsDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        component: 'service',
      });

      return {
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
    } catch (error) {
      log.error('get login history failed', error, {
        operation: 'get_login_history',
        userId: this.userContext.user_id,
        targetUserId: userId,
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
 * Create Security Login History Service
 *
 * Handles querying login attempt history for users.
 * Super admin access required.
 *
 * @param userContext - User context (must be super admin)
 * @returns Service interface
 * @throws {AuthorizationError} If user is not super admin
 *
 * @example
 * ```typescript
 * const service = createSecurityLoginHistoryService(userContext);
 * const history = await service.getLoginHistory('user-123', {
 *   limit: 100,
 *   failureOnly: true
 * });
 * console.log(`Found ${history.summary.failedAttempts} failed attempts`);
 * ```
 */
export function createSecurityLoginHistoryService(
  userContext: UserContext
): SecurityLoginHistoryServiceInterface {
  return new SecurityLoginHistoryService(userContext);
}
