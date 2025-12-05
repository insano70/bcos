/**
 * Trend Analysis Service
 *
 * Calculates 3, 6, and 9 month trends for each practice/measure combination.
 * 
 * TREND CALCULATION LOGIC:
 * - Report Card Month is the last full month (e.g., November if today is December)
 * - Trend = Report Card Month value vs Average of prior X months
 * - 3 Month Trend: Nov vs Avg(Aug, Sep, Oct)
 * - 6 Month Trend: Nov vs Avg(May, Jun, Jul, Aug, Sep, Oct)
 * - 9 Month Trend: Nov vs Avg(Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct)
 * 
 * Trends are stored in the report_card_trends table.
 */

import { eq, and, gte, lt, desc, sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_statistics, report_card_trends } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { TrendAnalysisError } from '@/lib/errors/report-card-errors';
import {
  TREND_PERIODS,
  TREND_THRESHOLDS,
  type TrendPeriod,
  type TrendDirection,
} from '@/lib/constants/report-card';
import type { TrendAnalysisResult } from '@/lib/types/report-card';
import type { TrendAnalysisOptions, TrendCalculation } from './types';

/**
 * Get the Report Card Month (last full month)
 */
function getReportCardMonth(): Date {
  const now = new Date();
  // First day of last month
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
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

      // Get organization mappings in one query
      const orgMappings = await this.getOrganizationMappings(practices);

      // Get all statistics needed for trend calculation in bulk
      const allStats = await this.getStatisticsForTrends(practices);

      // Calculate trends for all practices/measures/periods
      for (const practiceUid of practices) {
        const practiceStats = allStats.get(practiceUid);
        if (!practiceStats) continue;

        const practiceTrends = this.calculateTrendsForPractice(practiceUid, practiceStats);
        
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
   * Get organization mappings for practices in bulk
   */
  private async getOrganizationMappings(practices: number[]): Promise<Map<number, string | null>> {
    const mappings = new Map<number, string | null>();
    
    if (practices.length === 0) return mappings;

    const results = await db
      .selectDistinct({
        practice_uid: report_card_statistics.practice_uid,
        organization_id: report_card_statistics.organization_id,
      })
      .from(report_card_statistics)
      .where(inArray(report_card_statistics.practice_uid, practices));

    for (const r of results) {
      mappings.set(r.practice_uid, r.organization_id);
    }

    return mappings;
  }

  /**
   * Get all statistics needed for trend calculation in bulk
   * Fetches data from Report Card Month back through the longest trend period
   */
  private async getStatisticsForTrends(
    practices: number[]
  ): Promise<Map<number, Map<string, Array<{ date: Date; value: number }>>>> {
    const result = new Map<number, Map<string, Array<{ date: Date; value: number }>>>();
    
    if (practices.length === 0) return result;

    const reportCardMonth = getReportCardMonth();
    
    // Get cutoff date for longest period (9 months before report card month)
    // Plus the report card month itself = 10 months of data
    const cutoffDate = new Date(reportCardMonth);
    cutoffDate.setMonth(cutoffDate.getMonth() - 9);

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
    measureStats: Map<string, Array<{ date: Date; value: number }>>
  ): TrendCalculation[] {
    const trends: TrendCalculation[] = [];

    const entries = Array.from(measureStats.entries());
    for (const [measureName, stats] of entries) {
      for (const trendPeriod of TREND_PERIODS) {
        const trend = this.calculateTrendFromStats(practiceUid, measureName, trendPeriod, stats);
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
   * Compares the Report Card Month value against the average of the prior X months.
   * 
   * @param practiceUid - The practice to calculate trend for
   * @param measureName - The measure being analyzed
   * @param trendPeriod - Period to analyze ('3_month', '6_month', '9_month')
   * @param stats - Pre-fetched statistics for the practice/measure
   * @returns TrendCalculation with direction and percentage, or null if insufficient data
   * 
   * @example
   * // If today is December 2025, Report Card Month is November 2025
   * // For 3_month trend: Nov value vs Avg(Aug, Sep, Oct)
   * // If Nov = $100K and Avg(Aug-Oct) = $80K:
   * // percentageChange = (100-80)/80 * 100 = +25%
   * // direction = 'improving' (since ≥5%)
   * 
   * @remarks
   * - Returns null if Report Card Month has no data
   * - Returns null if fewer than 1 prior month has data
   * - Returns null if prior average is 0 (avoid division by zero)
   * - Percentage change is capped at ±99999.99 for database storage
   */
  private calculateTrendFromStats(
    practiceUid: number,
    measureName: string,
    trendPeriod: TrendPeriod,
    stats: Array<{ date: Date; value: number }>
  ): TrendCalculation | null {
    const monthsBack = this.getMonthsForPeriod(trendPeriod);
    const reportCardMonth = getReportCardMonth();
    
    // Find the Report Card Month value (first day of last month)
    const reportCardMonthStart = reportCardMonth.getTime();
    const reportCardMonthEnd = new Date(reportCardMonth.getFullYear(), reportCardMonth.getMonth() + 1, 1).getTime();
    
    const reportCardValue = stats.find((s) => {
      const statTime = s.date.getTime();
      return statTime >= reportCardMonthStart && statTime < reportCardMonthEnd;
    })?.value;

    if (reportCardValue === undefined) {
      return null;
    }

    // Calculate the prior months range (months before report card month)
    const priorEndDate = new Date(reportCardMonth); // End is start of report card month
    const priorStartDate = new Date(reportCardMonth);
    priorStartDate.setMonth(priorStartDate.getMonth() - monthsBack);

    const priorStartTime = priorStartDate.getTime();
    const priorEndTime = priorEndDate.getTime();

    // Get values from prior months
    const priorMonthValues = stats.filter((s) => {
      const statTime = s.date.getTime();
      return statTime >= priorStartTime && statTime < priorEndTime;
    });

    // Need at least some prior data to compare
    if (priorMonthValues.length < 1) {
      return null;
    }

    // Calculate average of prior months
    const priorAverage = priorMonthValues.reduce((sum, s) => sum + s.value, 0) / priorMonthValues.length;

    if (priorAverage === 0) {
      return null;
    }

    // Calculate percentage change: (ReportCardMonth - PriorAvg) / PriorAvg * 100
    const rawPercentageChange = ((reportCardValue - priorAverage) / Math.abs(priorAverage)) * 100;
    
    // Cap percentage change to fit database constraints
    const MAX_PERCENTAGE = 99999.99;
    const MIN_PERCENTAGE = -99999.99;
    const percentageChange = Math.max(MIN_PERCENTAGE, Math.min(MAX_PERCENTAGE, rawPercentageChange));
    
    const direction = this.determineTrendDirection(percentageChange);

    return {
      practiceUid,
      measureName,
      trendPeriod,
      direction,
      percentageChange,
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
   */
  private getMonthsForPeriod(period: TrendPeriod): number {
    switch (period) {
      case '3_month':
        return 3;
      case '6_month':
        return 6;
      case '9_month':
        return 9;
      default:
        return 3;
    }
  }

  /**
   * Determine trend direction based on percentage change
   */
  private determineTrendDirection(percentageChange: number): TrendDirection {
    if (percentageChange >= TREND_THRESHOLDS.IMPROVING_MIN_PERCENT) {
      return 'improving';
    } else if (percentageChange <= TREND_THRESHOLDS.DECLINING_MIN_PERCENT) {
      return 'declining';
    }
    return 'stable';
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
