/**
 * Engagement Metric Service
 *
 * Calculates user engagement metrics for organizations based on app access patterns.
 * Tracks both fresh logins AND session resumes (token refresh) from audit_logs.
 *
 * METRIC: "Statistics Check-In Rate"
 * - Measures how often users in an organization access the app
 * - Uses audit_logs with action IN ('login', 'token_refresh_success')
 * - Normalized to distinct access DAYS per user (100 logins in 1 day = 1 access day)
 * - Calculates weekly average over 14-day window
 * - Compares against benchmark (fabricated initially, real data later)
 */

import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, audit_logs, user_organizations } from '@/lib/db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { EngagementMetric } from '@/lib/types/report-card';

/**
 * Default measurement period in days
 */
const DEFAULT_PERIOD_DAYS = 14;

/**
 * Fabricated benchmark rate (top 25% of practices check 2.4x/week)
 * TODO: Replace with real peer data calculation when sufficient data exists
 */
const FABRICATED_BENCHMARK_RATE = 2.4;
const BENCHMARK_LABEL = 'Top 25% Avg';

/**
 * Engagement Metric Service
 *
 * Calculates how often users in an organization access the app.
 * Uses audit_logs to capture both fresh logins AND session resumes.
 */
export class EngagementMetricService {
  /**
   * Get engagement metric for an organization
   *
   * Counts distinct access DAYS (not individual events) for all users
   * in the organization over the measurement period. Multiple logins
   * on the same day count as 1 access day.
   *
   * @param organizationId - Organization UUID
   * @param options - Optional configuration
   * @returns EngagementMetric with user rate and benchmark comparison
   */
  async getEngagementMetric(
    organizationId: string,
    options?: { periodDays?: number }
  ): Promise<EngagementMetric> {
    const startTime = Date.now();
    const periodDays = options?.periodDays ?? DEFAULT_PERIOD_DAYS;

    try {
      // Calculate the cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - periodDays);

      // Get all user IDs in the organization
      const orgUsers = await db
        .select({ user_id: user_organizations.user_id })
        .from(user_organizations)
        .where(eq(user_organizations.organization_id, organizationId));

      if (orgUsers.length === 0) {
        // No users in organization - return zero engagement
        return this.buildMetric(organizationId, 0, 0, periodDays);
      }

      const userIds = orgUsers.map((u) => u.user_id);

      // Query audit_logs for auth events (login + token_refresh_success)
      // Count DISTINCT (user_id, date) pairs - multiple logins same day = 1 access day
      // Note: audit_logs.user_id is varchar, need to match against UUID strings
      const result = await db
        .select({
          // Count distinct user+date combinations (access days)
          access_days: sql<number>`COUNT(DISTINCT (${audit_logs.user_id} || DATE(${audit_logs.created_at})))`,
          unique_users: sql<number>`COUNT(DISTINCT ${audit_logs.user_id})`,
        })
        .from(audit_logs)
        .where(
          and(
            eq(audit_logs.event_type, 'auth'),
            inArray(audit_logs.action, ['login', 'token_refresh_success']),
            inArray(audit_logs.user_id, userIds),
            gte(audit_logs.created_at, cutoffDate)
          )
        );

      const accessDays = Number(result[0]?.access_days ?? 0);
      const uniqueUsers = Number(result[0]?.unique_users ?? 0);

      const duration = Date.now() - startTime;

      log.info('Engagement metric calculated', {
        operation: 'get_engagement_metric',
        organizationId,
        accessDays,
        uniqueUsers,
        periodDays,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'report-card',
      });

      return this.buildMetric(organizationId, accessDays, uniqueUsers, periodDays);
    } catch (error) {
      log.error('Failed to calculate engagement metric', error as Error, {
        operation: 'get_engagement_metric',
        organizationId,
        periodDays,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get benchmark rate for peer comparison
   *
   * Currently returns a fabricated value. When sufficient data exists,
   * this can be updated to calculate real peer statistics.
   *
   * @returns Benchmark data with rate, isReal flag, and label
   */
  async getBenchmarkRate(): Promise<{
    rate: number;
    isReal: boolean;
    label: string;
  }> {
    // TODO: When we have enough organizations with engagement data,
    // calculate real 75th percentile (top 25%) from peer data:
    //
    // 1. Query access counts for all organizations in last 14 days
    // 2. Calculate weekly average for each org
    // 3. Find 75th percentile value
    // 4. Return with isReal: true if sample size >= 10 orgs
    //
    // For now, return fabricated benchmark

    return {
      rate: FABRICATED_BENCHMARK_RATE,
      isReal: false,
      label: BENCHMARK_LABEL,
    };
  }

  /**
   * Build the EngagementMetric object
   *
   * @param organizationId - Organization UUID
   * @param accessDays - Total distinct access days in period (user+date combinations)
   * @param uniqueUsers - Number of unique users who accessed
   * @param periodDays - Measurement period in days
   * @returns Complete EngagementMetric object
   */
  private buildMetric(
    organizationId: string,
    accessDays: number,
    uniqueUsers: number,
    periodDays: number
  ): EngagementMetric {
    // Calculate weekly average: total access days / number of weeks
    const weeks = periodDays / 7;
    const userRate = weeks > 0 ? Math.round((accessDays / weeks) * 10) / 10 : 0;

    return {
      userRate,
      benchmarkRate: FABRICATED_BENCHMARK_RATE,
      benchmarkIsReal: false,
      benchmarkLabel: BENCHMARK_LABEL,
      accessDays,
      uniqueUsers,
      periodDays,
      organizationId,
    };
  }
}

// Export singleton instance
export const engagementMetricService = new EngagementMetricService();
