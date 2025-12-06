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
  BUCKET_SIZING,
  SIZING_MEASURE,
  type SizeBucket,
} from '@/lib/constants/report-card';
import type { SizingResult, PracticeSizeBucket } from '@/lib/types/report-card';
import type { SizingOptions, PracticeChargesData } from './types';

/**
 * Adaptive thresholds that may be adjusted from defaults
 * to ensure minimum bucket sizes
 */
interface AdaptiveThresholds {
  small_max: number;
  medium_max: number;
  large_max: number;
  xlarge_max: number;
  minimum_charges: number;
}

/**
 * Practice Sizing Service
 *
 * Calculates size buckets for practices based on monthly charges.
 * Uses data-driven thresholds with adaptive adjustment to ensure
 * each bucket has at least MIN_BUCKET_SIZE practices for meaningful
 * peer comparison.
 * Does not require RBAC context as it's designed for CLI/cron use.
 */
export class PracticeSizingService {
  /**
   * Store the effective thresholds used in the last sizing run
   * for use in threshold descriptions
   */
  private effectiveThresholds: AdaptiveThresholds = { ...CHARGE_BASED_THRESHOLDS };
  /**
   * Assign size buckets to all practices using adaptive charge-based thresholds.
   * Thresholds are automatically adjusted to ensure each bucket has at least
   * MIN_BUCKET_SIZE practices for meaningful peer comparison.
   */
  async assignBuckets(_options: SizingOptions = {}): Promise<SizingResult> {
    const startTime = Date.now();

    try {
      log.info('Starting practice sizing with adaptive thresholds', {
        operation: 'assign_buckets',
        defaultThresholds: CHARGE_BASED_THRESHOLDS,
        minBucketSize: BUCKET_SIZING.MIN_BUCKET_SIZE,
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

      // Sort by charges (descending for threshold calculation - highest first)
      const sortedByChargesDesc = [...activePractices].sort(
        (a, b) => b.avgMonthlyCharges - a.avgMonthlyCharges
      );

      // Calculate adaptive thresholds to ensure minimum bucket sizes
      const adaptiveThresholds = this.calculateAdaptiveThresholds(sortedByChargesDesc);
      this.effectiveThresholds = adaptiveThresholds;

      // Sort by charges ascending for percentile calculation
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

        // Determine bucket using adaptive thresholds (annualized)
        const annualizedCharges = practice.avgMonthlyCharges * 12;
        const bucket = this.determineBucketByCharges(annualizedCharges, adaptiveThresholds);

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

      log.info('Practice sizing completed with adaptive thresholds', {
        operation: 'assign_buckets',
        practicesProcessed: activePractices.length,
        bucketCounts,
        effectiveThresholds: {
          small_max: `$${(adaptiveThresholds.small_max / 1_000_000).toFixed(1)}M`,
          medium_max: `$${(adaptiveThresholds.medium_max / 1_000_000).toFixed(1)}M`,
          large_max: `$${(adaptiveThresholds.large_max / 1_000_000).toFixed(1)}M`,
          xlarge_max: `$${(adaptiveThresholds.xlarge_max / 1_000_000).toFixed(1)}M`,
        },
        thresholdsAdjusted: this.thresholdsWereAdjusted(adaptiveThresholds),
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
   * Calculate adaptive thresholds to ensure each bucket has at least MIN_BUCKET_SIZE practices.
   * Works from the edges (XXLarge and Small) toward the middle.
   * 
   * @param sortedPracticesDesc - Practices sorted by charges descending (highest first)
   */
  private calculateAdaptiveThresholds(sortedPracticesDesc: PracticeChargesData[]): AdaptiveThresholds {
    const minSize = BUCKET_SIZING.MIN_BUCKET_SIZE;
    const thresholds: AdaptiveThresholds = { ...CHARGE_BASED_THRESHOLDS };
    
    // Get annualized charges for threshold calculation
    const annualizedCharges = sortedPracticesDesc.map(p => p.avgMonthlyCharges * 12);
    
    // If we don't have enough practices for minimum bucket sizes, just use defaults
    if (annualizedCharges.length < minSize * 2) {
      log.info('Not enough practices for adaptive thresholds, using defaults', {
        operation: 'calculate_adaptive_thresholds',
        practiceCount: annualizedCharges.length,
        minRequired: minSize * 2,
        component: 'report-card',
      });
      return thresholds;
    }

    // Count practices in each bucket with current thresholds
    const countInBucket = (charges: number[], t: AdaptiveThresholds): Record<SizeBucket, number> => {
      const counts = { small: 0, medium: 0, large: 0, xlarge: 0, xxlarge: 0 };
      for (const c of charges) {
        if (c >= t.xlarge_max) counts.xxlarge++;
        else if (c >= t.large_max) counts.xlarge++;
        else if (c >= t.medium_max) counts.large++;
        else if (c >= t.small_max) counts.medium++;
        else counts.small++;
      }
      return counts;
    };

    // Initial counts
    let counts = countInBucket(annualizedCharges, thresholds);
    
    log.info('Initial bucket counts before adaptive adjustment', {
      operation: 'calculate_adaptive_thresholds',
      counts,
      component: 'report-card',
    });

    // Adjust XXLarge threshold (lower it to get more practices from XLarge)
    if (counts.xxlarge < minSize && counts.xxlarge + counts.xlarge >= minSize) {
      // Find the charge value at the (minSize)th position from top
      const targetIndex = minSize - 1; // 0-indexed
      const chargeAtTarget = annualizedCharges[targetIndex];
      if (targetIndex < annualizedCharges.length && chargeAtTarget !== undefined) {
        // Set threshold just below the (minSize)th highest practice
        thresholds.xlarge_max = chargeAtTarget - 1;
        counts = countInBucket(annualizedCharges, thresholds);
        
        log.info('Adjusted XXLarge threshold to meet minimum bucket size', {
          operation: 'calculate_adaptive_thresholds',
          newThreshold: `$${(thresholds.xlarge_max / 1_000_000).toFixed(1)}M`,
          newXXLargeCount: counts.xxlarge,
          component: 'report-card',
        });
      }
    }

    // Adjust Small threshold (raise it to get more practices from Medium)
    // Sort ascending for small bucket calculation
    const chargesAsc = [...annualizedCharges].sort((a, b) => a - b);
    if (counts.small < minSize && counts.small + counts.medium >= minSize) {
      const targetIndex = minSize - 1; // 0-indexed
      const chargeAtTarget = chargesAsc[targetIndex];
      if (targetIndex < chargesAsc.length && chargeAtTarget !== undefined) {
        // Set threshold just above the (minSize)th lowest practice
        thresholds.small_max = chargeAtTarget + 1;
        counts = countInBucket(annualizedCharges, thresholds);
        
        log.info('Adjusted Small threshold to meet minimum bucket size', {
          operation: 'calculate_adaptive_thresholds',
          newThreshold: `$${(thresholds.small_max / 1_000_000).toFixed(1)}M`,
          newSmallCount: counts.small,
          component: 'report-card',
        });
      }
    }

    // Adjust XLarge threshold if still undersized (after XXLarge adjustment)
    if (counts.xlarge < minSize && counts.xlarge + counts.large >= minSize) {
      // Find practices between large_max and xlarge_max, sorted descending
      const xlargeAndLarge = annualizedCharges
        .filter(c => c >= thresholds.medium_max && c < thresholds.xlarge_max)
        .sort((a, b) => b - a);
      
      const targetIndex = minSize - 1;
      const chargeAtTarget = xlargeAndLarge[targetIndex];
      if (xlargeAndLarge.length >= minSize && chargeAtTarget !== undefined) {
        thresholds.large_max = chargeAtTarget - 1;
        counts = countInBucket(annualizedCharges, thresholds);
        
        log.info('Adjusted XLarge threshold to meet minimum bucket size', {
          operation: 'calculate_adaptive_thresholds',
          newThreshold: `$${(thresholds.large_max / 1_000_000).toFixed(1)}M`,
          newXLargeCount: counts.xlarge,
          component: 'report-card',
        });
      }
    }

    // Adjust Medium threshold if undersized
    if (counts.medium < minSize && counts.medium + counts.large >= minSize) {
      const mediumAndLarge = chargesAsc
        .filter(c => c >= thresholds.small_max && c < thresholds.large_max);
      
      const targetIndex = minSize - 1;
      const chargeAtTarget = mediumAndLarge[targetIndex];
      if (mediumAndLarge.length >= minSize && chargeAtTarget !== undefined) {
        thresholds.medium_max = chargeAtTarget + 1;
        counts = countInBucket(annualizedCharges, thresholds);
        
        log.info('Adjusted Medium threshold to meet minimum bucket size', {
          operation: 'calculate_adaptive_thresholds',
          newThreshold: `$${(thresholds.medium_max / 1_000_000).toFixed(1)}M`,
          newMediumCount: counts.medium,
          component: 'report-card',
        });
      }
    }

    // Final counts log
    log.info('Final bucket counts after adaptive adjustment', {
      operation: 'calculate_adaptive_thresholds',
      counts,
      component: 'report-card',
    });

    return thresholds;
  }

  /**
   * Check if thresholds were adjusted from defaults
   */
  private thresholdsWereAdjusted(thresholds: AdaptiveThresholds): boolean {
    return (
      thresholds.small_max !== CHARGE_BASED_THRESHOLDS.small_max ||
      thresholds.medium_max !== CHARGE_BASED_THRESHOLDS.medium_max ||
      thresholds.large_max !== CHARGE_BASED_THRESHOLDS.large_max ||
      thresholds.xlarge_max !== CHARGE_BASED_THRESHOLDS.xlarge_max
    );
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
   * Uses adaptive thresholds that may have been adjusted to ensure
   * each bucket has at least MIN_BUCKET_SIZE practices.
   * 
   * @param annualizedCharges - Annual charges for the practice
   * @param thresholds - Adaptive thresholds (may differ from defaults)
   */
  private determineBucketByCharges(
    annualizedCharges: number,
    thresholds: AdaptiveThresholds = this.effectiveThresholds
  ): SizeBucket {
    if (annualizedCharges >= thresholds.xlarge_max) {
      return 'xxlarge';
    }
    if (annualizedCharges >= thresholds.large_max) {
      return 'xlarge';
    }
    if (annualizedCharges >= thresholds.medium_max) {
      return 'large';
    }
    if (annualizedCharges >= thresholds.small_max) {
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
   * Uses the effective thresholds from the last sizing run, which may have been
   * adjusted from defaults to ensure minimum bucket sizes.
   */
  getThresholdDescriptions(): Record<SizeBucket, string> {
    const t = this.effectiveThresholds;
    return {
      small: `Annual charges < $${(t.small_max / 1_000_000).toFixed(0)}M`,
      medium: `Annual charges $${(t.small_max / 1_000_000).toFixed(0)}M - $${(t.medium_max / 1_000_000).toFixed(0)}M`,
      large: `Annual charges $${(t.medium_max / 1_000_000).toFixed(0)}M - $${(t.large_max / 1_000_000).toFixed(0)}M`,
      xlarge: `Annual charges $${(t.large_max / 1_000_000).toFixed(0)}M - $${(t.xlarge_max / 1_000_000).toFixed(0)}M`,
      xxlarge: `Annual charges > $${(t.xlarge_max / 1_000_000).toFixed(0)}M`,
    };
  }

  /**
   * Get the effective thresholds used in the last sizing run
   * Useful for debugging and understanding why certain practices are in certain buckets
   */
  getEffectiveThresholds(): AdaptiveThresholds {
    return { ...this.effectiveThresholds };
  }
}

// Export singleton instance for CLI and cron use
export const practiceSizer = new PracticeSizingService();
