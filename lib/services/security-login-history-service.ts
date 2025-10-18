/**
 * Security Login History Service
 *
 * Handles querying and analyzing login attempt history for users.
 * Provides detailed login history with summary statistics.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * ## Error Handling Strategy
 *
 * - **Authorization Errors**: Service constructor throws `AuthorizationError` if user is not super admin
 * - **Validation Errors**: Invalid userId format throws `ValidationError` with clear message
 * - **Query Errors**: Database query failures are thrown as-is (not masked)
 * - **No Graceful Degradation**: All errors propagate to route handler for proper error responses
 *
 * @example
 * ```typescript
 * const service = createSecurityLoginHistoryService(userContext);
 * const history = await service.getLoginHistory('user-123', { limit: 50 });
 * ```
 */

// Third-party libraries
import { desc, eq, sql } from 'drizzle-orm';

// Database
import { db, login_attempts } from '@/lib/db';

// API responses
import { ValidationError } from '@/lib/api/responses/error';

// API utilities
import { requireSuperAdmin } from '@/lib/api/utils/rbac-guards';

// Logging
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

// Types
import type { UserContext } from '@/lib/types/rbac';
import type { LoginAttempt, LoginHistoryResponse } from '@/lib/monitoring/types';

// Constants
import { SECURITY_MONITORING_LIMITS, UUID_REGEX } from '@/lib/constants/security-monitoring';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityLoginHistoryServiceInterface {
  /**
   * Get login attempt history for a specific user
   *
   * Retrieves detailed login history with summary statistics including
   * total attempts, success/failure counts, unique IPs, and recent activity.
   *
   * @param userId - User ID (must be valid UUID)
   * @param filters - Optional filters for limit and success/failure filtering
   * @returns Promise resolving to login history with attempts and summary statistics
   * @throws {AuthorizationError} If user is not super admin
   * @throws {ValidationError} If userId is not a valid UUID
   *
   * @example
   * ```typescript
   * const history = await service.getLoginHistory('user-123', {
   *   limit: 100,
   *   failureOnly: true
   * });
   * console.log(`${history.summary.failedAttempts} failed login attempts`);
   * ```
   */
  getLoginHistory(userId: string, filters?: LoginHistoryFilters): Promise<LoginHistoryResponse>;
}

export interface LoginHistoryFilters {
  /** Maximum number of login attempts to return (default: 50, max: 500) */
  limit?: number;
  /** Only return successful login attempts */
  successOnly?: boolean;
  /** Only return failed login attempts */
  failureOnly?: boolean;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityLoginHistoryService {
  constructor(private readonly userContext: UserContext) {
    requireSuperAdmin(userContext, 'security monitoring');
  }

  async getLoginHistory(
    userId: string,
    filters: LoginHistoryFilters = {}
  ): Promise<LoginHistoryResponse> {
    const startTime = Date.now();

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw ValidationError('Invalid userId format');
    }

    try {
      const limit = Math.min(
        filters.limit || SECURITY_MONITORING_LIMITS.DEFAULT_PAGE_SIZE,
        SECURITY_MONITORING_LIMITS.MAX_PAGE_SIZE
      );

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
