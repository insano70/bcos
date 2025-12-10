/**
 * Statistics Collector Service
 *
 * Collects practice metrics from the analytics database (ih.agg_chart_data)
 * and stores them in the main database for trend analysis and report card generation.
 *
 * Measures are configured in report_card_measures with filter_criteria that define
 * how to query the data. For example:
 * - measure_name: "new_patients", filter_criteria: {"measure": "Visits", "entity_name": "New Patient"}
 * - measure_name: "charges", filter_criteria: {"measure": "Charges"}
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_statistics, report_card_measures } from '@/lib/db/schema';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { StatisticsCollectionError } from '@/lib/errors/report-card-errors';
import { REPORT_CARD_LIMITS } from '@/lib/constants/report-card';
import { getPracticeOrganizationMappings } from '@/lib/utils/organization-mapping';
import type { CollectionResult } from '@/lib/types/report-card';
import type { CollectionOptions, MeasureWithFilters, MeasureStatisticsRow } from './types';

/**
 * Statistics Collector Service
 *
 * Handles the collection of practice metrics from the analytics database.
 * 
 * SECURITY: This service should only be invoked from:
 * 1. CLI scripts (BCOS_CLI_MODE=true environment variable)
 * 2. Admin API endpoints (fromAdminApi: true option)
 */
export class StatisticsCollectorService {
  /**
   * SECURITY: Validate that collection is being called from authorized context
   * @throws Error if called from unauthorized context
   */
  private validateCallerContext(options: CollectionOptions): void {
    const isCliMode = process.env.BCOS_CLI_MODE === 'true';
    const isAdminApi = options.fromAdminApi === true;

    if (!isCliMode && !isAdminApi) {
      log.security('Unauthorized statistics collection attempt', 'high', {
        operation: 'collect_statistics',
        isCliMode,
        isAdminApi,
        component: 'report-card',
      });
      throw new Error(
        'SECURITY: Statistics collection must be invoked from CLI (BCOS_CLI_MODE=true) or admin API (fromAdminApi: true)'
      );
    }

    log.info('Statistics collection caller context validated', {
      operation: 'collect_statistics',
      context: isCliMode ? 'CLI' : 'Admin API',
      component: 'report-card',
    });
  }

  /**
   * Collect statistics from analytics DB and store in main DB
   * Iterates over active measures and generates dynamic SQL based on filter_criteria
   * 
   * SECURITY: Must be called from CLI or admin API only
   */
  async collect(options: CollectionOptions = {}): Promise<CollectionResult> {
    // SECURITY: Validate caller context before proceeding
    this.validateCallerContext(options);

    const startTime = Date.now();
    let recordsInserted = 0;
    let recordsUpdated = 0;
    const practiceSet = new Set<number>();

    try {
      // Get active measures with their filter configurations
      const activeMeasures = await this.getActiveMeasuresWithFilters();

      if (activeMeasures.length === 0) {
        log.warn('No active measures configured for statistics collection', {
          operation: 'collect_statistics',
          component: 'report-card',
        });
        return {
          practicesProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          duration: Date.now() - startTime,
        };
      }

      // Calculate cutoff date - first of current month (only use completed months)
      const now = new Date();
      const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

      log.info('Starting statistics collection from analytics DB', {
        operation: 'collect_statistics',
        practiceUid: options.practiceUid || 'all',
        force: options.force,
        cutoffDate: cutoffDateStr,
        measureCount: activeMeasures.length,
        measures: activeMeasures.map((m) => m.measure_name),
        component: 'report-card',
      });

      // Get organization mappings for practices (shared utility)
      const orgMappings = await getPracticeOrganizationMappings();

      // Process each measure
      for (const measure of activeMeasures) {
        try {
          const measureStartTime = Date.now();
          const result = await this.collectMeasure(measure, cutoffDateStr, options, orgMappings);

          recordsInserted += result.inserted;
          recordsUpdated += result.updated;
          for (const practiceUid of result.practiceUids) {
            practiceSet.add(practiceUid);
          }

          const measureDuration = Date.now() - measureStartTime;
          log.debug('Collected measure statistics', {
            operation: 'collect_measure',
            measureName: measure.measure_name,
            rowsProcessed: result.inserted + result.updated,
            practicesAffected: result.practiceUids.length,
            duration: measureDuration,
            component: 'report-card',
          });
        } catch (error) {
          // Log error but continue with other measures
          log.error('Failed to collect measure', {
            operation: 'collect_measure',
            measureName: measure.measure_name,
            error: error instanceof Error ? error.message : 'Unknown error',
            component: 'report-card',
          });
        }
      }

      const duration = Date.now() - startTime;

      log.info('Statistics collection completed', {
        operation: 'collect_statistics',
        practicesProcessed: practiceSet.size,
        recordsInserted,
        recordsUpdated,
        measuresProcessed: activeMeasures.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'report-card',
      });

      return {
        practicesProcessed: practiceSet.size,
        recordsInserted,
        recordsUpdated,
        duration,
      };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown error';
      const truncatedMessage =
        rawMessage.length > 200 ? `${rawMessage.substring(0, 200)}... [truncated]` : rawMessage;

      log.error('Statistics collection failed', {
        operation: 'collect_statistics',
        practiceUid: options.practiceUid,
        error: truncatedMessage,
        component: 'report-card',
      });

      throw new StatisticsCollectionError(truncatedMessage, options.practiceUid);
    }
  }

  /**
   * Collect statistics for a single measure using its filter_criteria
   */
  private async collectMeasure(
    measure: MeasureWithFilters,
    cutoffDateStr: string,
    options: CollectionOptions,
    orgMappings: Map<number, string | null>
  ): Promise<{ inserted: number; updated: number; practiceUids: number[] }> {
    // Build dynamic SQL query based on filter_criteria
    const { query, params } = this.buildMeasureQuery(measure, cutoffDateStr, options.practiceUid);

    // Execute query against analytics database
    const rows = await executeAnalyticsQuery<MeasureStatisticsRow>(query, params);

    if (rows.length === 0) {
      return { inserted: 0, updated: 0, practiceUids: [] };
    }

    // Process in batches
    const practiceUids: number[] = [];
    let inserted = 0;
    let updated = 0;

    const batchSize = REPORT_CARD_LIMITS.MAX_PRACTICES_PER_BATCH;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const result = await this.processMeasureBatch(measure.measure_name, batch, orgMappings, options.force);
      inserted += result.inserted;
      updated += result.updated;

      for (const row of batch) {
        if (!practiceUids.includes(row.practice_uid)) {
          practiceUids.push(row.practice_uid);
        }
      }
    }

    return { inserted, updated, practiceUids };
  }

  /**
   * Build dynamic SQL query based on measure's filter_criteria
   */
  private buildMeasureQuery(
    measure: MeasureWithFilters,
    cutoffDateStr: string,
    practiceUid?: number
  ): { query: string; params: (string | number)[] } {
    const filterCriteria = measure.filter_criteria || {};
    const valueColumn = measure.value_column || 'numeric_value';

    // Start building WHERE clause conditions
    const conditions: string[] = [
      "time_period = 'Monthly'",
      'practice_uid IS NOT NULL',
      `${valueColumn} IS NOT NULL`,
      'date_value < $1',
    ];
    const params: (string | number)[] = [cutoffDateStr];
    let paramIndex = 2;

    // Add filter criteria conditions
    for (const [column, value] of Object.entries(filterCriteria)) {
      // Validate column name to prevent SQL injection
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
        log.warn('Invalid column name in filter_criteria', {
          measureName: measure.measure_name,
          column,
          component: 'report-card',
        });
        continue;
      }
      conditions.push(`${column} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }

    // Add practice filter if specified
    if (practiceUid !== undefined) {
      conditions.push(`practice_uid = $${paramIndex}`);
      params.push(practiceUid);
    }

    const whereClause = conditions.join(' AND ');

    // Build query with aggregation
    // Group by practice_uid, time_period, date_value to get one value per practice/period
    const query = `
      SELECT 
        practice_uid,
        time_period,
        date_value::text as date_value,
        SUM(${valueColumn}) as numeric_value
      FROM ih.agg_chart_data
      WHERE ${whereClause}
      GROUP BY practice_uid, time_period, date_value
      ORDER BY practice_uid, date_value
    `;

    return { query, params };
  }

  /**
   * Process a batch of statistics rows for a specific measure
   */
  private async processMeasureBatch(
    measureName: string,
    rows: MeasureStatisticsRow[],
    orgMappings: Map<number, string | null>,
    force?: boolean
  ): Promise<{ inserted: number; updated: number }> {
    const validRecords: Array<{
      practice_uid: number;
      organization_id: string | null;
      measure_name: string;
      time_period: string;
      period_date: Date;
      value: string;
    }> = [];

    for (const row of rows) {
      const organizationId = orgMappings.get(row.practice_uid) || null;

      const value =
        typeof row.numeric_value === 'string' ? parseFloat(row.numeric_value) : row.numeric_value;

      if (Number.isNaN(value)) {
        continue;
      }

      validRecords.push({
        practice_uid: row.practice_uid,
        organization_id: organizationId,
        measure_name: measureName,
        time_period: row.time_period,
        period_date: new Date(row.date_value),
        value: String(value),
      });
    }

    if (validRecords.length === 0) {
      return { inserted: 0, updated: 0 };
    }

    if (force) {
      await db
        .insert(report_card_statistics)
        .values(validRecords)
        .onConflictDoUpdate({
          target: [
            report_card_statistics.practice_uid,
            report_card_statistics.measure_name,
            report_card_statistics.time_period,
            report_card_statistics.period_date,
          ],
          set: {
            value: sql`EXCLUDED.value`,
            organization_id: sql`EXCLUDED.organization_id`,
            collected_at: new Date(),
          },
        });
      return { inserted: 0, updated: validRecords.length };
    }

    await db
      .insert(report_card_statistics)
      .values(validRecords)
      .onConflictDoNothing({
        target: [
          report_card_statistics.practice_uid,
          report_card_statistics.measure_name,
          report_card_statistics.time_period,
          report_card_statistics.period_date,
        ],
      });
    return { inserted: validRecords.length, updated: 0 };
  }

  /**
   * Get active measures with their filter configurations
   */
  async getActiveMeasuresWithFilters(): Promise<MeasureWithFilters[]> {
    const measures = await db
      .select({
        measure_id: report_card_measures.measure_id,
        measure_name: report_card_measures.measure_name,
        display_name: report_card_measures.display_name,
        weight: report_card_measures.weight,
        is_active: report_card_measures.is_active,
        higher_is_better: report_card_measures.higher_is_better,
        format_type: report_card_measures.format_type,
        data_source_id: report_card_measures.data_source_id,
        value_column: report_card_measures.value_column,
        filter_criteria: report_card_measures.filter_criteria,
      })
      .from(report_card_measures)
      .where(eq(report_card_measures.is_active, true));

    return measures.map((m) => ({
      measure_id: m.measure_id,
      measure_name: m.measure_name,
      display_name: m.display_name,
      weight: m.weight ? parseFloat(m.weight) : 5,
      is_active: m.is_active ?? true,
      higher_is_better: m.higher_is_better ?? true,
      format_type: m.format_type ?? 'number',
      data_source_id: m.data_source_id,
      value_column: m.value_column ?? 'numeric_value',
      filter_criteria: (m.filter_criteria as Record<string, string>) || {},
    }));
  }

  /**
   * Collect statistics for all practices
   */
  async collectAll(options: { force?: boolean } = {}): Promise<CollectionResult> {
    return this.collect({ force: options.force ?? false });
  }

  /**
   * Get distinct practice UIDs that have statistics
   */
  async getDistinctPracticeUids(): Promise<number[]> {
    const result = await db
      .selectDistinct({ practice_uid: report_card_statistics.practice_uid })
      .from(report_card_statistics);

    return result.map((r) => r.practice_uid);
  }

  /**
   * Get statistics for a specific practice
   */
  async getStatisticsForPractice(
    practiceUid: number
  ): Promise<Array<{ measureName: string; periodDate: Date; value: number }>> {
    const stats = await db
      .select({
        measure_name: report_card_statistics.measure_name,
        period_date: report_card_statistics.period_date,
        value: report_card_statistics.value,
      })
      .from(report_card_statistics)
      .where(eq(report_card_statistics.practice_uid, practiceUid))
      .orderBy(report_card_statistics.measure_name, report_card_statistics.period_date);

    return stats.map((s) => ({
      measureName: s.measure_name,
      periodDate: s.period_date,
      value: parseFloat(s.value),
    }));
  }
}

// Export singleton instance for use in CLI and cron
export const statisticsCollector = new StatisticsCollectorService();
