/**
 * Report Card Generator Service
 *
 * Generates weighted scores, percentile rankings, and insights
 * for practice report cards.
 * 
 * Stores monthly snapshots identified by report_card_month.
 * Supports historical generation for backfilling past months.
 */

import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  report_card_statistics,
  report_card_measures,
  report_card_results,
  practice_size_buckets,
} from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { InsufficientDataError } from '@/lib/errors/report-card-errors';
import { GRADE_THRESHOLDS, REPORT_CARD_LIMITS, type SizeBucket, type TrendDirection } from '@/lib/constants/report-card';
import type {
  ReportCard,
  MeasureScore,
  MeasureConfig,
  GenerationResult,
} from '@/lib/types/report-card';
import type {
  GenerationOptions,
  MeasureScoringResult,
} from './types';

/**
 * Get the report card month (first day of last month)
 * Report cards are always for the previous complete month.
 * Returns ISO date string (YYYY-MM-DD)
 */
function getReportCardMonth(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return formatMonthString(lastMonth);
}

/**
 * Format a date as YYYY-MM-DD (first of month)
 */
function formatMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Get the last N months as an array of date strings
 * @param months - Number of months to go back
 * @returns Array of month strings (e.g., ["2025-10-01", "2025-09-01", ...])
 */
function getHistoricalMonths(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  
  for (let i = 1; i <= months; i++) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(formatMonthString(targetMonth));
  }
  
  return result;
}

/**
 * Report Card Generator Service
 *
 * Generates comprehensive report cards with weighted scores and insights.
 * Does not require RBAC context as it's designed for CLI/cron use.
 * Supports historical generation for backfilling past months.
 */
export class ReportCardGeneratorService {
  /**
   * Generate report cards for all practices or a specific practice
   * 
   * @param options.historical - If true, generates for all historical months
   * @param options.historicalMonths - Number of months to generate (default 24)
   * @param options.targetMonth - Specific month to generate (e.g., "2024-01-01")
   */
  async generateAll(options: GenerationOptions = {}): Promise<GenerationResult> {
    const startTime = Date.now();
    let cardsGenerated = 0;
    const errors: GenerationResult['errors'] = [];
    const practiceSet = new Set<number>();

    try {
      // Get practices to process
      let practices: number[];

      if (options.practiceUid) {
        practices = [options.practiceUid];
      } else {
        const result = await db
          .selectDistinct({ practice_uid: report_card_statistics.practice_uid })
          .from(report_card_statistics);
        practices = result.map((r) => r.practice_uid);
      }

      // Determine which months to generate
      let monthsToGenerate: string[];
      
      if (options.historical) {
        const numMonths = options.historicalMonths || 24;
        monthsToGenerate = getHistoricalMonths(numMonths);
        log.info('Historical generation mode', {
          operation: 'generate_report_cards',
          monthsToGenerate: monthsToGenerate.length,
          firstMonth: monthsToGenerate[monthsToGenerate.length - 1],
          lastMonth: monthsToGenerate[0],
          component: 'report-card',
        });
      } else if (options.targetMonth) {
        monthsToGenerate = [options.targetMonth];
      } else {
        monthsToGenerate = [getReportCardMonth()];
      }

      log.info('Starting report card generation', {
        operation: 'generate_report_cards',
        practiceCount: practices.length,
        monthCount: monthsToGenerate.length,
        practiceUid: options.practiceUid || 'all',
        force: options.force,
        historical: options.historical || false,
        component: 'report-card',
      });

      // Get active measures configuration
      const measures = await this.getActiveMeasures();

      if (measures.length === 0) {
        log.warn('No active measures configured for report card generation', {
          operation: 'generate_report_cards',
          component: 'report-card',
        });

        return {
          success: true,
          practicesProcessed: 0,
          cardsGenerated: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }

      // Generate report cards for each practice and each month
      for (const targetMonth of monthsToGenerate) {
        for (const practiceUid of practices) {
          try {
            const card = await this.generateForPractice(
              practiceUid, 
              measures, 
              options.force || options.historical, // Force for historical
              targetMonth
            );

            if (card) {
              cardsGenerated++;
              practiceSet.add(practiceUid);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorCode = error instanceof InsufficientDataError ? 'INSUFFICIENT_DATA' : 'GENERATION_FAILED';

            // Only log first few errors per practice to avoid spam
            const practiceErrors = errors.filter(e => e.practiceUid === practiceUid);
            if (practiceErrors.length < 3) {
              errors.push({
                practiceUid,
                error: `[${targetMonth}] ${errorMessage}`,
                code: errorCode,
              });
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      log.info('Report card generation completed', {
        operation: 'generate_report_cards',
        practicesProcessed: practiceSet.size,
        cardsGenerated,
        monthsProcessed: monthsToGenerate.length,
        errorCount: errors.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        success: cardsGenerated > 0,
        practicesProcessed: practiceSet.size,
        cardsGenerated,
        errors,
        duration,
      };
    } catch (error) {
      log.error('Report card generation failed', error as Error, {
        operation: 'generate_report_cards',
        practiceUid: options.practiceUid,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Generate report card for a single practice for a specific month
   * @param practiceUid - Practice UID to generate report card for
   * @param measures - Optional measures config (will fetch if not provided)
   * @param force - Force regeneration even if recent report card exists for this month
   * @param targetMonth - Target month (YYYY-MM-DD), defaults to last month
   */
  async generateForPractice(
    practiceUid: number,
    measures?: MeasureConfig[],
    force?: boolean,
    targetMonth?: string
  ): Promise<ReportCard | null> {
    // Get the report card month we're generating for
    const reportCardMonth = targetMonth || getReportCardMonth();

    // Check if report card exists for this month (skip if not forcing)
    if (!force) {
      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - REPORT_CARD_LIMITS.STALE_THRESHOLD_HOURS);

      const [existing] = await db
        .select({
          result_id: report_card_results.result_id,
          generated_at: report_card_results.generated_at,
        })
        .from(report_card_results)
        .where(
          and(
            eq(report_card_results.practice_uid, practiceUid),
            eq(report_card_results.report_card_month, reportCardMonth)
          )
        )
        .limit(1);

      if (existing?.generated_at && existing.generated_at > staleThreshold) {
        // Recent report card exists for this month, skip regeneration
        return null;
      }
    }

    // Get measures if not provided
    const activeMeasures = measures || await this.getActiveMeasures();

    if (activeMeasures.length === 0) {
      throw new InsufficientDataError(practiceUid, 'No active measures configured');
    }

    // Get practice size bucket
    const [sizeResult] = await db
      .select()
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.practice_uid, practiceUid))
      .limit(1);

    if (!sizeResult) {
      throw new InsufficientDataError(practiceUid, 'Practice size bucket not assigned');
    }

    const sizeBucket = sizeResult.size_bucket as SizeBucket;
    const percentileRank = parseFloat(sizeResult.percentile || '0');

    // Calculate scores for each measure using data as of the target month
    const measureScores: Record<string, MeasureScore> = {};
    const scoringResults: MeasureScoringResult[] = [];

    for (const measure of activeMeasures) {
      const scoring = await this.scoreMeasureForMonth(
        practiceUid, 
        measure, 
        sizeBucket,
        reportCardMonth
      );

      if (scoring) {
        scoringResults.push(scoring);
        measureScores[measure.measure_name] = {
          score: scoring.normalizedScore,
          value: scoring.rawValue,
          trend: scoring.trend,
          trend_percentage: scoring.trendPercentage,
          percentile: scoring.percentileRank,
          peer_average: scoring.peerAverage,
          peer_count: scoring.peerCount,
        };
      }
    }

    if (scoringResults.length === 0) {
      throw new InsufficientDataError(practiceUid, `No measure scores for ${reportCardMonth}`);
    }

    // Calculate overall weighted score
    const overallScore = this.calculateOverallScore(scoringResults, activeMeasures);

    // Generate insights
    const insights = this.generateInsights(scoringResults, activeMeasures);

    // Get organization ID
    const [orgResult] = await db
      .select({ organization_id: report_card_statistics.organization_id })
      .from(report_card_statistics)
      .where(eq(report_card_statistics.practice_uid, practiceUid))
      .limit(1);

    const organizationId = orgResult?.organization_id || null;

    // Save report card
    const reportCard = await this.saveReportCard({
      practiceUid,
      organizationId,
      reportCardMonth,
      overallScore,
      sizeBucket,
      percentileRank,
      insights,
      measureScores,
    });

    return reportCard;
  }

  /**
   * Score a single measure for a practice for a specific month
   * Uses data from that month, not the latest data
   */
  private async scoreMeasureForMonth(
    practiceUid: number,
    measure: MeasureConfig,
    sizeBucket: SizeBucket,
    targetMonth: string
  ): Promise<MeasureScoringResult | null> {
    // Get statistics for the target month
    // Match month by comparing the period_date's year-month
    const targetDate = new Date(targetMonth);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

    const [monthStat] = await db
      .select({ 
        value: report_card_statistics.value,
        period_date: report_card_statistics.period_date,
      })
      .from(report_card_statistics)
      .where(
        and(
          eq(report_card_statistics.practice_uid, practiceUid),
          eq(report_card_statistics.measure_name, measure.measure_name),
          sql`${report_card_statistics.period_date} >= ${monthStart.toISOString()}`,
          sql`${report_card_statistics.period_date} < ${monthEnd.toISOString()}`
        )
      )
      .limit(1);

    if (!monthStat) {
      return null;
    }

    const rawValue = parseFloat(monthStat.value);

    // Get peer statistics for the same month (excluding current practice for true peer comparison)
    const peerData = await this.getPeerStatisticsForMonth(
      measure.measure_name, 
      sizeBucket,
      targetMonth,
      practiceUid  // Exclude self from peer comparison
    );

    // Calculate percentile rank (will be null if insufficient peers)
    // Minimum 2 peers required for meaningful percentile
    const percentileRank = peerData.peerCount >= 2 
      ? this.calculatePercentile(rawValue, peerData.values, measure.higher_is_better)
      : null;

    // Calculate trend by comparing to prior 3 months
    const trendData = await this.calculateTrendForMonth(
      practiceUid,
      measure.measure_name,
      targetMonth,
      measure.higher_is_better
    );

    // Normalize score to 0-100 scale
    // When percentile is null (insufficient peers), use 50 as neutral baseline
    const effectivePercentile = percentileRank ?? 50;
    const normalizedScore = this.normalizeScore(effectivePercentile, trendData.direction, measure.higher_is_better);

    return {
      measureName: measure.measure_name,
      rawValue,
      normalizedScore,
      percentileRank: percentileRank ?? null,  // Preserve null to indicate insufficient data
      peerAverage: peerData.average,
      peerCount: peerData.peerCount,  // Include peer count for UI to show warnings
      trend: trendData.direction,
      trendPercentage: trendData.percentage,
    };
  }

  /**
   * Calculate trend for a measure by comparing target month to prior 3 months average
   */
  private async calculateTrendForMonth(
    practiceUid: number,
    measureName: string,
    targetMonth: string,
    higherIsBetter: boolean
  ): Promise<{ direction: TrendDirection; percentage: number }> {
    const targetDate = new Date(targetMonth);
    
    // Get prior 3 months
    const priorMonths: Date[] = [];
    for (let i = 1; i <= 3; i++) {
      priorMonths.push(new Date(targetDate.getFullYear(), targetDate.getMonth() - i, 1));
    }

    // Get values for prior months
    const priorStats = await db
      .select({ 
        value: report_card_statistics.value,
        period_date: report_card_statistics.period_date,
      })
      .from(report_card_statistics)
      .where(
        and(
          eq(report_card_statistics.practice_uid, practiceUid),
          eq(report_card_statistics.measure_name, measureName),
          sql`${report_card_statistics.period_date} >= ${priorMonths[2]?.toISOString() || priorMonths[0]?.toISOString()}`,
          sql`${report_card_statistics.period_date} < ${targetDate.toISOString()}`
        )
      );

    if (priorStats.length === 0) {
      return { direction: 'stable', percentage: 0 };
    }

    // Get target month value
    const targetMonthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const targetMonthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
    
    const [targetStat] = await db
      .select({ value: report_card_statistics.value })
      .from(report_card_statistics)
      .where(
        and(
          eq(report_card_statistics.practice_uid, practiceUid),
          eq(report_card_statistics.measure_name, measureName),
          sql`${report_card_statistics.period_date} >= ${targetMonthStart.toISOString()}`,
          sql`${report_card_statistics.period_date} < ${targetMonthEnd.toISOString()}`
        )
      )
      .limit(1);

    if (!targetStat) {
      return { direction: 'stable', percentage: 0 };
    }

    const targetValue = parseFloat(targetStat.value);
    const priorValues = priorStats.map(s => parseFloat(s.value));
    const priorAvg = priorValues.reduce((sum, v) => sum + v, 0) / priorValues.length;

    if (priorAvg === 0) {
      return { direction: 'stable', percentage: 0 };
    }

    const percentChange = ((targetValue - priorAvg) / priorAvg) * 100;
    // Cap at ±99999.99 to prevent overflow
    const cappedPercentChange = Math.max(-99999.99, Math.min(99999.99, percentChange));

    // Determine direction based on higherIsBetter
    let direction: TrendDirection = 'stable';
    if (Math.abs(cappedPercentChange) >= 5) {
      const isPositive = cappedPercentChange > 0;
      if (higherIsBetter) {
        direction = isPositive ? 'improving' : 'declining';
      } else {
        direction = isPositive ? 'declining' : 'improving';
      }
    }

    return { 
      direction, 
      percentage: Math.round(cappedPercentChange * 100) / 100 
    };
  }

  /**
   * Get peer statistics for a measure within a size bucket for a specific month
   * 
   * @param measureName - The measure to get stats for
   * @param sizeBucket - The size bucket to compare against
   * @param targetMonth - The month to get stats for
   * @param excludePracticeUid - Optional practice to exclude from peer pool (typically the current practice)
   */
  private async getPeerStatisticsForMonth(
    measureName: string,
    sizeBucket: SizeBucket,
    targetMonth: string,
    excludePracticeUid?: number
  ): Promise<{ values: number[]; average: number; peerCount: number }> {
    // Get practices in the same size bucket
    const peerPractices = await db
      .select({ practice_uid: practice_size_buckets.practice_uid })
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.size_bucket, sizeBucket));

    if (peerPractices.length === 0) {
      return { values: [], average: 0, peerCount: 0 };
    }

    // Exclude the current practice from the peer pool to get true peer comparison
    const practiceUids = peerPractices
      .map((p) => p.practice_uid)
      .filter((uid) => uid !== excludePracticeUid);

    if (practiceUids.length === 0) {
      // Only the current practice is in the bucket
      return { values: [], average: 0, peerCount: 0 };
    }

    // Get value for each peer practice for the target month
    const targetDate = new Date(targetMonth);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

    const peerStats = await db
      .select({
        practice_uid: report_card_statistics.practice_uid,
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practiceUids),
          eq(report_card_statistics.measure_name, measureName),
          sql`${report_card_statistics.period_date} >= ${monthStart.toISOString()}`,
          sql`${report_card_statistics.period_date} < ${monthEnd.toISOString()}`
        )
      );

    const values = peerStats.map((s) => parseFloat(s.value));
    const average = values.length > 0
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : 0;

    return { values, average, peerCount: values.length };
  }

  /**
   * Calculate percentile rank
   */
  private calculatePercentile(
    value: number,
    allValues: number[],
    higherIsBetter: boolean
  ): number {
    if (allValues.length === 0) return 50;

    const countBelow = allValues.filter((v) =>
      higherIsBetter ? v < value : v > value
    ).length;

    return (countBelow / allValues.length) * 100;
  }

  /**
   * Normalize score to a grade-friendly 70-100 scale
   * 
   * TRANSFORMATION LOGIC:
   * Raw percentile (0-100) is transformed to fit within 70-100 range:
   * - 0th percentile → 70 (C-, the floor)
   * - 50th percentile → 85 (B-)
   * - 100th percentile → 100 (A+)
   * 
   * This ensures:
   * - No practice gets below C- (70)
   * - Average performers (50th percentile) get B- (85)
   * - Top performers get A range scores
   * - There's still meaningful differentiation
   */
  private normalizeScore(
    percentileRank: number,
    trend: TrendDirection,
    _higherIsBetter: boolean
  ): number {
    // Transform percentile (0-100) to grading scale (70-100)
    // Formula: 70 + (percentile / 100) * 30
    let score = 70 + (percentileRank / 100) * 30;

    // Adjust for trend (±3 points instead of ±5 to not exceed 100)
    if (trend === 'improving') {
      score = Math.min(100, score + 3);
    } else if (trend === 'declining') {
      score = Math.max(70, score - 3);
    }

    return Math.round(score * 10) / 10;
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(
    results: MeasureScoringResult[],
    measures: MeasureConfig[]
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const result of results) {
      const measure = measures.find((m) => m.measure_name === result.measureName);
      const weight = measure?.weight || 5;

      totalWeight += weight;
      weightedSum += result.normalizedScore * weight;
    }

    if (totalWeight === 0) return 0;

    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  /**
   * Generate human-readable insights
   */
  private generateInsights(
    results: MeasureScoringResult[],
    measures: MeasureConfig[]
  ): string[] {
    const insights: string[] = [];

    // Find top and bottom performers
    const sorted = [...results].sort((a, b) => b.normalizedScore - a.normalizedScore);

    const top = sorted[0];
    if (top) {
      const topMeasure = measures.find((m) => m.measure_name === top.measureName);
      const percentileText = top.percentileRank !== null 
        ? ` (${Math.round(top.percentileRank)}th percentile)` 
        : '';
      insights.push(
        `Strongest performance in ${topMeasure?.display_name ?? top.measureName}${percentileText}`
      );
    }

    if (sorted.length > 1) {
      const bottom = sorted[sorted.length - 1];
      if (bottom && bottom.normalizedScore < 50) {
        const bottomMeasure = measures.find((m) => m.measure_name === bottom.measureName);
        const percentileText = bottom.percentileRank !== null 
          ? ` (${Math.round(bottom.percentileRank)}th percentile)` 
          : '';
        insights.push(
          `Opportunity for improvement in ${bottomMeasure?.display_name ?? bottom.measureName}${percentileText}`
        );
      }
    }

    // Highlight improving trends
    const improving = results.filter((r) => r.trend === 'improving');
    if (improving.length > 0) {
      const names = improving
        .map((r) => {
          const m = measures.find((m) => m.measure_name === r.measureName);
          return m?.display_name || r.measureName;
        })
        .join(', ');
      insights.push(`Positive trends in ${names}`);
    }

    // Highlight declining trends
    const declining = results.filter((r) => r.trend === 'declining');
    if (declining.length > 0) {
      const names = declining
        .map((r) => {
          const m = measures.find((m) => m.measure_name === r.measureName);
          return m?.display_name || r.measureName;
        })
        .join(', ');
      insights.push(`Watch for declining trends in ${names}`);
    }

    return insights;
  }

  /**
   * Save report card to database
   * 
   * Stores one report card per practice per month (report_card_month).
   * If a report card exists for the same practice/month, it updates it.
   * Otherwise, inserts a new record.
   */
  private async saveReportCard(data: {
    practiceUid: number;
    organizationId: string | null;
    reportCardMonth: string;
    overallScore: number;
    sizeBucket: SizeBucket;
    percentileRank: number;
    insights: string[];
    measureScores: Record<string, MeasureScore>;
  }): Promise<ReportCard> {
    // Check for existing report card for this practice AND month
    const [existing] = await db
      .select({ result_id: report_card_results.result_id })
      .from(report_card_results)
      .where(
        and(
          eq(report_card_results.practice_uid, data.practiceUid),
          eq(report_card_results.report_card_month, data.reportCardMonth)
        )
      )
      .limit(1);

    let resultId: string;

    if (existing) {
      // Update existing report card for this month
      await db
        .update(report_card_results)
        .set({
          overall_score: String(data.overallScore),
          size_bucket: data.sizeBucket,
          percentile_rank: String(data.percentileRank),
          insights: data.insights,
          measure_scores: data.measureScores,
          organization_id: data.organizationId,
          generated_at: new Date(),
        })
        .where(eq(report_card_results.result_id, existing.result_id));

      resultId = existing.result_id;
    } else {
      // Insert new report card for this month
      const [inserted] = await db
        .insert(report_card_results)
        .values({
          practice_uid: data.practiceUid,
          organization_id: data.organizationId,
          report_card_month: data.reportCardMonth,
          overall_score: String(data.overallScore),
          size_bucket: data.sizeBucket,
          percentile_rank: String(data.percentileRank),
          insights: data.insights,
          measure_scores: data.measureScores,
        })
        .returning({ result_id: report_card_results.result_id });

      if (!inserted) {
        throw new Error('Failed to create report card - no result returned');
      }

      resultId = inserted.result_id;
    }

    return {
      result_id: resultId,
      practice_uid: data.practiceUid,
      organization_id: data.organizationId,
      report_card_month: data.reportCardMonth,
      generated_at: new Date().toISOString(),
      overall_score: data.overallScore,
      size_bucket: data.sizeBucket,
      percentile_rank: data.percentileRank,
      insights: data.insights,
      measure_scores: data.measureScores,
    };
  }

  /**
   * Get active measures configuration
   */
  async getActiveMeasures(): Promise<MeasureConfig[]> {
    const measures = await db
      .select()
      .from(report_card_measures)
      .where(eq(report_card_measures.is_active, true))
      .orderBy(desc(report_card_measures.weight));

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
  }

  /**
   * Get letter grade for a score
   */
  /**
   * Get letter grade from score
   * Floored at C - no D's or F's are assigned
   */
  getLetterGrade(score: number): string {
    if (score >= GRADE_THRESHOLDS.A) return 'A';
    if (score >= GRADE_THRESHOLDS.B) return 'B';
    // Floor at C - lowest grade is C
    return 'C';
  }
}

// Export singleton instance for CLI and cron use
export const reportCardGenerator = new ReportCardGeneratorService();

