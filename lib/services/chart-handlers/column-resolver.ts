/**
 * Column Resolver Utility
 *
 * Dynamically resolves column names from data source configuration
 * to avoid hardcoding column names in chart handlers.
 *
 * All chart handlers should use these utilities instead of hardcoded strings.
 *
 * NOTE: For new code, prefer columnMappingService over these legacy functions.
 * @see lib/services/column-mapping-service.ts
 */

import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { DataSourceColumnMapping } from '@/lib/types/analytics';

/**
 * Column type identifiers for data source columns
 */
export type ColumnType = 'measure' | 'date' | 'timePeriod' | 'practice' | 'provider';

/**
 * Resolved column names from data source configuration
 */
export interface ResolvedColumns {
  measureColumn: string;
  dateColumn: string;
  timePeriodColumn: string;
  practiceColumn: string;
  providerColumn: string;
}

/**
 * Get column name for a specific type from data source configuration
 *
 * @param dataSourceId - Data source ID
 * @param columnType - Type of column to resolve
 * @returns Column name or default fallback
 */
export async function getColumnName(
  dataSourceId: number | undefined,
  columnType: ColumnType
): Promise<string> {
  if (!dataSourceId) {
    return getDefaultColumnName(columnType);
  }

  try {
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);

    if (!dataSourceConfig) {
      log.warn('Data source config not found, using default column name', {
        dataSourceId,
        columnType,
      });
      return getDefaultColumnName(columnType);
    }

    // Find the column based on type
    let column: { columnName: string } | undefined;

    switch (columnType) {
      case 'measure':
        column = dataSourceConfig.columns.find((col) => col.isMeasure);
        break;
      case 'date':
        // CRITICAL: Find actual date field, NOT time period field
        // Exclude columns that are both date AND time period (like "time_period" column)
        column = dataSourceConfig.columns.find((col) => col.isDateField && !col.isTimePeriod);
        break;
      case 'timePeriod':
        column = dataSourceConfig.columns.find((col) => col.isTimePeriod);
        break;
      case 'practice':
        // No specific flag - use naming convention
        column = dataSourceConfig.columns.find((col) =>
          col.columnName.toLowerCase().includes('practice')
        );
        break;
      case 'provider':
        // No specific flag - use naming convention
        column = dataSourceConfig.columns.find((col) =>
          col.columnName.toLowerCase().includes('provider')
        );
        break;
    }

    const resolvedName = column?.columnName || getDefaultColumnName(columnType);

    log.debug('Column name resolved', {
      dataSourceId,
      columnType,
      resolvedName,
      fromConfig: Boolean(column),
    });

    return resolvedName;
  } catch (error) {
    log.error('Failed to resolve column name', error instanceof Error ? error : new Error(String(error)), {
      dataSourceId,
      columnType,
      operation: 'resolve_column_name',
      component: 'analytics',
    });
    return getDefaultColumnName(columnType);
  }
}

/**
 * Get all column names from data source configuration in one call
 * More efficient than multiple individual calls
 *
 * @param dataSourceId - Data source ID
 * @returns Resolved column names for all types
 */
export async function getResolvedColumns(
  dataSourceId: number | undefined
): Promise<ResolvedColumns> {
  if (!dataSourceId) {
    return getDefaultColumns();
  }

  try {
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);

    if (!dataSourceConfig) {
      log.warn('Data source config not found, using default columns', {
        dataSourceId,
      });
      return getDefaultColumns();
    }

    const measureColumn = dataSourceConfig.columns.find((col) => col.isMeasure);

    // CRITICAL: Find actual date field, NOT time period field
    // Some columns (like time_period) may have BOTH isDateField and isTimePeriod flags
    // We want the actual date column (date_value, date_index), not the period name column
    const dateColumn = dataSourceConfig.columns.find((col) => col.isDateField && !col.isTimePeriod);

    // Time period field: contains values like "Monthly", "Weekly", "Daily"
    const timePeriodColumn = dataSourceConfig.columns.find((col) => col.isTimePeriod);

    const practiceColumn = dataSourceConfig.columns.find((col) =>
      col.columnName.toLowerCase().includes('practice')
    );
    const providerColumn = dataSourceConfig.columns.find((col) =>
      col.columnName.toLowerCase().includes('provider')
    );

    const resolved: ResolvedColumns = {
      measureColumn: measureColumn?.columnName || 'measure_value',
      dateColumn: dateColumn?.columnName || 'date_index',
      timePeriodColumn: timePeriodColumn?.columnName || 'time_period',
      practiceColumn: practiceColumn?.columnName || 'practice_uid',
      providerColumn: providerColumn?.columnName || 'provider_uid',
    };

    log.debug('All columns resolved', {
      dataSourceId,
      resolved,
    });

    return resolved;
  } catch (error) {
    log.error('Failed to resolve columns', error instanceof Error ? error : new Error(String(error)), {
      dataSourceId,
      operation: 'resolve_columns',
      component: 'analytics',
    });
    return getDefaultColumns();
  }
}

/**
 * Get default column name for a type (legacy fallback)
 */
function getDefaultColumnName(columnType: ColumnType): string {
  switch (columnType) {
    case 'measure':
      return 'measure_value';
    case 'date':
      return 'date_index';
    case 'timePeriod':
      return 'time_period';
    case 'practice':
      return 'practice_uid';
    case 'provider':
      return 'provider_uid';
  }
}

/**
 * Get all default column names (legacy fallback)
 */
function getDefaultColumns(): ResolvedColumns {
  return {
    measureColumn: 'measure_value',
    dateColumn: 'date_index',
    timePeriodColumn: 'time_period',
    practiceColumn: 'practice_uid',
    providerColumn: 'provider_uid',
  };
}

/**
 * Get column mapping for a data source
 *
 * Converts ResolvedColumns format to DataSourceColumnMapping format
 * for use with MeasureAccessor.
 *
 * NOTE: This is a bridge function for migration. New code should use
 * columnMappingService.getMapping() directly.
 *
 * @param dataSourceId - Data source ID
 * @returns Column mapping in DataSourceColumnMapping format
 */
export async function getColumnMapping(
  dataSourceId: number | undefined
): Promise<DataSourceColumnMapping> {
  const columns = await getResolvedColumns(dataSourceId);

  return {
    dateField: columns.dateColumn,
    measureField: columns.measureColumn,
    measureTypeField: 'measure_type', // Assuming standard for now
    timePeriodField: columns.timePeriodColumn,
    practiceField: columns.practiceColumn,
    providerField: columns.providerColumn,
  };
}
