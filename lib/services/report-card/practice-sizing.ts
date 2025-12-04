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
          bucketCounts: { small: 0, medium: 0, large: 0, xlarge: 0 },
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

      // Assign buckets using charge-based thresholds and track counts
      const bucketCounts = { small: 0, medium: 0, large: 0, xlarge: 0 };

      for (const practice of sortedCharges) {
        // Calculate percentile within the filtered active practices
        const percentile = this.calculatePercentile(
          practice.avgMonthlyCharges,
          sortedCharges.map((p) => p.avgMonthlyCharges)
        );

        // Determine bucket using charge-based thresholds (annualized)
        const annualizedCharges = practice.avgMonthlyCharges * 12;
        const bucket = this.determineBucketByCharges(annualizedCharges);

        await this.saveBucket(practice, bucket, percentile);
        bucketCounts[bucket]++;
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
   * Uses case-insensitive matching for measure name
   */
  private async getPracticeCharges(): Promise<PracticeChargesData[]> {
    // Calculate average of charges measure for each practice (case-insensitive)
    const result = await db
      .select({
        practice_uid: report_card_statistics.practice_uid,
        organization_id: report_card_statistics.organization_id,
        avg_value: sql<string>`AVG(CAST(${report_card_statistics.value} AS DECIMAL))`.as(
          'avg_value'
        ),
      })
      .from(report_card_statistics)
      .where(sql`LOWER(${report_card_statistics.measure_name}) = LOWER(${SIZING_MEASURE})`)
      .groupBy(report_card_statistics.practice_uid, report_card_statistics.organization_id);

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
   * Thresholds based on actual data distribution analysis:
   * - XLarge: > $100M annual charges (~18% of practices)
   * - Large: $40M - $100M (~33% of practices)
   * - Medium: $15M - $40M (~26% of practices)
   * - Small: < $15M (~23% of practices)
   */
  private determineBucketByCharges(annualizedCharges: number): SizeBucket {
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
   * Save bucket assignment to database
   */
  private async saveBucket(
    practice: PracticeChargesData,
    bucket: SizeBucket,
    percentile: number
  ): Promise<void> {
    // Check if bucket exists for this practice
    const existing = await db
      .select({ bucket_id: practice_size_buckets.bucket_id })
      .from(practice_size_buckets)
      .where(eq(practice_size_buckets.practice_uid, practice.practiceUid))
      .limit(1);

    const existingRecord = existing[0];
    if (existingRecord) {
      // Update existing bucket
      await db
        .update(practice_size_buckets)
        .set({
          size_bucket: bucket,
          monthly_charges_avg: String(practice.avgMonthlyCharges),
          percentile: String(percentile),
          organization_id: practice.organizationId,
          calculated_at: new Date(),
        })
        .where(eq(practice_size_buckets.bucket_id, existingRecord.bucket_id));
    } else {
      // Insert new bucket
      await db.insert(practice_size_buckets).values({
        practice_uid: practice.practiceUid,
        organization_id: practice.organizationId,
        size_bucket: bucket,
        monthly_charges_avg: String(practice.avgMonthlyCharges),
        percentile: String(percentile),
      });
    }
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
      xlarge: `Annual charges > $${(CHARGE_BASED_THRESHOLDS.large_max / 1_000_000).toFixed(0)}M`,
    };
  }
}

// Export singleton instance for CLI and cron use
export const practiceSizer = new PracticeSizingService();
