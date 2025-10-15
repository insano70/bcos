/**
 * Column Mapping Service
 * 
 * Provides centralized service for resolving data source column mappings
 * with in-memory caching for performance.
 * 
 * This service acts as a bridge between data source configuration and
 * dynamic column access via MeasureAccessor.
 * 
 * @see DataSourceColumnMapping
 * @see MeasureAccessor
 * @see docs/DYNAMIC_COLUMN_REFACTORING_PLAN.md
 */

import { chartConfigService } from './chart-config-service';
import type { DataSourceColumnMapping, AggAppMeasure, MeasureAccessor } from '@/lib/types/analytics';
import { MeasureAccessor as MeasureAccessorClass } from '@/lib/types/analytics';
import { log } from '@/lib/logger';

/**
 * Service for managing data source column mappings
 * 
 * Provides cached access to column configurations and factory methods
 * for creating MeasureAccessor instances.
 * 
 * @example
 * ```typescript
 * // Get mapping for a data source
 * const mapping = await columnMappingService.getMapping(3);
 * console.log(mapping.dateField); // "date_value"
 * console.log(mapping.measureField); // "numeric_value"
 * 
 * // Create accessor for a row
 * const accessor = await columnMappingService.createAccessor(row, 3);
 * const date = accessor.getDate();
 * const value = accessor.getMeasureValue();
 * ```
 */
export class ColumnMappingService {
  /**
   * In-memory cache for column mappings
   * Key: dataSourceId, Value: DataSourceColumnMapping
   */
  private cache = new Map<number, DataSourceColumnMapping>();

  /**
   * Get column mapping for a data source
   * 
   * Results are cached in memory for performance.
   * Cache is cleared when invalidate() is called.
   * 
   * @param dataSourceId - Data source ID
   * @returns Column mapping configuration
   * @throws Error if data source not found or required columns missing
   */
  async getMapping(dataSourceId: number): Promise<DataSourceColumnMapping> {
    // Check cache first
    const cached = this.cache.get(dataSourceId);
    if (cached) {
      log.debug('Column mapping cache hit', {
        component: 'column-mapping-service',
        dataSourceId,
      });
      return cached;
    }

    log.debug('Column mapping cache miss - loading from config', {
      component: 'column-mapping-service',
      dataSourceId,
    });

    // Load from config service
    const config = await chartConfigService.getDataSourceConfigById(dataSourceId);
    if (!config) {
      throw new Error(`Data source ${dataSourceId} not found`);
    }

    // Resolve all required columns
    const mapping: DataSourceColumnMapping = {
      dateField: this.findColumnByType(config.columns, 'date', dataSourceId),
      measureField: this.findColumnByType(config.columns, 'measure', dataSourceId),
      measureTypeField: this.findColumnByType(config.columns, 'measureType', dataSourceId),
      timePeriodField: this.findColumnByType(config.columns, 'timePeriod', dataSourceId),
      practiceField: this.findColumnByType(config.columns, 'practice', dataSourceId, false),
      providerField: this.findColumnByType(config.columns, 'provider', dataSourceId, false),
    };

    // Cache the result
    this.cache.set(dataSourceId, mapping);

    log.info('Column mapping loaded and cached', {
      component: 'column-mapping-service',
      dataSourceId,
      mapping,
    });

    return mapping;
  }

  /**
   * Find column name by type from data source configuration
   * 
   * Uses column flags (isMeasure, isDateField, etc.) to identify columns.
   * Falls back to naming conventions for practice/provider fields.
   * 
   * @param columns - Column configuration array
   * @param type - Column type to find
   * @param dataSourceId - Data source ID (for error messages)
   * @param required - Whether the column is required (default: true)
   * @returns Column name
   * @throws Error if required column not found
   */
  private findColumnByType(
    columns: Array<{
      columnName: string;
      isDateField?: boolean;
      isTimePeriod?: boolean;
      isMeasure?: boolean;
      isMeasureType?: boolean;
    }>,
    type: 'date' | 'measure' | 'measureType' | 'timePeriod' | 'practice' | 'provider',
    dataSourceId: number,
    required: boolean = true
  ): string {
    let column: { columnName: string } | undefined;

    switch (type) {
      case 'date':
        // Find actual date field, NOT time period field
        // Some columns may have both isDateField and isTimePeriod flags
        column = columns.find(col => col.isDateField && !col.isTimePeriod);
        break;

      case 'measure':
        // Find the measure value column (numeric)
        column = columns.find(col => col.isMeasure);
        break;

      case 'measureType':
        // Find measure type column (currency, count, etc.)
        // Typically named "measure_type" but use isMeasureType flag if available
        column = columns.find(col => col.isMeasureType || col.columnName === 'measure_type');
        break;

      case 'timePeriod':
        // Find time period/frequency column (Monthly, Weekly, etc.)
        column = columns.find(col => col.isTimePeriod);
        break;

      case 'practice':
        // No specific flag - use naming convention
        column = columns.find(col =>
          col.columnName.toLowerCase().includes('practice')
        );
        break;

      case 'provider':
        // No specific flag - use naming convention
        column = columns.find(col =>
          col.columnName.toLowerCase().includes('provider')
        );
        break;
    }

    if (!column && required) {
      throw new Error(
        `Required column type "${type}" not found in data source ${dataSourceId}. ` +
        `Please check data source configuration.`
      );
    }

    return column?.columnName || '';
  }

  /**
   * Create MeasureAccessor for a data row
   * 
   * Factory method that automatically fetches column mapping
   * and creates a properly configured accessor.
   * 
   * @param row - Data row
   * @param dataSourceId - Data source ID
   * @returns MeasureAccessor instance
   */
  async createAccessor(
    row: AggAppMeasure,
    dataSourceId: number
  ): Promise<MeasureAccessor> {
    const mapping = await this.getMapping(dataSourceId);
    return new MeasureAccessorClass(row, mapping);
  }

  /**
   * Create multiple accessors at once
   * 
   * More efficient than calling createAccessor() in a loop
   * as it only fetches the mapping once.
   * 
   * @param rows - Array of data rows
   * @param dataSourceId - Data source ID
   * @returns Array of MeasureAccessor instances
   */
  async createAccessors(
    rows: AggAppMeasure[],
    dataSourceId: number
  ): Promise<MeasureAccessor[]> {
    const mapping = await this.getMapping(dataSourceId);
    return rows.map(row => new MeasureAccessorClass(row, mapping));
  }

  /**
   * Clear cache for a specific data source or all data sources
   * 
   * Call this when data source configuration changes.
   * 
   * @param dataSourceId - Optional data source ID to clear (clears all if omitted)
   */
  invalidate(dataSourceId?: number): void {
    if (dataSourceId !== undefined) {
      this.cache.delete(dataSourceId);
      log.info('Column mapping cache invalidated for data source', {
        component: 'column-mapping-service',
        dataSourceId,
      });
    } else {
      this.cache.clear();
      log.info('Column mapping cache cleared', {
        component: 'column-mapping-service',
        entriesCleared: this.cache.size,
      });
    }
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache size and cached data source IDs
   */
  getCacheStats(): { size: number; dataSourceIds: number[] } {
    return {
      size: this.cache.size,
      dataSourceIds: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Singleton instance of ColumnMappingService
 * 
 * Use this exported instance throughout the application.
 * 
 * @example
 * ```typescript
 * import { columnMappingService } from '@/lib/services/column-mapping-service';
 * 
 * const mapping = await columnMappingService.getMapping(3);
 * const accessor = await columnMappingService.createAccessor(row, 3);
 * ```
 */
export const columnMappingService = new ColumnMappingService();

