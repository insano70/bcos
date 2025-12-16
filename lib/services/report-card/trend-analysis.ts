/**
 * Trend Analysis Service
 *
 * Calculates 3-month, 6-month, and year-over-year trends for each practice/measure combination.
 *
 * TREND CALCULATION LOGIC:
 * - Report Card Month is the last full month (e.g., November if today is December)
 * - 3 Month Trend: Nov vs Avg(Aug, Sep, Oct) - average of prior 3 months
 * - 6 Month Trend: Nov vs Avg(May, Jun, Jul, Aug, Sep, Oct) - average of prior 6 months
 * - Year-over-Year Trend: Nov 2025 vs Nov 2024 - same month, previous year (direct comparison)
 *
 * Trends are stored in the report_card_trends table.
 */

import { eq, and, gte, lt, desc, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_statistics, report_card_trends, report_card_measures } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { TrendAnalysisError } from '@/lib/errors/report-card-errors';
import {
  TREND_PERIODS,
  type TrendPeriod,
  type TrendDirection,
} from '@/lib/constants/report-card';
import { calculateTrend } from '@/lib/utils/trend-calculation';
import { getReportCardMonthDate } from '@/lib/utils/format-value';
import { getPracticeOrganizationMappings } from '@/lib/utils/organization-mapping';
import type { TrendAnalysisResult } from '@/lib/types/report-card';
import type { TrendAnalysisOptions, TrendCalculation } from './types';

/** Measure configuration for trend calculation */
interface MeasureConfig {
  measure_name: string;
  higher_is_better: boolean;
}

/**
 * Trend Analysis Service
 *
 * Calculates trends by comparing recent values to historical averages.
 * Does not require RBAC context as it's designed for CLI/cron use.
 */
export class TrendAnalysisService {
  /**
   * Analyze trends for all practices or a specific practice
   * Uses bulk queries for efficiency
   */
  async analyzeAll(options: TrendAnalysisOptions = {}): Promise<TrendAnalysisResult> {
    const startTime = Date.now();
    const practiceSet = new Set<number>();
    const allTrends: TrendCalculation[] = [];

    try {
      // Get distinct practices to analyze
      let practices: number[];

      if (options.practiceUid) {
        practices = [options.practiceUid];
      } else {
        const result = await db
          .selectDistinct({ practice_uid: report_card_statistics.practice_uid })
          .from(report_card_statistics);
        practices = result.map((r) => r.practice_uid);
      }

      log.info('Starting trend analysis', {
        operation: 'analyze_trends',
        practiceCount: practices.length,
        practiceUid: options.practiceUid || 'all',
        component: 'report-card',
      });

      // Get organization mappings (shared utility, 1 query)
      const orgMappings = await getPracticeOrganizationMappings(practices);

      // Get measure configs (for higher_is_better)
      const measureConfigs = await this.getMeasureConfigs();

      // Get all statistics needed for trend calculation in bulk
      const allStats = await this.getStatisticsForTrends(practices);

      // Calculate trends for all practices/measures/periods
      for (const practiceUid of practices) {
        const practiceStats = allStats.get(practiceUid);
        if (!practiceStats) continue;

        const practiceTrends = this.calculateTrendsForPractice(practiceUid, practiceStats, measureConfigs);
        
        if (practiceTrends.length > 0) {
          allTrends.push(...practiceTrends);
          practiceSet.add(practiceUid);
        }
      }

      // Save all trends in bulk
      const trendsCalculated = await this.saveTrendsBulk(allTrends, orgMappings);

      const duration = Date.now() - startTime;

      log.info('Trend analysis completed', {
        operation: 'analyze_trends',
        practicesProcessed: practiceSet.size,
        trendsCalculated,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        practicesProcessed: practiceSet.size,
        trendsCalculated,
        duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Trend analysis failed', error as Error, {
        operation: 'analyze_trends',
        practiceUid: options.practiceUid,
        component: 'report-card',
      });

      throw new TrendAnalysisError(errorMessage, options.practiceUid);
    }
  }

  /**
   * Get measure configurations including higher_is_better flag
   */
  private async getMeasureConfigs(): Promise<Map<string, MeasureConfig>> {
    const configs = new Map<string, MeasureConfig>();

    const results = await db
      .select({
        measure_name: report_card_measures.measure_name,
        higher_is_better: report_card_measures.higher_is_better,
      })
      .from(report_card_measures)
      .where(eq(report_card_measures.is_active, true));

    for (const r of results) {
      configs.set(r.measure_name, {
        measure_name: r.measure_name,
        higher_is_better: r.higher_is_better ?? true, // Default to true if null
      });
    }

    return configs;
  }

  /**
   * Get all statistics needed for trend calculation in bulk
   * Fetches data from Report Card Month back through the longest trend period
   * For year-over-year, we need 12 months back + current month = 13 months of data
   */
  private async getStatisticsForTrends(
    practices: number[]
  ): Promise<Map<number, Map<string, Array<{ date: Date; value: number }>>>> {
    const result = new Map<number, Map<string, Array<{ date: Date; value: number }>>>();

    if (practices.length === 0) return result;

    const reportCardMonth = getReportCardMonthDate();

    // Get cutoff date for year-over-year (12 months before report card month)
    // Plus the report card month itself = 13 months of data
    const cutoffDate = new Date(reportCardMonth);
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);

    // End of report card month (start of current month)
    const endDate = new Date(reportCardMonth.getFullYear(), reportCardMonth.getMonth() + 1, 1);

    const stats = await db
      .select({
        practice_uid: report_card_statistics.practice_uid,
        measure_name: report_card_statistics.measure_name,
        period_date: report_card_statistics.period_date,
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practices),
          gte(report_card_statistics.period_date, cutoffDate),
          lt(report_card_statistics.period_date, endDate)
        )
      )
      .orderBy(
        report_card_statistics.practice_uid,
        report_card_statistics.measure_name,
        desc(report_card_statistics.period_date)
      );

    // Group by practice and measure
    for (const stat of stats) {
      if (!result.has(stat.practice_uid)) {
        result.set(stat.practice_uid, new Map());
      }
      const practiceMap = result.get(stat.practice_uid);
      if (!practiceMap) continue;
      
      if (!practiceMap.has(stat.measure_name)) {
        practiceMap.set(stat.measure_name, []);
      }
      practiceMap.get(stat.measure_name)?.push({
        date: stat.period_date,
        value: parseFloat(stat.value),
      });
    }

    return result;
  }

  /**
   * Calculate trends for a single practice using pre-fetched data
   */
  private calculateTrendsForPractice(
    practiceUid: number,
    measureStats: Map<string, Array<{ date: Date; value: number }>>,
    measureConfigs: Map<string, MeasureConfig>
  ): TrendCalculation[] {
    const trends: TrendCalculation[] = [];

    const entries = Array.from(measureStats.entries());
    for (const [measureName, stats] of entries) {
      // Get higher_is_better from config, default to true if not found
      const config = measureConfigs.get(measureName);
      const higherIsBetter = config?.higher_is_better ?? true;

      for (const trendPeriod of TREND_PERIODS) {
        const trend = this.calculateTrendFromStats(practiceUid, measureName, trendPeriod, stats, higherIsBetter);
        if (trend) {
          trends.push(trend);
        }
      }
    }

    return trends;
  }

  /**
   * Calculate trend from pre-fetched statistics
   *
   * For 3-month and 6-month: Compares Report Card Month value against average of prior X months.
   * For year_over_year: Compares Report Card Month value against same month last year (direct).
   *
   * @param practiceUid - The practice to calculate trend for
   * @param measureName - The measure being analyzed
   * @param trendPeriod - Period to analyze ('3_month', '6_month', 'year_over_year')
   * @param stats - Pre-fetched statistics for the practice/measure
   * @returns TrendCalculation with direction and percentage, or null if insufficient data
   *
   * @example
   * // If today is December 2025, Report Card Month is November 2025
   * // For 3_month trend: Nov value vs Avg(Aug, Sep, Oct)
   * // For year_over_year: Nov 2025 value vs Nov 2024 value
   * // If Nov 2025 = $100K and Nov 2024 = $80K:
   * // percentageChange = (100-80)/80 * 100 = +25%
   * // direction = 'improving' (since ≥5%)
   *
   * @remarks
   * - Returns null if Report Card Month has no data
   * - For average comparisons: Returns null if fewer than 1 prior month has data
   * - For YoY: Returns null if same month last year has no data
   * - Returns null if prior value/average is 0 (avoid division by zero)
   * - Percentage change is capped at ±99999.99 for database storage
   */
  private calculateTrendFromStats(
    practiceUid: number,
    measureName: string,
    trendPeriod: TrendPeriod,
    stats: Array<{ date: Date; value: number }>,
    higherIsBetter: boolean
  ): TrendCalculation | null {
    const reportCardMonth = getReportCardMonthDate();

    // Find the Report Card Month value (first day of last month)
    const reportCardMonthStart = reportCardMonth.getTime();
    const reportCardMonthEnd = new Date(
      reportCardMonth.getFullYear(),
      reportCardMonth.getMonth() + 1,
      1
    ).getTime();

    const reportCardValue = stats.find((s) => {
      const statTime = s.date.getTime();
      return statTime >= reportCardMonthStart && statTime < reportCardMonthEnd;
    })?.value;

    if (reportCardValue === undefined) {
      return null;
    }

    // Year-over-year: Compare to same month last year (direct comparison)
    if (trendPeriod === 'year_over_year') {
      const lastYearMonth = new Date(reportCardMonth);
      lastYearMonth.setFullYear(lastYearMonth.getFullYear() - 1);

      // Find same month in previous year
      const lastYearValue = stats.find((s) => {
        return (
          s.date.getMonth() === lastYearMonth.getMonth() &&
          s.date.getFullYear() === lastYearMonth.getFullYear()
        );
      })?.value;

      if (lastYearValue === undefined) {
        return null;
      }

      // Direct comparison (single value, not average)
      const trendResult = calculateTrend({
        currentValue: reportCardValue,
        priorValues: [lastYearValue],
        higherIsBetter,
      });

      // Return null if prior value was 0
      if (lastYearValue === 0) {
        return null;
      }

      return {
        practiceUid,
        measureName,
        trendPeriod,
        direction: trendResult.direction,
        percentageChange: trendResult.percentage,
      };
    }

    // Standard comparison: Current month vs average of prior X months
    const monthsBack = this.getMonthsForPeriod(trendPeriod);

    // Calculate the prior months range (months before report card month)
    const priorEndDate = new Date(reportCardMonth); // End is start of report card month
    const priorStartDate = new Date(reportCardMonth);
    priorStartDate.setMonth(priorStartDate.getMonth() - monthsBack);

    const priorStartTime = priorStartDate.getTime();
    const priorEndTime = priorEndDate.getTime();

    // Get values from prior months
    const priorMonthValues = stats
      .filter((s) => {
        const statTime = s.date.getTime();
        return statTime >= priorStartTime && statTime < priorEndTime;
      })
      .map((s) => s.value);

    // Need at least some prior data to compare
    if (priorMonthValues.length < 1) {
      return null;
    }

    // Use shared trend calculation utility
    const trendResult = calculateTrend({
      currentValue: reportCardValue,
      priorValues: priorMonthValues,
      higherIsBetter,
    });

    // Return null if no valid calculation (priorAvg was 0)
    if (trendResult.percentage === 0 && trendResult.direction === 'stable' && priorMonthValues.length > 0) {
      const priorAvg = priorMonthValues.reduce((sum, v) => sum + v, 0) / priorMonthValues.length;
      if (priorAvg === 0) {
        return null;
      }
    }

    return {
      practiceUid,
      measureName,
      trendPeriod,
      direction: trendResult.direction,
      percentageChange: trendResult.percentage,
    };
  }

  /**
   * Save multiple trend calculations to database using bulk upsert
   */
  private async saveTrendsBulk(
    trends: TrendCalculation[],
    orgMappings: Map<number, string | null>
  ): Promise<number> {
    if (trends.length === 0) return 0;

    const records = trends.map((trend) => ({
      practice_uid: trend.practiceUid,
      organization_id: orgMappings.get(trend.practiceUid) || null,
      measure_name: trend.measureName,
      trend_period: trend.trendPeriod,
      trend_direction: trend.direction,
      trend_percentage: String(trend.percentageChange),
    }));

    // Use bulk upsert - update if exists, insert if not
    await db
      .insert(report_card_trends)
      .values(records)
      .onConflictDoUpdate({
        target: [
          report_card_trends.practice_uid,
          report_card_trends.measure_name,
          report_card_trends.trend_period,
        ],
        set: {
          trend_direction: sql`EXCLUDED.trend_direction`,
          trend_percentage: sql`EXCLUDED.trend_percentage`,
          organization_id: sql`EXCLUDED.organization_id`,
          calculated_at: new Date(),
        },
      });

    return records.length;
  }

  /**
   * Get the number of months for a trend period
   * For year_over_year, returns 12 to signal it's a YoY calculation
   */
  private getMonthsForPeriod(period: TrendPeriod): number {
    switch (period) {
      case '3_month':
        return 3;
      case '6_month':
        return 6;
      case 'year_over_year':
        return 12;
      default:
        return 3;
    }
  }

  /**
   * Get trends for a specific practice
   */
  async getTrendsForPractice(
    practiceUid: number,
    trendPeriod?: TrendPeriod
  ): Promise<TrendCalculation[]> {
    const conditions = [eq(report_card_trends.practice_uid, practiceUid)];

    if (trendPeriod) {
      conditions.push(eq(report_card_trends.trend_period, trendPeriod));
    }

    const trends = await db
      .select({
        practice_uid: report_card_trends.practice_uid,
        measure_name: report_card_trends.measure_name,
        trend_period: report_card_trends.trend_period,
        trend_direction: report_card_trends.trend_direction,
        trend_percentage: report_card_trends.trend_percentage,
      })
      .from(report_card_trends)
      .where(and(...conditions));

    return trends.map((t) => ({
      practiceUid: t.practice_uid,
      measureName: t.measure_name,
      trendPeriod: t.trend_period as TrendPeriod,
      direction: t.trend_direction as TrendDirection,
      percentageChange: parseFloat(t.trend_percentage || '0'),
    }));
  }
}

// Export singleton instance for CLI and cron use
export const trendAnalyzer = new TrendAnalysisService();
