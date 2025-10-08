/**
 * Server-only chart metadata loader
 * Loads column metadata from database for dynamic grouping validation
 *
 * IMPORTANT: This file uses .server.ts extension to ensure it's never bundled for client
 */

import 'server-only';
import { db } from '@/lib/db';
import { chart_data_source_columns } from '@/lib/db/chart-config-schema';
import { eq, and } from 'drizzle-orm';
import type { ColumnConfig } from '@/lib/services/chart-config-service';

/**
 * Load column metadata for a data source
 * SERVER-SIDE ONLY - This file should never be imported by client components
 */
export async function loadColumnMetadata(
  dataSourceId: number
): Promise<Map<string, ColumnConfig>> {
  try {
    const columns = await db
      .select()
      .from(chart_data_source_columns)
      .where(
        and(
          eq(chart_data_source_columns.data_source_id, dataSourceId),
          eq(chart_data_source_columns.is_active, true)
        )
      );

    return new Map<string, ColumnConfig>(
      columns.map((col) => [
        col.column_name,
        {
          id: col.column_id,
          columnName: col.column_name,
          displayName: col.display_name,
          description: col.column_description || undefined,
          dataType: col.data_type,
          isFilterable: col.is_filterable || false,
          isGroupable: col.is_groupable || false,
          isMeasure: col.is_measure || false,
          isDimension: col.is_dimension || false,
          isDateField: col.is_date_field || false,
          isMeasureType: col.is_measure_type || undefined,
          isTimePeriod: col.is_time_period || undefined,
          formatType: col.format_type || undefined,
          sortOrder: col.sort_order || 0,
          defaultAggregation: col.default_aggregation || undefined,
          exampleValue: col.example_value || undefined,
        } as ColumnConfig,
      ])
    );
  } catch (error) {
    console.warn('Failed to load column metadata, using fallback mode:', error);
    return new Map();
  }
}
