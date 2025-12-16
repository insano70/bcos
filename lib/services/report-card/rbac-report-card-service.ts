/**
 * RBAC Report Card Service
 *
 * Main service for report card operations with RBAC enforcement.
 * Reuses existing analytics:read:* permissions.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { db } from '@/lib/db';
import { reportCardCache } from '@/lib/cache/report-card-cache';
import {
  report_card_results,
  report_card_trends,
  practice_size_buckets,
} from '@/lib/db/schema';
import { log, logTemplates } from '@/lib/logger';
import { ReportCardNotFoundError } from '@/lib/errors/report-card-errors';
import type { UserContext } from '@/lib/types/rbac';
import type {
  ReportCard,
  PeerComparison,
  PreviousMonthSummary,
  GradeHistoryEntry,
  AnnualReview,
  PracticeTrend,
} from '@/lib/types/report-card';
import type { SizeBucket, TrendPeriod, TrendDirection } from '@/lib/constants/report-card';
import { getLetterGrade as sharedGetLetterGrade, compareGrades as sharedCompareGrades } from '@/lib/utils/format-value';

// Extracted modules
import { resultMapper } from './data';
import { annualReviewCalculator, peerStatisticsCalculator } from './analytics';
import { getActiveMeasures } from './measures';

/**
 * RBAC Report Card Service
 *
 * Provides RBAC-protected access to report card data and configuration.
 * Uses existing analytics:read:* permissions for authorization.
 */
export class RBACReportCardService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  // ============================================================================
  // Practice Access Verification
  // ============================================================================

  /**
   * Get all practice UIDs accessible to the current user
   * Super admins have access to all practices.
   * Regular users only have access to practices in their organizations.
   */
  private getAccessiblePracticeUids(): number[] {
    // Super admins have unrestricted access
    if (this.isSuperAdmin()) {
      return []; // Empty array signals "all access"
    }

    // Collect practice UIDs from user's organizations
    const practiceUids: Set<number> = new Set();
    
    if (this.userContext.organizations) {
      for (const org of this.userContext.organizations) {
        if (org.practice_uids && Array.isArray(org.practice_uids)) {
          for (const uid of org.practice_uids) {
            practiceUids.add(uid);
          }
        }
      }
    }

    return Array.from(practiceUids);
  }

  /**
   * Verify user has access to a specific practice
   * Throws PermissionDeniedError if access is denied.
   * 
   * @param practiceUid - The practice UID to check access for
   * @throws PermissionDeniedError if user does not have access
   */
  private requirePracticeAccess(practiceUid: number): void {
    // Super admins have unrestricted access
    if (this.isSuperAdmin()) {
      return;
    }

    const accessiblePractices = this.getAccessiblePracticeUids();
    
    if (!accessiblePractices.includes(practiceUid)) {
      log.warn('Practice access denied', {
        userId: this.userContext.user_id,
        practiceUid,
        accessiblePractices: accessiblePractices.slice(0, 5), // Log first 5 for debugging
        component: 'report-card',
      });
      throw new PermissionDeniedError(
        `Access denied: User does not have access to practice ${practiceUid}`
      );
    }
  }

  // ============================================================================
  // Report Card Retrieval (Organization-based)
  // ============================================================================

  /**
   * Get report card for a specific organization
   * This is the primary method for UI - users select by organization, not practice.
   * Checks cache first, then falls back to database query.
   */
  async getReportCardByOrganization(organizationId: string): Promise<ReportCard> {
    const startTime = Date.now();

    // Reuse existing analytics permissions
    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this organization
    this.requireOrganizationAccess(organizationId);

    try {
      // Check cache first (keyed by organization_id)
      const cached = await reportCardCache.getReportCardByOrg(organizationId);
      if (cached) {
        const duration = Date.now() - startTime;
        log.info('Report card cache hit (by org)', {
          operation: 'get_report_card_by_org',
          organizationId,
          userId: this.userContext.user_id,
          duration,
          cached: true,
          component: 'report-card',
        });
        return cached;
      }

      // Get the latest report card month for this organization using MAX()
      // This is deterministic - explicitly gets the maximum month, not relying on sort order
      const [maxMonthResult] = await db
        .select({ maxMonth: sql<string>`MAX(${report_card_results.report_card_month})` })
        .from(report_card_results)
        .where(eq(report_card_results.organization_id, organizationId));

      if (!maxMonthResult?.maxMonth) {
        throw new ReportCardNotFoundError(`organization:${organizationId}`);
      }

      // Get the report card for the maximum month
      const [result] = await db
        .select()
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.organization_id, organizationId),
            eq(report_card_results.report_card_month, maxMonthResult.maxMonth)
          )
        )
        .limit(1);

      if (!result) {
        throw new ReportCardNotFoundError(`organization:${organizationId}`);
      }

      const reportCard = resultMapper.mapDbResultToReportCard(result);

      // Cache the result (keyed by organization_id)
      await reportCardCache.setReportCardByOrg(organizationId, reportCard);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.read('report_card', {
        resourceId: organizationId,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          overallScore: reportCard.overall_score,
          sizeBucket: reportCard.size_bucket,
          queryBy: 'organization_id',
        },
      });

      log.info(template.message, { ...template.context, component: 'report-card' });

      return reportCard;
    } catch (error) {
      if (error instanceof ReportCardNotFoundError) {
        throw error;
      }

      log.error('Failed to get report card by organization', error as Error, {
        organizationId,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get report card for a specific organization and month
   */
  async getReportCardByOrganizationAndMonth(organizationId: string, month: string): Promise<ReportCard> {
    const startTime = Date.now();

    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    try {
      const [result] = await db
        .select()
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.organization_id, organizationId),
            eq(report_card_results.report_card_month, month)
          )
        )
        .limit(1);

      if (!result) {
        throw new ReportCardNotFoundError(`organization:${organizationId}:month:${month}`);
      }

      const reportCard = resultMapper.mapDbResultToReportCard(result);

      const duration = Date.now() - startTime;
      log.info('Report card retrieved by org and month', {
        organizationId,
        month,
        userId: this.userContext.user_id,
        duration,
        component: 'report-card',
      });

      return reportCard;
    } catch (error) {
      if (error instanceof ReportCardNotFoundError) {
        throw error;
      }
      log.error('Failed to get report card by org and month', error as Error, {
        organizationId,
        month,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get available months for an organization's report cards
   */
  async getAvailableMonthsByOrganization(organizationId: string, limit = 12): Promise<string[]> {
    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    const results = await db
      .select({ month: report_card_results.report_card_month })
      .from(report_card_results)
      .where(eq(report_card_results.organization_id, organizationId))
      .orderBy(desc(report_card_results.report_card_month))
      .limit(limit);

    return results.map((r) => r.month).filter((m): m is string => m !== null);
  }

  /**
   * Get previous month's report card summary by organization
   */
  async getPreviousMonthSummaryByOrganization(
    organizationId: string,
    currentMonth: string | null
  ): Promise<PreviousMonthSummary | null> {
    if (!currentMonth) return null;

    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    // Parse current month and get previous (use T00:00:00 suffix to parse in local time, not UTC)
    const currentDate = new Date(`${currentMonth}T00:00:00`);
    const previousDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const previousMonthStr = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}-01`;

    // Get previous month's report card
    const [previousResult] = await db
      .select({
        overall_score: report_card_results.overall_score,
      })
      .from(report_card_results)
      .where(
        and(
          eq(report_card_results.organization_id, organizationId),
          eq(report_card_results.report_card_month, previousMonthStr)
        )
      )
      .limit(1);

    if (!previousResult) return null;

    // Get current month's score for comparison
    const [currentResult] = await db
      .select({
        overall_score: report_card_results.overall_score,
      })
      .from(report_card_results)
      .where(
        and(
          eq(report_card_results.organization_id, organizationId),
          eq(report_card_results.report_card_month, currentMonth)
        )
      )
      .limit(1);

    const previousScore = parseFloat(previousResult.overall_score || '0');
    const currentScore = currentResult ? parseFloat(currentResult.overall_score || '0') : 0;
    const scoreChange = currentScore - previousScore;

    // Format month label
    const monthLabel = previousDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Calculate grades
    const grade = sharedGetLetterGrade(previousScore);
    const currentGrade = sharedGetLetterGrade(currentScore);
    const gradeImproved = sharedCompareGrades(currentGrade, grade) > 0;

    return {
      month: monthLabel,
      score: previousScore,
      grade,
      scoreChange: Math.round(scoreChange * 10) / 10,
      gradeImproved,
    };
  }

  /**
   * Get grade history for an organization
   * Returns the last N months of report card grades, most recent first
   */
  async getGradeHistoryByOrganization(
    organizationId: string,
    limit: number = 12
  ): Promise<GradeHistoryEntry[]> {
    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    try {
      // Get the last N report cards ordered by month
      const results = await db
        .select({
          report_card_month: report_card_results.report_card_month,
          overall_score: report_card_results.overall_score,
          percentile_rank: report_card_results.percentile_rank,
          size_bucket: report_card_results.size_bucket,
        })
        .from(report_card_results)
        .where(eq(report_card_results.organization_id, organizationId))
        .orderBy(desc(report_card_results.report_card_month))
        .limit(limit);

      return results.map((r, index) => {
        const score = parseFloat(r.overall_score || '0');
        const grade = sharedGetLetterGrade(score);
        // Use T00:00:00 suffix to parse in local time, not UTC
        const monthDate = new Date(`${r.report_card_month}T00:00:00`);

        // Calculate change from previous month (next in array since sorted desc)
        let scoreChange: number | null = null;
        let gradeChange: 'up' | 'down' | 'same' | null = null;

        if (index < results.length - 1) {
          const prevScore = parseFloat(results[index + 1]?.overall_score || '0');
          const prevGrade = sharedGetLetterGrade(prevScore);
          scoreChange = Math.round((score - prevScore) * 10) / 10;
          const comparison = sharedCompareGrades(grade, prevGrade);
          gradeChange = comparison > 0 ? 'up' : comparison < 0 ? 'down' : 'same';
        }

        return {
          month: r.report_card_month,
          monthLabel: monthDate.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          }),
          score,
          grade,
          percentileRank: parseFloat(r.percentile_rank || '0'),
          sizeBucket: (r.size_bucket as SizeBucket) || 'medium',
          scoreChange,
          gradeChange,
        };
      });
    } catch (error) {
      log.error('Failed to get grade history by organization', error as Error, {
        organizationId,
        limit,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get trend data for an organization
   * Returns all 3, 6, and 9 month trends for all measures.
   * This data is used by the TrendChart component to show period comparisons.
   */
  async getTrendsByOrganization(organizationId: string): Promise<PracticeTrend[]> {
    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    try {
      const results = await db
        .select({
          trend_id: report_card_trends.trend_id,
          practice_uid: report_card_trends.practice_uid,
          measure_name: report_card_trends.measure_name,
          trend_period: report_card_trends.trend_period,
          trend_direction: report_card_trends.trend_direction,
          trend_percentage: report_card_trends.trend_percentage,
          calculated_at: report_card_trends.calculated_at,
        })
        .from(report_card_trends)
        .where(eq(report_card_trends.organization_id, organizationId))
        .orderBy(report_card_trends.measure_name, report_card_trends.trend_period);

      return results.map((r) => ({
        trend_id: r.trend_id,
        practice_uid: r.practice_uid,
        measure_name: r.measure_name,
        trend_period: r.trend_period as TrendPeriod,
        trend_direction: r.trend_direction as TrendDirection,
        trend_percentage: parseFloat(r.trend_percentage || '0'),
        calculated_at: r.calculated_at?.toISOString() || new Date().toISOString(),
      }));
    } catch (error) {
      log.error('Failed to get trends by organization', error as Error, {
        organizationId,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get annual review data by organization
   * Returns year-over-year comparison, monthly trends, and summary statistics.
   * Checks cache first, then falls back to database query.
   */
  async getAnnualReviewByOrganization(organizationId: string): Promise<AnnualReview> {
    const startTime = Date.now();

    // SECURITY: Report cards are practice-level aggregates, require org+ access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    this.requireOrganizationAccess(organizationId);

    try {
      // Check cache first
      const cached = await reportCardCache.getAnnualReview(organizationId);
      if (cached) {
        const duration = Date.now() - startTime;
        log.info('Annual review cache hit', {
          operation: 'get_annual_review_by_org',
          organizationId,
          userId: this.userContext.user_id,
          duration,
          cached: true,
          component: 'report-card',
        });
        return cached;
      }

      // Get all report cards for the past 24 months for this organization
      const results = await db
        .select({
          practice_uid: report_card_results.practice_uid,
          report_card_month: report_card_results.report_card_month,
          overall_score: report_card_results.overall_score,
          percentile_rank: report_card_results.percentile_rank,
          size_bucket: report_card_results.size_bucket,
          measure_scores: report_card_results.measure_scores,
        })
        .from(report_card_results)
        .where(eq(report_card_results.organization_id, organizationId))
        .orderBy(desc(report_card_results.report_card_month))
        .limit(24);

      // Get practice_uid from results (for return type compatibility)
      const practiceUid = results[0]?.practice_uid ?? 0;

      // Get active measures for per-measure YoY calculation
      const activeMeasures = await getActiveMeasures();

      // Transform results to the format expected by annualReviewCalculator
      const transformedResults = results.map((r) => ({
        report_card_month: r.report_card_month ?? '',
        overall_score: r.overall_score ?? '0',
        percentile_rank: r.percentile_rank ?? '0',
        size_bucket: r.size_bucket ?? 'medium',
        measure_scores: r.measure_scores,
      }));

      // Use extracted calculator for all computation
      const annualReview = annualReviewCalculator.buildAnnualReview(
        practiceUid,
        transformedResults,
        activeMeasures
      );

      // Cache the result
      await reportCardCache.setAnnualReview(organizationId, annualReview);

      const duration = Date.now() - startTime;

      log.info('Fetched annual review by organization', {
        operation: 'get_annual_review_by_org',
        organizationId,
        monthsAnalyzed: annualReview.monthlyScores.length,
        userId: this.userContext.user_id,
        duration,
        cached: false,
        component: 'report-card',
      });

      return annualReview;
    } catch (error) {
      log.error('Failed to get annual review by organization', error as Error, {
        organizationId,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get peer comparison statistics
   * Checks cache first, then calculates from database
   */
  async getPeerComparison(sizeBucket?: SizeBucket): Promise<PeerComparison> {
    const startTime = Date.now();

    // Peer comparison requires at least organization-level access
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    try {
      // If no bucket specified, default to medium
      const targetBucket: SizeBucket = sizeBucket || 'medium';

      // Check cache first
      const cached = await reportCardCache.getPeerStats(targetBucket);
      if (cached) {
        const duration = Date.now() - startTime;
        log.info('Peer comparison cache hit', {
          operation: 'get_peer_comparison',
          sizeBucket: targetBucket,
          userId: this.userContext.user_id,
          duration,
          cached: true,
          component: 'report-card',
        });
        return cached;
      }

      // Get practices in this bucket
      const practices = await db
        .select({ practice_uid: practice_size_buckets.practice_uid })
        .from(practice_size_buckets)
        .where(eq(practice_size_buckets.size_bucket, targetBucket));

      // Get measures
      const measures = await getActiveMeasures();

      // Calculate averages and percentiles for ALL measures using extracted calculator
      const { averages, percentiles } = await peerStatisticsCalculator.calculateAllMeasureStats(
        practices.map((p) => p.practice_uid),
        measures.map((m) => m.measure_name)
      );

      const comparison: PeerComparison = {
        size_bucket: targetBucket,
        practice_count: practices.length,
        averages,
        percentiles,
      };

      // Cache the result
      await reportCardCache.setPeerStats(targetBucket, comparison);

      const duration = Date.now() - startTime;

      log.info('Fetched peer comparison', {
        operation: 'get_peer_comparison',
        sizeBucket: targetBucket,
        practiceCount: practices.length,
        measureCount: measures.length,
        userId: this.userContext.user_id,
        duration,
        component: 'report-card',
      });

      return comparison;
    } catch (error) {
      log.error('Failed to get peer comparison', error as Error, {
        sizeBucket,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }
}

/**
 * Factory function to create RBAC Report Card Service
 */
export function createRBACReportCardService(userContext: UserContext): RBACReportCardService {
  return new RBACReportCardService(userContext);
}
