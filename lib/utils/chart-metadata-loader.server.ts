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
import { analyticsCache } from '@/lib/cache';
import { log } from '@/lib/logger';

/**
 * Load column metadata for a data source
 * Uses Redis cache with 1-hour TTL to eliminate duplicate queries
 * SERVER-SIDE ONLY - This file should never be imported by client components
 */
export async function loadColumnMetadata(
  dataSourceId: number
): Promise<Map<string, ColumnConfig>> {
  try {
    // Check cache first
    const cachedColumns = await analyticsCache.getDataSourceColumns(dataSourceId);

    if (cachedColumns) {
      log.debug('Column metadata cache hit', {
        dataSourceId,
        columnCount: cachedColumns.length,
        component: 'chart-metadata-loader',
      });

      // Convert cached columns to Map format
      return new Map<string, ColumnConfig>(
        cachedColumns.map((col) => [
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
    }

    // Cache miss - query database
    log.debug('Column metadata cache miss, querying database', {
      dataSourceId,
      component: 'chart-metadata-loader',
    });

    const columns = await db
      .select()
      .from(chart_data_source_columns)
      .where(
        and(
          eq(chart_data_source_columns.data_source_id, dataSourceId),
          eq(chart_data_source_columns.is_active, true)
        )
      );

    // Cache the result (fire and forget)
    analyticsCache.setDataSourceColumns(dataSourceId, columns as unknown as import('@/lib/cache').DataSourceColumn[]).catch((error) => {
      log.error('Failed to cache column metadata', error, {
        dataSourceId,
        component: 'chart-metadata-loader',
      });
    });

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
    log.warn('Failed to load column metadata, using fallback mode', {
      dataSourceId,
      component: 'chart-metadata-loader',
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
