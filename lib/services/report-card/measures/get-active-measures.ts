/**
 * Get Active Measures
 *
 * Standalone function for retrieving active measure configurations.
 * Used by CLI and cron jobs that don't have a user context.
 *
 * IMPORTANT: This function has NO RBAC checks - it's designed for
 * CLI/cron operations where there's no user context.
 *
 * For RBAC-protected access, use RBACMeasureService.getList() instead.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_measures } from '@/lib/db/schema';
import type { MeasureConfig } from '@/lib/types/report-card';

/**
 * Map database row to MeasureConfig domain object
 */
function mapToMeasureConfig(row: typeof report_card_measures.$inferSelect): MeasureConfig {
  return {
    measure_id: row.measure_id,
    measure_name: row.measure_name,
    display_name: row.display_name,
    weight: parseFloat(row.weight || '5'),
    is_active: row.is_active ?? true,
    higher_is_better: row.higher_is_better ?? true,
    format_type: (row.format_type as 'number' | 'currency' | 'percentage') || 'number',
    data_source_id: row.data_source_id,
    value_column: row.value_column || 'numeric_value',
    filter_criteria: (row.filter_criteria as Record<string, string>) || {},
    created_at: row.created_at?.toISOString() || new Date().toISOString(),
    updated_at: row.updated_at?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Get active measures configuration.
 *
 * IMPORTANT: This function has NO RBAC checks - it's designed for
 * CLI/cron operations where there's no user context.
 *
 * For RBAC-protected access, use RBACMeasureService.getList() instead.
 *
 * @returns Array of active MeasureConfig objects ordered by weight (descending)
 */
export async function getActiveMeasures(): Promise<MeasureConfig[]> {
  const measures = await db
    .select()
    .from(report_card_measures)
    .where(eq(report_card_measures.is_active, true))
    .orderBy(desc(report_card_measures.weight));

  return measures.map(mapToMeasureConfig);
}
