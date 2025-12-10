/**
 * Peer Statistics Calculator
 *
 * Calculates peer comparison statistics for report card measures.
 * Provides averages and percentile breakdowns for benchmarking.
 */

import { and, desc, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { report_card_statistics } from '@/lib/db/schema';

/**
 * Peer statistics calculator for measure comparisons.
 *
 * Provides bulk statistics calculation optimized for
 * peer comparison displays in report cards.
 */
export class PeerStatisticsCalculator {
  constructor(private database = defaultDb) {}

  /**
   * Calculate statistics for ALL measures in a single bulk query
   * Returns averages and percentile breakdowns for each measure
   *
   * OPTIMIZATION: Replaced N queries (1 per measure) with 1 bulk query
   *
   * @param practiceUids - Practice UIDs to include in calculation
   * @param measureNames - Measure names to calculate stats for
   * @returns Object with averages and percentiles keyed by measure name
   */
  async calculateAllMeasureStats(
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
    const stats = await this.database
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
      averages[measureName] =
        Math.round((sortedValues.reduce((sum, v) => sum + v, 0) / sortedValues.length) * 100) / 100;

      // Calculate percentiles
      percentiles[measureName] = {
        p25: this.getPercentile(sortedValues, 25),
        p50: this.getPercentile(sortedValues, 50),
        p75: this.getPercentile(sortedValues, 75),
      };
    }

    return { averages, percentiles };
  }

  /**
   * Calculate percentile at a given percentage
   *
   * @param sortedValues - Pre-sorted array of values
   * @param percentile - Percentile to calculate (0-100)
   * @returns Value at the specified percentile
   */
  getPercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
    return sortedValues[clampedIndex] ?? 0;
  }
}

/** Singleton instance */
export const peerStatisticsCalculator = new PeerStatisticsCalculator();
