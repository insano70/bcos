/**
 * Practice Sizing Service
 *
 * Assigns practices to size buckets (small, medium, large, xlarge)
 * based on their average monthly charges using data-driven thresholds.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_statistics, practice_size_buckets } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import {
  CHARGE_BASED_THRESHOLDS,
  SIZING_MEASURE,
  type SizeBucket,
} from '@/lib/constants/report-card';
import type { SizingResult, PracticeSizeBucket } from '@/lib/types/report-card';
import type { SizingOptions, PracticeChargesData } from './types';

/**
 * Practice Sizing Service
 *
 * Calculates size buckets for practices based on monthly charges.
 * Uses data-driven thresholds rather than linear percentiles.
 * Does not require RBAC context as it's designed for CLI/cron use.
 */
export class PracticeSizingService {
  /**
   * Assign size buckets to all practices using charge-based thresholds
   */
  async assignBuckets(_options: SizingOptions = {}): Promise<SizingResult> {
    const startTime = Date.now();

    try {
      log.info('Starting practice sizing with charge-based thresholds', {
        operation: 'assign_buckets',
        thresholds: CHARGE_BASED_THRESHOLDS,
        component: 'report-card',
      });

      // Get average monthly charges for each practice
      const practiceCharges = await this.getPracticeCharges();

      // Filter out practices with minimal charges (inactive or test practices)
      const activePractices = practiceCharges.filter(
        (p) => p.avgMonthlyCharges * 12 >= CHARGE_BASED_THRESHOLDS.minimum_charges
      );

      if (activePractices.length === 0) {
        log.info('No active practices found for sizing', {
          operation: 'assign_buckets',
          totalPractices: practiceCharges.length,
          filteredOut: practiceCharges.length,
          component: 'report-card',
        });

        return {
          practicesProcessed: 0,
          bucketCounts: { small: 0, medium: 0, large: 0, xlarge: 0, xxlarge: 0 },
          duration: Date.now() - startTime,
        };
      }

      log.info('Filtered practices for sizing', {
        operation: 'assign_buckets',
        totalPractices: practiceCharges.length,
        activePractices: activePractices.length,
        filteredOut: practiceCharges.length - activePractices.length,
        component: 'report-card',
      });

      // Sort by charges to calculate percentiles
      const sortedCharges = [...activePractices].sort(
        (a, b) => a.avgMonthlyCharges - b.avgMonthlyCharges
      );

      // Pre-calculate all charge values for percentile calculation
      const allChargeValues = sortedCharges.map((p) => p.avgMonthlyCharges);

      // Build bucket records for bulk upsert
      const bucketCounts = { small: 0, medium: 0, large: 0, xlarge: 0, xxlarge: 0 };
      const bucketRecords: Array<{
        practice_uid: number;
        organization_id: string | null;
        size_bucket: SizeBucket;
        monthly_charges_avg: string;
        percentile: string;
      }> = [];

      for (const practice of sortedCharges) {
        // Calculate percentile within the filtered active practices
        const percentile = this.calculatePercentile(practice.avgMonthlyCharges, allChargeValues);

        // Determine bucket using charge-based thresholds (annualized)
        const annualizedCharges = practice.avgMonthlyCharges * 12;
        const bucket = this.determineBucketByCharges(annualizedCharges);

        bucketRecords.push({
          practice_uid: practice.practiceUid,
          organization_id: practice.organizationId,
          size_bucket: bucket,
          monthly_charges_avg: String(practice.avgMonthlyCharges),
          percentile: String(percentile),
        });
        bucketCounts[bucket]++;
      }

      // Bulk upsert all bucket assignments in a single query
      if (bucketRecords.length > 0) {
        await db
          .insert(practice_size_buckets)
          .values(bucketRecords)
          .onConflictDoUpdate({
            target: [practice_size_buckets.practice_uid],
            set: {
              size_bucket: sql`EXCLUDED.size_bucket`,
              monthly_charges_avg: sql`EXCLUDED.monthly_charges_avg`,
              percentile: sql`EXCLUDED.percentile`,
              organization_id: sql`EXCLUDED.organization_id`,
              calculated_at: new Date(),
            },
          });
      }

      const duration = Date.now() - startTime;

      log.info('Practice sizing completed with charge-based thresholds', {
        operation: 'assign_buckets',
        practicesProcessed: activePractices.length,
        bucketCounts,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        practicesProcessed: activePractices.length,
        bucketCounts,
        duration,
      };
    } catch (error) {
      log.error('Practice sizing failed', error as Error, {
        operation: 'assign_buckets',
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Get average monthly charges for each practice
   * Uses only the LAST 12 MONTHS of data for accurate current sizing.
   * Uses case-insensitive matching for measure name.
   * 
   * IMPORTANT: Using all historical data caused inaccurate sizing because:
   * - Growing practices appeared smaller (old low-volume months diluted average)
   * - Shrinking practices appeared larger (old high-volume months inflated average)
   */
  private async getPracticeCharges(): Promise<PracticeChargesData[]> {
    // Calculate cutoff date for last 12 months
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    cutoffDate.setDate(1); // First day of month
    
    // Calculate average of charges measure for each practice (case-insensitive)
    // Only include data from the last 12 months for accurate current sizing
    const result = await db
      .select({
        practice_uid: report_card_statistics.practice_uid,
        organization_id: report_card_statistics.organization_id,
        avg_value: sql<string>`AVG(CAST(${report_card_statistics.value} AS DECIMAL))`.as(
          'avg_value'
        ),
        month_count: sql<number>`COUNT(*)`.as('month_count'),
      })
      .from(report_card_statistics)
      .where(
        sql`LOWER(${report_card_statistics.measure_name}) = LOWER(${SIZING_MEASURE})
            AND ${report_card_statistics.period_date} >= ${cutoffDate.toISOString()}`
      )
      .groupBy(report_card_statistics.practice_uid, report_card_statistics.organization_id);

    log.info('Calculated practice charges using last 12 months', {
      operation: 'get_practice_charges',
      practiceCount: result.length,
      cutoffDate: cutoffDate.toISOString().split('T')[0],
      component: 'report-card',
    });

    return result.map((r) => ({
      practiceUid: r.practice_uid,
      organizationId: r.organization_id,
      avgMonthlyCharges: parseFloat(r.avg_value) || 0,
    }));
  }

  /**
   * Calculate the percentile rank for a value
   */
  private calculatePercentile(value: number, allValues: number[]): number {
    if (allValues.length === 0) return 0;

    const countBelow = allValues.filter((v) => v < value).length;
    return (countBelow / allValues.length) * 100;
  }

  /**
   * Determine size bucket based on annualized charge thresholds
   *
   * Thresholds based on last 12 months data distribution:
   * - XXLarge: > $90M annual charges (~10% of practices) - industry giants
   * - XLarge: $46M - $90M (~14% of practices) - large practices
   * - Large: $25M - $46M (~20% of practices)
   * - Medium: $10M - $25M (~22% of practices)
   * - Small: < $10M (~23% of practices)
   */
  private determineBucketByCharges(annualizedCharges: number): SizeBucket {
    if (annualizedCharges >= CHARGE_BASED_THRESHOLDS.xlarge_max) {
      return 'xxlarge';
    }
    if (annualizedCharges >= CHARGE_BASED_THRESHOLDS.large_max) {
      return 'xlarge';
    }
    if (annualizedCharges >= CHARGE_BASED_THRESHOLDS.medium_max) {
      return 'large';
    }
    if (annualizedCharges >= CHARGE_BASED_THRESHOLDS.small_max) {
      return 'medium';
    }
    return 'small';
  }

  /**
   * Get size bucket for a specific practice
   */
  async getBucketForPractice(practiceUid: number): Promise<PracticeSizeBucket | null> {
    const [result] = await db
      .select()
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.practice_uid, practiceUid))
      .limit(1);

    if (!result) return null;

    return {
      bucket_id: result.bucket_id,
      practice_uid: result.practice_uid,
      organization_id: result.organization_id,
      size_bucket: result.size_bucket as SizeBucket,
      monthly_charges_avg: parseFloat(result.monthly_charges_avg || '0'),
      percentile: parseFloat(result.percentile || '0'),
      calculated_at: result.calculated_at?.toISOString() || new Date().toISOString(),
    };
  }

  /**
   * Get all practices in a specific size bucket
   */
  async getPracticesInBucket(bucket: SizeBucket): Promise<number[]> {
    const result = await db
      .select({ practice_uid: practice_size_buckets.practice_uid })
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.size_bucket, bucket));

    return result.map((r) => r.practice_uid);
  }

  /**
   * Get bucket distribution counts
   */
  async getBucketDistribution(): Promise<Record<SizeBucket, number>> {
    const result = await db
      .select({
        size_bucket: practice_size_buckets.size_bucket,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(practice_size_buckets)
      .groupBy(practice_size_buckets.size_bucket);

    const distribution: Record<SizeBucket, number> = {
      small: 0,
      medium: 0,
      large: 0,
      xlarge: 0,
      xxlarge: 0,
    };

    for (const row of result) {
      if (row.size_bucket in distribution) {
        distribution[row.size_bucket as SizeBucket] = Number(row.count);
      }
    }

    return distribution;
  }

  /**
   * Get threshold descriptions for display
   */
  getThresholdDescriptions(): Record<SizeBucket, string> {
    return {
      small: `Annual charges < $${(CHARGE_BASED_THRESHOLDS.small_max / 1_000_000).toFixed(0)}M`,
      medium: `Annual charges $${(CHARGE_BASED_THRESHOLDS.small_max / 1_000_000).toFixed(0)}M - $${(CHARGE_BASED_THRESHOLDS.medium_max / 1_000_000).toFixed(0)}M`,
      large: `Annual charges $${(CHARGE_BASED_THRESHOLDS.medium_max / 1_000_000).toFixed(0)}M - $${(CHARGE_BASED_THRESHOLDS.large_max / 1_000_000).toFixed(0)}M`,
      xlarge: `Annual charges $${(CHARGE_BASED_THRESHOLDS.large_max / 1_000_000).toFixed(0)}M - $${(CHARGE_BASED_THRESHOLDS.xlarge_max / 1_000_000).toFixed(0)}M`,
      xxlarge: `Annual charges > $${(CHARGE_BASED_THRESHOLDS.xlarge_max / 1_000_000).toFixed(0)}M`,
    };
  }
}

// Export singleton instance for CLI and cron use
export const practiceSizer = new PracticeSizingService();
