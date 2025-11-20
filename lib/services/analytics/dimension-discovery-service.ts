/**
 * Dimension Discovery Service
 *
 * Discovers and retrieves expansion dimensions from data source metadata.
 * Enables dynamic dimension-based chart expansion without hardcoded configuration.
 *
 * Key Responsibilities:
 * - Find expansion dimensions in data source columns
 * - Query unique dimension values from analytics data
 * - Apply RBAC filtering to dimension values
 * - Support current dashboard filters when discovering values
 */

import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartFilter } from '@/lib/types/analytics';
import type {
  AvailableDimensionsResponse,
  DimensionValue,
  DimensionValuesResponse,
  ExpansionDimension,
} from '@/lib/types/dimensions';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';

/**
 * Dimension Discovery Service
 *
 * Discovers expansion dimensions from data source configuration
 */
export class DimensionDiscoveryService {
  /**
   * Get expansion dimensions available for a chart
   *
   * Gets expansion dimensions from data source configuration (Redis cache).
   *
   * @param chartDefinitionId - Chart definition ID
   * @param userContext - User context for RBAC
   * @returns Available expansion dimensions
   */
  async getChartExpansionDimensions(
    chartDefinitionId: string,
    userContext: UserContext
  ): Promise<AvailableDimensionsResponse> {
    const startTime = Date.now();

    try {
      // Get chart definition to find data source
      const chartsService = createRBACChartsService(userContext);
      const chartDef = await chartsService.getChartById(chartDefinitionId);
      
      // Get data_source_id from the denormalized integer column
      const dataSourceId = chartDef?.data_source_id || 0;

      if (!chartDef || dataSourceId === 0) {
        log.warn('Chart not found or missing data_source_id', {
          chartDefinitionId,
          hasChartDef: !!chartDef,
          dataSourceId,
          component: 'dimension-discovery',
        });
        
        return {
          dimensions: [],
          chartDefinitionId,
          dataSourceId: 0,
        };
      }

      // Get data source configuration from Redis cache (includes all column metadata)
      const { chartConfigService } = await import('@/lib/services/chart-config-service');
      const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
      
      if (!dataSourceConfig) {
        throw new Error(`Data source configuration not found: ${dataSourceId}`);
      }

      // Filter expansion dimension columns from config
      log.debug('Filtering expansion dimensions from config', {
        chartDefinitionId,
        dataSourceId,
        totalColumns: dataSourceConfig.columns.length,
        columnsWithExpansionFlag: dataSourceConfig.columns.filter((col) => col.isExpansionDimension).length,
        allColumns: dataSourceConfig.columns.map((col) => ({
          name: col.columnName,
          isExpansionDimension: col.isExpansionDimension,
        })),
        component: 'dimension-discovery',
      });

      const dimensions: ExpansionDimension[] = dataSourceConfig.columns
        .filter((col) => col.isExpansionDimension === true)
        .map((col) => ({
          columnName: col.columnName,
          displayName: col.expansionDisplayName || col.displayName,
          dataType: col.dataType as 'string' | 'integer' | 'boolean',
          dataSourceId: dataSourceId, // Use parameter, not column property
        }));

      const duration = Date.now() - startTime;

      log.info('Chart expansion dimensions discovered from cache', {
        chartDefinitionId,
        dataSourceId,
        dimensionCount: dimensions.length,
        dimensions: dimensions.map((d) => d.columnName),
        userId: userContext.user_id,
        duration,
        component: 'dimension-discovery',
      });

      return {
        dimensions,
        chartDefinitionId,
        dataSourceId,
      };
    } catch (error) {
      log.error('Failed to discover chart expansion dimensions', error as Error, {
        chartDefinitionId,
        userId: userContext.user_id,
        component: 'dimension-discovery',
      });
      throw error;
    }
  }

  /**
   * Get unique values for an expansion dimension
   *
   * Fetches data from cache and extracts unique dimension values in-memory.
   * Uses modern cache path with RBAC filtering, consistent with main query flow.
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumn - Dimension column name
   * @param filters - Current filters (date range, organization, etc.)
   * @param userContext - User context for RBAC
   * @param limit - Maximum number of values to return (default: 20)
   * @returns Unique dimension values
   */
  async getDimensionValues(
    dataSourceId: number,
    dimensionColumn: string,
    filters: ChartFilter[],
    userContext: UserContext,
    limit?: number
  ): Promise<DimensionValuesResponse> {
    const startTime = Date.now();

    // SECURITY: Validate and clamp limit parameter
    const validatedLimit = Math.min(
      Math.max(limit || DIMENSION_EXPANSION_LIMITS.DEFAULT, 1),
      DIMENSION_EXPANSION_LIMITS.MAXIMUM
    );

    try {
      log.debug('getDimensionValues called', {
        dataSourceId,
        dimensionColumn,
        filterCount: filters.length,
        filters: filters.map((f) => ({ field: f.field, operator: f.operator, value: f.value })),
        limit: validatedLimit,
        component: 'dimension-discovery',
      });

      // Get data source configuration from Redis cache (single lookup)
      const { chartConfigService } = await import('@/lib/services/chart-config-service');
      const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
      
      if (!dataSourceConfig) {
        throw new Error(`Data source configuration not found: ${dataSourceId}`);
      }

      log.debug('Data source config loaded', {
        dataSourceId,
        tableName: dataSourceConfig.tableName,
        schemaName: dataSourceConfig.schemaName,
        dataSourceType: dataSourceConfig.dataSourceType,
        columnCount: dataSourceConfig.columns.length,
        expansionColumns: dataSourceConfig.columns
          .filter((col) => col.isExpansionDimension === true)
          .map((col) => col.columnName),
        component: 'dimension-discovery',
      });

      // Validate dimension column exists and is configured for expansion
      const dimensionCol = dataSourceConfig.columns.find(
        (col) => col.columnName === dimensionColumn && col.isExpansionDimension === true
      );

      if (!dimensionCol) {
        log.error('Expansion dimension column not found', {
          dimensionColumn,
          dataSourceId,
          availableExpansionColumns: dataSourceConfig.columns
            .filter((col) => col.isExpansionDimension === true)
            .map((col) => col.columnName),
          allColumns: dataSourceConfig.columns.map((col) => ({
            name: col.columnName,
            isExpansionDimension: col.isExpansionDimension,
          })),
          component: 'dimension-discovery',
        });
        throw new Error(
          `Expansion dimension column not found: ${dimensionColumn} in data source ${dataSourceId}`
        );
      }

      // Extract filter parameters for cache query
      const startDateFilter = filters.find((f) => f.field === 'date' && f.operator === 'gte');
      const endDateFilter = filters.find((f) => f.field === 'date' && f.operator === 'lte');
      const practiceFilter = filters.find((f) => f.field === 'practice_uid' && f.operator === 'in');
      
      // Find measure and frequency from filters or use defaults
      const measureFilter = filters.find((f) => f.field === 'measure');
      const frequencyFilter = filters.find((f) => f.field === 'frequency' || f.field === 'time_period');
      
      // Build advanced filters (exclude measure, frequency, date, practice_uid - handled separately)
      const advancedFilters = filters.filter(
        (f) => !['date', 'practice_uid', 'measure', 'frequency', 'time_period'].includes(f.field)
      );

      log.debug('Extracted filter parameters', {
        dataSourceId,
        hasStartDate: !!startDateFilter,
        hasEndDate: !!endDateFilter,
        hasPractice: !!practiceFilter,
        hasMeasure: !!measureFilter,
        hasFrequency: !!frequencyFilter,
        advancedFilterCount: advancedFilters.length,
        measure: measureFilter?.value,
        frequency: frequencyFilter?.value,
        component: 'dimension-discovery',
      });

      // Validate frequency for measure-based sources (measure may be optional for multi-series charts)
      if (dataSourceConfig.dataSourceType === 'measure-based') {
        if (!frequencyFilter) {
          throw new Error(
            `Measure-based data source requires frequency filter. Got frequency: none`
          );
        }
        // Note: measure filter is optional for multi-series charts where each series has its own measure
        // Multi-series charts have seriesConfigs in chart_config with individual measures per series
      }

      // Build cache query params
      const cacheParams = {
        dataSourceId,
        schema: dataSourceConfig.schemaName,
        table: dataSourceConfig.tableName,
        dataSourceType: dataSourceConfig.dataSourceType,
        ...(measureFilter && { measure: measureFilter.value as string }),
        ...(frequencyFilter && { frequency: frequencyFilter.value as string }),
        ...(practiceFilter && Array.isArray(practiceFilter.value) && practiceFilter.value.length === 1 && {
          practiceUid: practiceFilter.value[0] as number,
        }),
        ...(startDateFilter && { startDate: startDateFilter.value as string }),
        ...(endDateFilter && { endDate: endDateFilter.value as string }),
        ...(advancedFilters.length > 0 && { advancedFilters }),
      };

      log.debug('Cache query params built', {
        dataSourceId,
        cacheParams,
        component: 'dimension-discovery',
      });

      // Fetch data from cache (uses existing cache path with RBAC filtering)
      const { dataSourceCache } = await import('@/lib/cache');
      const cacheResult = await dataSourceCache.fetchDataSource(
        cacheParams,
        userContext,
        false // Use cache
      );

      log.debug('Cache fetch completed', {
        dataSourceId,
        rowCount: cacheResult.rows.length,
        cacheHit: cacheResult.cacheHit,
        component: 'dimension-discovery',
      });

      // Extract unique dimension values in-memory
      const uniqueValuesSet = new Set<string | number | null>();
      
      log.debug('Extracting unique dimension values', {
        dataSourceId,
        dimensionColumn,
        totalRows: cacheResult.rows.length,
        sampleRow: cacheResult.rows[0],
        component: 'dimension-discovery',
      });

      for (const row of cacheResult.rows) {
        const value = row[dimensionColumn];
        uniqueValuesSet.add(value as string | number | null);
      }

      log.debug('Unique values extracted', {
        dataSourceId,
        dimensionColumn,
        uniqueCount: uniqueValuesSet.size,
        uniqueValues: Array.from(uniqueValuesSet).slice(0, 10), // Sample first 10
        component: 'dimension-discovery',
      });

      // Convert to sorted array
      const uniqueValues = Array.from(uniqueValuesSet)
        .filter((v) => v !== undefined) // Filter out undefined
        .sort((a, b) => {
          // Sort nulls last
          if (a === null) return 1;
          if (b === null) return -1;
          // Sort strings/numbers naturally
          if (typeof a === 'string' && typeof b === 'string') {
            return a.localeCompare(b);
          }
          return String(a).localeCompare(String(b));
        })
        .slice(0, validatedLimit); // Apply limit after sorting

      // Transform to dimension values
      const values: DimensionValue[] = uniqueValues.map((value) => ({
        value: value as string | number,
        label: String(value === null ? 'null' : value),
        // recordCount will be populated later in dimension-expansion-renderer
      }));

      const duration = Date.now() - startTime;

      const dimension: ExpansionDimension = {
        columnName: dimensionCol.columnName,
        displayName: dimensionCol.expansionDisplayName || dimensionCol.displayName,
        dataType: dimensionCol.dataType as 'string' | 'integer' | 'boolean',
        dataSourceId: dataSourceId, // Use parameter, not column property
        valueCount: values.length,
      };

      log.info('Dimension values discovered via cache', {
        dataSourceId,
        dimensionColumn,
        valueCount: values.length,
        totalRowsScanned: cacheResult.rows.length,
        cacheHit: cacheResult.cacheHit,
        userId: userContext.user_id,
        duration,
        component: 'dimension-discovery',
      });

      return {
        values,
        dimension,
        totalValues: values.length,
        filtered: true, // Always filtered (by cache RBAC + user filters)
      };
    } catch (error) {
      log.error('Failed to discover dimension values', error as Error, {
        dataSourceId,
        dimensionColumn,
        userId: userContext.user_id,
        component: 'dimension-discovery',
      });
      throw error;
    }
  }

  /**
   * Get expansion dimensions for a data source
   *
   * Helper method to get all expansion dimensions configured for a data source.
   * Uses Redis cache for fast lookups.
   *
   * @param dataSourceId - Data source ID
   * @returns Expansion dimension columns
   */
  async getDataSourceExpansionDimensions(dataSourceId: number): Promise<ExpansionDimension[]> {
    // Get data source configuration from Redis cache
    const { chartConfigService } = await import('@/lib/services/chart-config-service');
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
    
    if (!dataSourceConfig) {
      throw new Error(`Data source configuration not found: ${dataSourceId}`);
    }

    // Filter and map expansion dimension columns from config
    return dataSourceConfig.columns
      .filter((col) => col.isExpansionDimension === true)
      .map((col) => ({
        columnName: col.columnName,
        displayName: col.expansionDisplayName || col.displayName,
        dataType: col.dataType as 'string' | 'integer' | 'boolean',
        dataSourceId: dataSourceId, // Use parameter, not column property
      }));
  }
}

// Export singleton instance
export const dimensionDiscoveryService = new DimensionDiscoveryService();

