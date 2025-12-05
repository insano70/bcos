/**
 * RBAC Report Card Service
 *
 * Main service for report card operations with RBAC enforcement.
 * Reuses existing analytics:read:* permissions.
 */

import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { db } from '@/lib/db';
import { reportCardCache } from '@/lib/cache/report-card-cache';
import {
  report_card_results,
  report_card_trends,
  report_card_measures,
  report_card_statistics,
  practice_size_buckets,
} from '@/lib/db/schema';
import { log, logTemplates, calculateChanges } from '@/lib/logger';
import {
  ReportCardNotFoundError,
  MeasureNotFoundError,
  MeasureDuplicateError,
} from '@/lib/errors/report-card-errors';
import type { UserContext } from '@/lib/types/rbac';
import type {
  ReportCard,
  PracticeTrend,
  PeerComparison,
  LocationComparison,
  MeasureConfig,
  MeasureCreateInput,
  MeasureUpdateInput,
  PreviousMonthSummary,
  GradeHistoryEntry,
  AnnualReview,
  MonthlyScore,
  YearOverYearComparison,
  AnnualForecast,
  MeasureYoYComparison,
  MonthlyProjection,
} from '@/lib/types/report-card';
import type { SizeBucket, TrendPeriod, TrendDirection } from '@/lib/constants/report-card';
import { getLetterGrade as sharedGetLetterGrade, compareGrades as sharedCompareGrades } from '@/lib/utils/format-value';
import { locationComparison } from './location-comparison';
import { reportCardGenerator } from './report-card-generator';

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
  // Report Card Retrieval
  // ============================================================================

  /**
   * Get report card for a specific practice
   * Checks cache first, then falls back to database query
   */
  async getReportCard(practiceUid: number): Promise<ReportCard> {
    const startTime = Date.now();

    // Reuse existing analytics permissions
    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      // Check cache first
      const cached = await reportCardCache.getReportCard(practiceUid);
      if (cached) {
        const duration = Date.now() - startTime;
        log.info('Report card cache hit', {
          operation: 'get_report_card',
          practiceUid,
          userId: this.userContext.user_id,
          duration,
          cached: true,
          component: 'report-card',
        });
        return cached;
      }

      // Get the latest report card for this practice
      const [result] = await db
        .select()
        .from(report_card_results)
        .where(eq(report_card_results.practice_uid, practiceUid))
        .orderBy(desc(report_card_results.generated_at))
        .limit(1);

      if (!result) {
        throw new ReportCardNotFoundError(practiceUid);
      }

      const reportCard: ReportCard = {
        result_id: result.result_id,
        practice_uid: result.practice_uid,
        organization_id: result.organization_id,
        report_card_month: result.report_card_month,
        generated_at: result.generated_at?.toISOString() || new Date().toISOString(),
        overall_score: parseFloat(result.overall_score || '0'),
        size_bucket: (result.size_bucket as SizeBucket) || 'medium',
        percentile_rank: parseFloat(result.percentile_rank || '0'),
        insights: (result.insights as string[]) || [],
        measure_scores: (result.measure_scores as Record<string, ReportCard['measure_scores'][string]>) || {},
      };

      // Cache the result
      await reportCardCache.setReportCard(practiceUid, reportCard);

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.read('report_card', {
        resourceId: String(practiceUid),
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          overallScore: reportCard.overall_score,
          sizeBucket: reportCard.size_bucket,
        },
      });

      log.info(template.message, { ...template.context, component: 'report-card' });

      return reportCard;
    } catch (error) {
      if (error instanceof ReportCardNotFoundError) {
        throw error;
      }

      log.error('Failed to get report card', error as Error, {
        practiceUid,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get previous month's report card summary for comparison display
   * Returns null if no previous month data exists
   */
  async getPreviousMonthSummary(
    practiceUid: number,
    currentReportCardMonth: string
  ): Promise<PreviousMonthSummary | null> {
    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      // Calculate the previous month from the current report card month
      const currentDate = new Date(currentReportCardMonth);
      const previousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonthStr = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}-01`;

      // Get the previous month's report card
      const [previousResult] = await db
        .select({
          overall_score: report_card_results.overall_score,
          report_card_month: report_card_results.report_card_month,
        })
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.practice_uid, practiceUid),
            eq(report_card_results.report_card_month, previousMonthStr)
          )
        )
        .limit(1);

      if (!previousResult) {
        return null;
      }

      // Get current month's score for comparison
      const [currentResult] = await db
        .select({
          overall_score: report_card_results.overall_score,
        })
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.practice_uid, practiceUid),
            eq(report_card_results.report_card_month, currentReportCardMonth)
          )
        )
        .limit(1);

      const previousScore = parseFloat(previousResult.overall_score || '0');
      const currentScore = currentResult ? parseFloat(currentResult.overall_score || '0') : 0;
      const scoreChange = currentScore - previousScore;

      // Format month label
      const monthLabel = previousMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      // Calculate grade
      const grade = this.getLetterGrade(previousScore);
      const currentGrade = this.getLetterGrade(currentScore);
      const gradeImproved = this.compareGrades(currentGrade, grade) > 0;

      return {
        month: monthLabel,
        score: previousScore,
        grade,
        scoreChange: Math.round(scoreChange * 10) / 10,
        gradeImproved,
      };
    } catch (error) {
      log.error('Failed to get previous month summary', error as Error, {
        practiceUid,
        currentReportCardMonth,
        component: 'report-card',
      });
      return null;
    }
  }

  /**
   * Get letter grade from score
   * Uses shared utility from format-value
   */
  private getLetterGrade(score: number): string {
    return sharedGetLetterGrade(score);
  }

  /**
   * Compare two grades, returns positive if grade1 > grade2
   * Uses shared utility from format-value
   */
  private compareGrades(grade1: string, grade2: string): number {
    return sharedCompareGrades(grade1, grade2);
  }

  /**
   * Get report card for a specific month
   * @param practiceUid - Practice UID
   * @param month - ISO date string for the month (e.g., "2025-11-01")
   */
  async getReportCardByMonth(practiceUid: number, month: string): Promise<ReportCard> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      const [result] = await db
        .select()
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.practice_uid, practiceUid),
            eq(report_card_results.report_card_month, month)
          )
        )
        .limit(1);

      if (!result) {
        throw new ReportCardNotFoundError(practiceUid);
      }

      const reportCard: ReportCard = {
        result_id: result.result_id,
        practice_uid: result.practice_uid,
        organization_id: result.organization_id,
        report_card_month: result.report_card_month,
        generated_at: result.generated_at?.toISOString() || new Date().toISOString(),
        overall_score: parseFloat(result.overall_score || '0'),
        size_bucket: (result.size_bucket as SizeBucket) || 'medium',
        percentile_rank: parseFloat(result.percentile_rank || '0'),
        insights: (result.insights as string[]) || [],
        measure_scores: (result.measure_scores as Record<string, ReportCard['measure_scores'][string]>) || {},
      };

      const duration = Date.now() - startTime;

      log.info('Fetched report card by month', {
        operation: 'get_report_card_by_month',
        practiceUid,
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

      log.error('Failed to get report card by month', error as Error, {
        practiceUid,
        month,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get annual review data for a practice
   * Returns year-over-year comparison, monthly trends, and summary statistics
   */
  async getAnnualReview(practiceUid: number): Promise<AnnualReview> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      // Get all report cards for the past 24 months
      const results = await db
        .select({
          report_card_month: report_card_results.report_card_month,
          overall_score: report_card_results.overall_score,
          percentile_rank: report_card_results.percentile_rank,
          size_bucket: report_card_results.size_bucket,
          measure_scores: report_card_results.measure_scores,
        })
        .from(report_card_results)
        .where(eq(report_card_results.practice_uid, practiceUid))
        .orderBy(desc(report_card_results.report_card_month))
        .limit(24);

      if (results.length === 0) {
        return {
          practiceUid,
          currentYear: new Date().getFullYear(),
          monthlyScores: [],
          yearOverYear: null,
          measureYoY: [],
          summary: {
            averageScore: 0,
            highestScore: 0,
            lowestScore: 0,
            monthsAnalyzed: 0,
            trend: 'stable',
            improvementPercentage: 0,
          },
          forecast: null,
        };
      }

      // Get active measures for per-measure YoY calculation
      const activeMeasures = await reportCardGenerator.getActiveMeasures();

      // Calculate monthly scores with grades
      const monthlyScores: MonthlyScore[] = results.map((r) => {
        const score = parseFloat(r.overall_score || '0');
        return {
          month: r.report_card_month,
          monthLabel: new Date(r.report_card_month).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          }),
          score,
          grade: this.getLetterGrade(score),
          percentileRank: parseFloat(r.percentile_rank || '0'),
        };
      });

      // Calculate year-over-year comparison
      const currentYear = new Date().getFullYear();
      const thisYearScores = monthlyScores.filter((m) => {
        const year = new Date(m.month).getFullYear();
        return year === currentYear;
      });
      const lastYearScores = monthlyScores.filter((m) => {
        const year = new Date(m.month).getFullYear();
        return year === currentYear - 1;
      });

      let yearOverYear: YearOverYearComparison | null = null;
      if (thisYearScores.length > 0 && lastYearScores.length > 0) {
        const thisYearAvg = thisYearScores.reduce((sum, m) => sum + m.score, 0) / thisYearScores.length;
        const lastYearAvg = lastYearScores.reduce((sum, m) => sum + m.score, 0) / lastYearScores.length;
        const changePercent = lastYearAvg > 0 ? ((thisYearAvg - lastYearAvg) / lastYearAvg) * 100 : 0;

        yearOverYear = {
          currentYear,
          previousYear: currentYear - 1,
          currentYearAverage: Math.round(thisYearAvg * 10) / 10,
          previousYearAverage: Math.round(lastYearAvg * 10) / 10,
          changePercent: Math.round(changePercent * 10) / 10,
          currentYearGrade: this.getLetterGrade(thisYearAvg),
          previousYearGrade: this.getLetterGrade(lastYearAvg),
          monthsCompared: Math.min(thisYearScores.length, lastYearScores.length),
        };
      }

      // Calculate per-measure YoY comparison
      const measureYoY: MeasureYoYComparison[] = [];
      
      // Get this year and last year results for per-measure analysis
      const thisYearResults = results.filter((r) => {
        const year = new Date(r.report_card_month).getFullYear();
        return year === currentYear;
      });
      const lastYearResults = results.filter((r) => {
        const year = new Date(r.report_card_month).getFullYear();
        return year === currentYear - 1;
      });

      if (thisYearResults.length > 0 && lastYearResults.length > 0) {
        for (const measure of activeMeasures) {
          // Get this year average for this measure
          const thisYearValues: number[] = [];
          for (const result of thisYearResults) {
            const measureScores = result.measure_scores as Record<string, { value: number }> | null;
            const measureScore = measureScores?.[measure.measure_name];
            if (measureScore?.value !== undefined) {
              thisYearValues.push(measureScore.value);
            }
          }

          // Get last year average for this measure
          const lastYearValues: number[] = [];
          for (const result of lastYearResults) {
            const measureScores = result.measure_scores as Record<string, { value: number }> | null;
            const measureScore = measureScores?.[measure.measure_name];
            if (measureScore?.value !== undefined) {
              lastYearValues.push(measureScore.value);
            }
          }

          if (thisYearValues.length > 0 && lastYearValues.length > 0) {
            const thisYearAvg = thisYearValues.reduce((sum, v) => sum + v, 0) / thisYearValues.length;
            const lastYearAvg = lastYearValues.reduce((sum, v) => sum + v, 0) / lastYearValues.length;
            const changePercent = lastYearAvg !== 0 
              ? ((thisYearAvg - lastYearAvg) / Math.abs(lastYearAvg)) * 100 
              : 0;

            // Determine if change is an improvement based on higher_is_better
            const isPositiveChange = changePercent > 0;
            const improved = measure.higher_is_better ? isPositiveChange : !isPositiveChange;

            measureYoY.push({
              measureName: measure.measure_name,
              displayName: measure.display_name,
              previousYearAverage: Math.round(lastYearAvg * 100) / 100,
              currentYearAverage: Math.round(thisYearAvg * 100) / 100,
              changePercent: Math.round(changePercent * 10) / 10,
              improved,
              formatType: measure.format_type,
            });
          }
        }
      }

      // Calculate summary statistics
      const scores = monthlyScores.map((m) => m.score);
      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const highestScore = Math.max(...scores);
      const lowestScore = Math.min(...scores);

      // Calculate trend (compare first half to second half)
      // Requires at least 3 months to calculate meaningful trend
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      let improvementPercentage = 0;
      
      if (monthlyScores.length >= 3) {
        const midpoint = Math.floor(scores.length / 2);
        const recentScores = scores.slice(0, midpoint);
        const olderScores = scores.slice(midpoint);
        const recentAvg = recentScores.length > 0 
          ? recentScores.reduce((sum, s) => sum + s, 0) / recentScores.length 
          : 0;
        const olderAvg = olderScores.length > 0 
          ? olderScores.reduce((sum, s) => sum + s, 0) / olderScores.length 
          : 0;
        
        if (olderAvg > 0) {
          const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;
          improvementPercentage = Math.round(changePercent * 10) / 10;
          if (changePercent >= 3) trend = 'improving';
          else if (changePercent <= -3) trend = 'declining';
        }
      }

      // Calculate forecast with month-by-month projections
      let forecast: AnnualForecast | null = null;
      if (monthlyScores.length >= 3) {
        // Use last 6 months for projection
        const recentMonths = monthlyScores.slice(0, Math.min(6, monthlyScores.length));
        const firstMonth = recentMonths[0];
        const lastMonth = recentMonths[recentMonths.length - 1];
        
        // TypeScript safety: ensure we have valid data
        if (!firstMonth || !lastMonth) {
          forecast = null;
        } else {
          const avgRecentChange = recentMonths.length > 1
            ? (firstMonth.score - lastMonth.score) / (recentMonths.length - 1)
            : 0;
          
          // Calculate month-by-month projections through end of year
          const monthlyProjections: MonthlyProjection[] = [];
          const latestMonthDate = new Date(firstMonth.month);
          const currentYearEnd = new Date(currentYear, 11, 31); // Dec 31 of current year
          
          // Project up to 6 months forward or until end of year
          let projMonth = new Date(latestMonthDate.getFullYear(), latestMonthDate.getMonth() + 1, 1);
          let cumulativeChange = 0;
          
          while (projMonth <= currentYearEnd && monthlyProjections.length < 6) {
            cumulativeChange += avgRecentChange;
            const projectedMonthScore = Math.min(100, Math.max(70, firstMonth.score + cumulativeChange));
            
            monthlyProjections.push({
              month: `${projMonth.getFullYear()}-${String(projMonth.getMonth() + 1).padStart(2, '0')}-01`,
              monthLabel: projMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
              projectedScore: Math.round(projectedMonthScore * 10) / 10,
              projectedGrade: this.getLetterGrade(projectedMonthScore),
            });
            
            // Move to next month
            projMonth = new Date(projMonth.getFullYear(), projMonth.getMonth() + 1, 1);
          }

          // Final projected score is the last month's projection or 3 months out
          const finalProjection = monthlyProjections[Math.min(2, monthlyProjections.length - 1)];
          const projectedScore = finalProjection?.projectedScore ?? Math.min(100, Math.max(70, firstMonth.score + (avgRecentChange * 3)));
          const projectedGrade = this.getLetterGrade(projectedScore);

          forecast = {
            projectedScore: Math.round(projectedScore * 10) / 10,
            projectedGrade,
            confidence: recentMonths.length >= 6 ? 'high' : recentMonths.length >= 3 ? 'medium' : 'low',
            basedOnMonths: recentMonths.length,
            projectionNote: avgRecentChange > 0 
              ? 'Based on recent positive trends, score is projected to improve.'
              : avgRecentChange < 0
              ? 'Based on recent trends, focus on improvement is recommended.'
              : 'Score is projected to remain stable based on recent performance.',
            monthlyProjections,
          };
        }
      }

      const duration = Date.now() - startTime;

      log.info('Fetched annual review', {
        operation: 'get_annual_review',
        practiceUid,
        monthsAnalyzed: monthlyScores.length,
        userId: this.userContext.user_id,
        duration,
        component: 'report-card',
      });

      return {
        practiceUid,
        currentYear,
        monthlyScores,
        yearOverYear,
        measureYoY,
        summary: {
          averageScore: Math.round(avgScore * 10) / 10,
          highestScore: Math.round(highestScore * 10) / 10,
          lowestScore: Math.round(lowestScore * 10) / 10,
          monthsAnalyzed: monthlyScores.length,
          trend,
          improvementPercentage,
        },
        forecast,
      };
    } catch (error) {
      log.error('Failed to get annual review', error as Error, {
        practiceUid,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get available report card months for a practice
   * Returns list of months that have report cards, most recent first
   */
  async getAvailableMonths(practiceUid: number, limit: number = 6): Promise<string[]> {
    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      const results = await db
        .select({ report_card_month: report_card_results.report_card_month })
        .from(report_card_results)
        .where(eq(report_card_results.practice_uid, practiceUid))
        .orderBy(desc(report_card_results.report_card_month))
        .limit(limit);

      return results.map((r) => r.report_card_month);
    } catch (error) {
      log.error('Failed to get available months', error as Error, {
        practiceUid,
        component: 'report-card',
      });
      return [];
    }
  }

  /**
   * Get grade history for the last N months
   * Returns an array of monthly grade summaries, most recent first
   */
  async getGradeHistory(
    practiceUid: number,
    limit: number = 12
  ): Promise<GradeHistoryEntry[]> {
    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

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
        .where(eq(report_card_results.practice_uid, practiceUid))
        .orderBy(desc(report_card_results.report_card_month))
        .limit(limit);

      return results.map((r, index) => {
        const score = parseFloat(r.overall_score || '0');
        const grade = this.getLetterGrade(score);
        const monthDate = new Date(r.report_card_month);
        
        // Calculate change from previous month (next in array since sorted desc)
        let scoreChange: number | null = null;
        let gradeChange: 'up' | 'down' | 'same' | null = null;
        
        if (index < results.length - 1) {
          const prevScore = parseFloat(results[index + 1]?.overall_score || '0');
          const prevGrade = this.getLetterGrade(prevScore);
          scoreChange = Math.round((score - prevScore) * 10) / 10;
          const comparison = this.compareGrades(grade, prevGrade);
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
      log.error('Failed to get grade history', error as Error, {
        practiceUid,
        limit,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get trends for a specific practice
   */
  async getTrends(practiceUid: number, period?: TrendPeriod): Promise<PracticeTrend[]> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    try {
      const conditions = [eq(report_card_trends.practice_uid, practiceUid)];

      if (period) {
        conditions.push(eq(report_card_trends.trend_period, period));
      }

      const trends = await db
        .select()
        .from(report_card_trends)
        .where(and(...conditions))
        .orderBy(report_card_trends.measure_name);

      const duration = Date.now() - startTime;

      log.info('Fetched practice trends', {
        operation: 'get_trends',
        practiceUid,
        period: period || 'all',
        trendCount: trends.length,
        userId: this.userContext.user_id,
        duration,
        component: 'report-card',
      });

      return trends.map((t) => ({
        trend_id: t.trend_id,
        practice_uid: t.practice_uid,
        measure_name: t.measure_name,
        trend_period: t.trend_period as TrendPeriod,
        trend_direction: t.trend_direction as TrendDirection,
        trend_percentage: parseFloat(t.trend_percentage || '0'),
        calculated_at: t.calculated_at?.toISOString() || new Date().toISOString(),
      }));
    } catch (error) {
      log.error('Failed to get trends', error as Error, {
        practiceUid,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get location comparison for a practice
   */
  async getLocationComparison(
    practiceUid: number,
    measureName?: string
  ): Promise<LocationComparison> {
    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    // Verify user has access to this specific practice
    this.requirePracticeAccess(practiceUid);

    return locationComparison.getComparison(practiceUid, measureName);
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
      const measures = await reportCardGenerator.getActiveMeasures();

      // Calculate averages and percentiles for ALL measures in a single query
      const { averages, percentiles } = await this.calculateAllMeasureStats(
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

  /**
   * Calculate statistics for ALL measures in a single bulk query
   * Returns averages and percentile breakdowns for each measure
   * 
   * OPTIMIZATION: Replaced N queries (1 per measure) with 1 bulk query
   */
  private async calculateAllMeasureStats(
    practiceUids: number[],
    measureNames: string[]
  ): Promise<{
    averages: Record<string, number>;
    percentiles: Record<string, { p25: number; p50: number; p75: number }>;
  }> {
    const averages: Record<string, number> = {};
    const percentiles: Record<string, { p25: number; p50: number; p75: number }> = {};

    // Initialize defaults for all measures
    for (const measureName of measureNames) {
      averages[measureName] = 0;
      percentiles[measureName] = { p25: 0, p50: 0, p75: 0 };
    }

    if (practiceUids.length === 0 || measureNames.length === 0) {
      return { averages, percentiles };
    }

    // Bulk query: Get latest value for each practice/measure combination
    const stats = await db
      .select({
        measure_name: report_card_statistics.measure_name,
        practice_uid: report_card_statistics.practice_uid,
        value: report_card_statistics.value,
        period_date: report_card_statistics.period_date,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practiceUids),
          inArray(report_card_statistics.measure_name, measureNames)
        )
      )
      .orderBy(
        report_card_statistics.practice_uid,
        report_card_statistics.measure_name,
        desc(report_card_statistics.period_date)
      );

    // Group values by measure (taking only the latest value per practice)
    const measureValuesMap: Map<string, number[]> = new Map();
    const seenPractices: Map<string, Set<number>> = new Map();

    for (const stat of stats) {
      const measureKey = stat.measure_name.toLowerCase();

      // Initialize if needed
      if (!measureValuesMap.has(measureKey)) {
        measureValuesMap.set(measureKey, []);
        seenPractices.set(measureKey, new Set());
      }

      // Only take the first (latest) value per practice/measure
      const seen = seenPractices.get(measureKey);
      if (seen && !seen.has(stat.practice_uid)) {
        seen.add(stat.practice_uid);
        measureValuesMap.get(measureKey)?.push(parseFloat(stat.value));
      }
    }

    // Calculate stats for each measure
    for (const measureName of measureNames) {
      const measureKey = measureName.toLowerCase();
      const values = measureValuesMap.get(measureKey);

      if (!values || values.length === 0) {
        continue;
      }

      // Sort for percentile calculation
      const sortedValues = [...values].sort((a, b) => a - b);

      // Calculate average
      averages[measureName] = Math.round(
        (sortedValues.reduce((sum, v) => sum + v, 0) / sortedValues.length) * 100
      ) / 100;

      // Calculate percentiles
      const getPercentile = (arr: number[], percentile: number): number => {
        if (arr.length === 0) return 0;
        const index = Math.ceil((percentile / 100) * arr.length) - 1;
        const clampedIndex = Math.max(0, Math.min(index, arr.length - 1));
        return arr[clampedIndex] ?? 0;
      };

      percentiles[measureName] = {
        p25: getPercentile(sortedValues, 25),
        p50: getPercentile(sortedValues, 50),
        p75: getPercentile(sortedValues, 75),
      };
    }

    return { averages, percentiles };
  }

  /**
   * Calculate measure statistics for a set of practices
   * Returns average and percentile breakdowns for peer comparison
   * @deprecated Use calculateAllMeasureStats for bulk operations
   */
  private async calculateMeasureStats(
    practiceUids: number[],
    measureName: string
  ): Promise<{ average: number; p25: number; p50: number; p75: number }> {
    if (practiceUids.length === 0) {
      return { average: 0, p25: 0, p50: 0, p75: 0 };
    }

    // Get the latest value for each practice using case-insensitive measure name match
    const stats = await db
      .selectDistinctOn([report_card_statistics.practice_uid], {
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practiceUids),
          sql`LOWER(${report_card_statistics.measure_name}) = LOWER(${measureName})`
        )
      )
      .orderBy(
        report_card_statistics.practice_uid,
        desc(report_card_statistics.period_date)
      );

    if (stats.length === 0) {
      return { average: 0, p25: 0, p50: 0, p75: 0 };
    }

    // Convert to numbers and sort for percentile calculation
    const values = stats.map((s) => parseFloat(s.value)).sort((a, b) => a - b);

    // Calculate average
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;

    // Calculate percentiles
    const getPercentile = (arr: number[], percentile: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      const clampedIndex = Math.max(0, Math.min(index, arr.length - 1));
      return arr[clampedIndex] ?? 0;
    };

    return {
      average: Math.round(average * 100) / 100,
      p25: getPercentile(values, 25),
      p50: getPercentile(values, 50),
      p75: getPercentile(values, 75),
    };
  }

  // ============================================================================
  // Measure Configuration (Admin)
  // ============================================================================

  /**
   * Get all measure configurations
   */
  async getMeasures(activeOnly: boolean = true): Promise<MeasureConfig[]> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all',
    ]);

    try {
      const conditions = activeOnly ? [eq(report_card_measures.is_active, true)] : [];

      const measures = await db
        .select()
        .from(report_card_measures)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(report_card_measures.weight));

      const duration = Date.now() - startTime;

      log.info('Fetched measure configurations', {
        operation: 'get_measures',
        activeOnly,
        measureCount: measures.length,
        userId: this.userContext.user_id,
        duration,
        component: 'report-card',
      });

      return measures.map((m) => ({
        measure_id: m.measure_id,
        measure_name: m.measure_name,
        display_name: m.display_name,
        weight: parseFloat(m.weight || '5'),
        is_active: m.is_active ?? true,
        higher_is_better: m.higher_is_better ?? true,
        format_type: (m.format_type as 'number' | 'currency' | 'percentage') || 'number',
        data_source_id: m.data_source_id,
        value_column: m.value_column ?? 'numeric_value',
        filter_criteria: (m.filter_criteria as Record<string, string>) || {},
        created_at: m.created_at?.toISOString() || new Date().toISOString(),
        updated_at: m.updated_at?.toISOString() || new Date().toISOString(),
      }));
    } catch (error) {
      log.error('Failed to get measures', error as Error, {
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Create a new measure configuration
   */
  async createMeasure(data: MeasureCreateInput): Promise<MeasureConfig> {
    const startTime = Date.now();

    // Admin operations require full access
    this.requirePermission('analytics:read:all');

    try {
      // Check for duplicate
      const [existing] = await db
        .select({ measure_id: report_card_measures.measure_id })
        .from(report_card_measures)
        .where(eq(report_card_measures.measure_name, data.measure_name))
        .limit(1);

      if (existing) {
        throw new MeasureDuplicateError(data.measure_name);
      }

      const [inserted] = await db
        .insert(report_card_measures)
        .values({
          measure_name: data.measure_name,
          display_name: data.display_name,
          weight: String(data.weight),
          higher_is_better: data.higher_is_better,
          format_type: data.format_type,
          data_source_id: data.data_source_id ?? null,
          value_column: data.value_column ?? 'numeric_value',
          filter_criteria: data.filter_criteria ?? {},
        })
        .returning();

      if (!inserted) {
        throw new Error('Failed to create measure - no result returned');
      }

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.create('measure', {
        resourceId: String(inserted.measure_id),
        resourceName: inserted.measure_name,
        userId: this.userContext.user_id,
        duration,
      });

      log.info(template.message, { ...template.context, component: 'report-card' });

      return {
        measure_id: inserted.measure_id,
        measure_name: inserted.measure_name,
        display_name: inserted.display_name,
        weight: parseFloat(inserted.weight || '5'),
        is_active: inserted.is_active ?? true,
        higher_is_better: inserted.higher_is_better ?? true,
        format_type: (inserted.format_type as 'number' | 'currency' | 'percentage') || 'number',
        data_source_id: inserted.data_source_id,
        value_column: inserted.value_column ?? 'numeric_value',
        filter_criteria: (inserted.filter_criteria as Record<string, string>) || {},
        created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
        updated_at: inserted.updated_at?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof MeasureDuplicateError) {
        throw error;
      }

      log.error('Failed to create measure', error as Error, {
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Update a measure configuration
   */
  async updateMeasure(measureId: number, data: MeasureUpdateInput): Promise<MeasureConfig> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all');

    try {
      // Get existing measure
      const [existing] = await db
        .select()
        .from(report_card_measures)
        .where(eq(report_card_measures.measure_id, measureId))
        .limit(1);

      if (!existing) {
        throw new MeasureNotFoundError(measureId);
      }

      const [updated] = await db
        .update(report_card_measures)
        .set({
          ...(data.measure_name && { measure_name: data.measure_name }),
          ...(data.display_name && { display_name: data.display_name }),
          ...(data.weight !== undefined && { weight: String(data.weight) }),
          ...(data.higher_is_better !== undefined && { higher_is_better: data.higher_is_better }),
          ...(data.format_type && { format_type: data.format_type }),
          ...(data.is_active !== undefined && { is_active: data.is_active }),
          ...(data.data_source_id !== undefined && { data_source_id: data.data_source_id }),
          ...(data.value_column !== undefined && { value_column: data.value_column }),
          ...(data.filter_criteria !== undefined && { filter_criteria: data.filter_criteria }),
          updated_at: new Date(),
        })
        .where(eq(report_card_measures.measure_id, measureId))
        .returning();

      if (!updated) {
        throw new Error('Failed to update measure - no result returned');
      }

      const duration = Date.now() - startTime;

      const changes = calculateChanges(existing, data);
      const template = logTemplates.crud.update('measure', {
        resourceId: String(measureId),
        resourceName: updated.measure_name,
        userId: this.userContext.user_id,
        changes,
        duration,
      });

      log.info(template.message, { ...template.context, component: 'report-card' });

      return {
        measure_id: updated.measure_id,
        measure_name: updated.measure_name,
        display_name: updated.display_name,
        weight: parseFloat(updated.weight || '5'),
        is_active: updated.is_active ?? true,
        higher_is_better: updated.higher_is_better ?? true,
        format_type: (updated.format_type as 'number' | 'currency' | 'percentage') || 'number',
        data_source_id: updated.data_source_id,
        value_column: updated.value_column ?? 'numeric_value',
        filter_criteria: (updated.filter_criteria as Record<string, string>) || {},
        created_at: updated.created_at?.toISOString() || new Date().toISOString(),
        updated_at: updated.updated_at?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof MeasureNotFoundError) {
        throw error;
      }

      log.error('Failed to update measure', error as Error, {
        measureId,
        userId: this.userContext.user_id,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Delete a measure configuration (soft delete)
   */
  async deleteMeasure(measureId: number): Promise<boolean> {
    const startTime = Date.now();

    this.requirePermission('analytics:read:all');

    try {
      const [existing] = await db
        .select()
        .from(report_card_measures)
        .where(eq(report_card_measures.measure_id, measureId))
        .limit(1);

      if (!existing) {
        throw new MeasureNotFoundError(measureId);
      }

      await db
        .update(report_card_measures)
        .set({
          is_active: false,
          updated_at: new Date(),
        })
        .where(eq(report_card_measures.measure_id, measureId));

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.delete('measure', {
        resourceId: String(measureId),
        resourceName: existing.measure_name,
        userId: this.userContext.user_id,
        soft: true,
        duration,
      });

      log.info(template.message, { ...template.context, component: 'report-card' });

      return true;
    } catch (error) {
      if (error instanceof MeasureNotFoundError) {
        throw error;
      }

      log.error('Failed to delete measure', error as Error, {
        measureId,
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
