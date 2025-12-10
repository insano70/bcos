/**
 * Data Preloader
 *
 * Bulk data loading for report card generation.
 * Minimizes database queries by loading all required data upfront.
 */

import { eq, and, inArray, gte, lt } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { report_card_statistics, practice_size_buckets } from '@/lib/db/schema';
import type {
  SizeBucketMap,
  OrganizationMap,
  MonthStatisticsMap,
  PeerStatisticsMap,
  TrendDataMap,
  PreloadedData,
  IDataPreloader,
} from '../types';
import type { MeasureConfig } from '@/lib/types/report-card';

/**
 * Data preloader for bulk data loading.
 *
 * Implements the IDataPreloader interface for testability
 * and dependency injection. Accepts a database instance
 * for testing purposes.
 */
export class DataPreloader implements IDataPreloader {
  constructor(private database = defaultDb) {}

  /**
   * Preload size buckets for all practices in a single query
   */
  async preloadSizeBuckets(practices: number[]): Promise<SizeBucketMap> {
    const map: SizeBucketMap = new Map();

    if (practices.length === 0) return map;

    const results = await this.database
      .select({
        practice_uid: practice_size_buckets.practice_uid,
        size_bucket: practice_size_buckets.size_bucket,
        percentile: practice_size_buckets.percentile,
        organization_id: practice_size_buckets.organization_id,
      })
      .from(practice_size_buckets)
      .where(inArray(practice_size_buckets.practice_uid, practices));

    for (const r of results) {
      map.set(r.practice_uid, {
        size_bucket: r.size_bucket,
        percentile: parseFloat(r.percentile || '0'),
        organization_id: r.organization_id,
      });
    }

    return map;
  }

  /**
   * Preload month statistics for all practices/measures in a single query
   */
  async preloadMonthStatistics(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<MonthStatisticsMap> {
    const map: MonthStatisticsMap = new Map();

    if (practices.length === 0 || measures.length === 0) return map;

    // Use T00:00:00 suffix to parse in local time, not UTC
    const targetDate = new Date(`${targetMonth}T00:00:00`);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

    const measureNames = measures.map((m) => m.measure_name);

    const stats = await this.database
      .select({
        practice_uid: report_card_statistics.practice_uid,
        measure_name: report_card_statistics.measure_name,
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(
        and(
          inArray(report_card_statistics.practice_uid, practices),
          inArray(report_card_statistics.measure_name, measureNames),
          gte(report_card_statistics.period_date, monthStart),
          lt(report_card_statistics.period_date, monthEnd)
        )
      );

    for (const stat of stats) {
      const key = `${stat.practice_uid}:${stat.measure_name}`;
      map.set(key, parseFloat(stat.value));
    }

    return map;
  }

  /**
   * Preload peer statistics for all buckets/measures in a single query
   * Groups practices by size bucket and calculates peer averages
   */
  async preloadPeerStatistics(measures: MeasureConfig[], targetMonth: string): Promise<PeerStatisticsMap> {
    const map: PeerStatisticsMap = new Map();

    if (measures.length === 0) return map;

    // Use T00:00:00 suffix to parse in local time, not UTC
    const targetDate = new Date(`${targetMonth}T00:00:00`);
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

    const measureNames = measures.map((m) => m.measure_name);

    // Join statistics with size buckets to get bucket-grouped data
    const stats = await this.database
      .select({
        practice_uid: report_card_statistics.practice_uid,
        measure_name: report_card_statistics.measure_name,
        value: report_card_statistics.value,
        size_bucket: practice_size_buckets.size_bucket,
      })
      .from(report_card_statistics)
      .innerJoin(
        practice_size_buckets,
        eq(report_card_statistics.practice_uid, practice_size_buckets.practice_uid)
      )
      .where(
        and(
          inArray(report_card_statistics.measure_name, measureNames),
          gte(report_card_statistics.period_date, monthStart),
          lt(report_card_statistics.period_date, monthEnd)
        )
      );

    // Group by bucket:measure and calculate statistics
    const groupedData = new Map<string, { values: number[]; practiceValues: Map<number, number> }>();

    for (const stat of stats) {
      const key = `${stat.size_bucket}:${stat.measure_name}`;
      const value = parseFloat(stat.value);

      if (!groupedData.has(key)) {
        groupedData.set(key, { values: [], practiceValues: new Map() });
      }

      const group = groupedData.get(key);
      if (group) {
        group.values.push(value);
        group.practiceValues.set(stat.practice_uid, value);
      }
    }

    // Calculate averages and peer counts
    for (const [key, data] of Array.from(groupedData.entries())) {
      const average =
        data.values.length > 0
          ? data.values.reduce((sum: number, v: number) => sum + v, 0) / data.values.length
          : 0;

      map.set(key, {
        values: data.values,
        average,
        peerCount: data.values.length,
        practiceValues: data.practiceValues,
      });
    }

    return map;
  }

  /**
   * Preload trend data (prior 3 months) for all practices/measures in a single query
   */
  async preloadTrendData(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<TrendDataMap> {
    const map: TrendDataMap = new Map();

    if (practices.length === 0 || measures.length === 0) return map;

    // Use T00:00:00 suffix to parse in local time, not UTC
    const targetDate = new Date(`${targetMonth}T00:00:00`);
    // Get 4 months of data: target month + 3 prior months
    const trendStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 3, 1);
    const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);

    const measureNames = measures.map((m) => m.measure_name);

    const stats = await this.database
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
          inArray(report_card_statistics.measure_name, measureNames),
          gte(report_card_statistics.period_date, trendStart),
          lt(report_card_statistics.period_date, monthEnd)
        )
      );

    for (const stat of stats) {
      const key = `${stat.practice_uid}:${stat.measure_name}`;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)?.push({
        date: stat.period_date,
        value: parseFloat(stat.value),
      });
    }

    return map;
  }

  /**
   * Preload all data for a generation run (convenience method)
   */
  async preloadAllForMonth(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string,
    sizeBuckets: SizeBucketMap,
    organizations: OrganizationMap
  ): Promise<PreloadedData> {
    const [monthStatistics, peerStatistics, trendData] = await Promise.all([
      this.preloadMonthStatistics(practices, measures, targetMonth),
      this.preloadPeerStatistics(measures, targetMonth),
      this.preloadTrendData(practices, measures, targetMonth),
    ]);

    return {
      sizeBuckets,
      organizations,
      monthStatistics,
      peerStatistics,
      trendData,
      measures,
    };
  }
}

/** Singleton instance */
export const dataPreloader = new DataPreloader();
