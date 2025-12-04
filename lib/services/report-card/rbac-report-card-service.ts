/**
 * RBAC Report Card Service
 *
 * Main service for report card operations with RBAC enforcement.
 * Reuses existing analytics:read:* permissions.
 */

import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
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
} from '@/lib/types/report-card';
import type { SizeBucket, TrendPeriod, TrendDirection } from '@/lib/constants/report-card';
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
   * Get trends for a specific practice
   */
  async getTrends(practiceUid: number, period?: TrendPeriod): Promise<PracticeTrend[]> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'analytics:read:own',
      'analytics:read:organization',
      'analytics:read:all',
    ]);

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

      // Calculate averages and percentiles for each measure
      const averages: Record<string, number> = {};
      const percentiles: Record<string, { p25: number; p50: number; p75: number }> = {};

      for (const measure of measures) {
        const stats = await this.calculateMeasureStats(
          practices.map((p) => p.practice_uid),
          measure.measure_name
        );

        averages[measure.measure_name] = stats.average;
        percentiles[measure.measure_name] = {
          p25: stats.p25,
          p50: stats.p50,
          p75: stats.p75,
        };
      }

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
   * Calculate measure statistics for a set of practices
   * Returns average and percentile breakdowns for peer comparison
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
