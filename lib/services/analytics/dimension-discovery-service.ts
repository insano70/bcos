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
  DimensionValuesResponse,
  ExpansionDimension,
} from '@/lib/types/dimensions';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';
import { dimensionValueCache } from '@/lib/services/analytics/dimension-value-cache';

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
        .sort((a, b) => {
          // Sort by sortOrder (nulls/undefined last)
          const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        })
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

      // NEW: Use optimized dimension value cache with SQL DISTINCT
      // This replaces the old approach of fetching all rows and filtering in-memory
      
      // Extract filter parameters for optimized query
      const startDateFilter = filters.find((f) => f.field === 'date' && f.operator === 'gte');
      const endDateFilter = filters.find((f) => f.field === 'date' && f.operator === 'lte');
      const practiceFilter = filters.find((f) => f.field === 'practice_uid' && f.operator === 'in');
      const measureFilter = filters.find((f) => f.field === 'measure');
      const frequencyFilter = filters.find((f) => f.field === 'frequency' || f.field === 'time_period');
      
      // Build advanced filters (exclude measure, frequency, date, practice_uid - handled separately)
      const advancedFilters = filters.filter(
        (f) => !['date', 'practice_uid', 'measure', 'frequency', 'time_period'].includes(f.field)
      );

      // Validate frequency for measure-based sources
      if (dataSourceConfig.dataSourceType === 'measure-based') {
        if (!frequencyFilter) {
          throw new Error(
            `Measure-based data source requires frequency filter. Got frequency: none`
          );
        }
      }

      // Query dimension values using optimized cache (10-50x faster)
      const queryParams = {
        dataSourceId,
        dimensionColumn,
        limit: validatedLimit,
        ...(measureFilter && { measure: measureFilter.value as string }),
        ...(frequencyFilter && { frequency: frequencyFilter.value as string }),
        ...(startDateFilter && { startDate: startDateFilter.value as string }),
        ...(endDateFilter && { endDate: endDateFilter.value as string }),
        ...(practiceFilter && { practiceUids: practiceFilter.value as number[] }),
        ...(advancedFilters.length > 0 && { advancedFilters }),
      };

      const result = await dimensionValueCache.getDimensionValues(queryParams, userContext);

      const values = result.values;

      const duration = Date.now() - startTime;

      const dimension: ExpansionDimension = {
        columnName: dimensionCol.columnName,
        displayName: dimensionCol.expansionDisplayName || dimensionCol.displayName,
        dataType: dimensionCol.dataType as 'string' | 'integer' | 'boolean',
        dataSourceId: dataSourceId,
        valueCount: values.length,
      };

      log.info('Dimension values discovered via optimized cache', {
        dataSourceId,
        dimensionColumn,
        valueCount: values.length,
        cacheHit: result.fromCache,
        queryTimeMs: result.queryTimeMs,
        optimized: true,
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
      .sort((a, b) => {
        // Sort by sortOrder (nulls/undefined last)
        const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      })
      .map((col) => ({
        columnName: col.columnName,
        displayName: col.expansionDisplayName || col.displayName,
        dataType: col.dataType as 'string' | 'integer' | 'boolean',
        dataSourceId: dataSourceId, // Use parameter, not column property
      }));
  }

  /**
   * Get expansion dimensions with value counts
   *
   * Fetches available expansion dimensions and populates valueCount for each dimension
   * by querying unique dimension values using the provided filters.
   *
   * @param chartDefinitionId - Chart definition ID
   * @param userContext - User context for RBAC
   * @param runtimeFilters - Optional runtime filters from current chart state
   * @returns Available expansion dimensions with value counts
   */
  async getChartExpansionDimensionsWithCounts(
    chartDefinitionId: string,
    userContext: UserContext,
    runtimeFilters?: Record<string, unknown>
  ): Promise<AvailableDimensionsResponse> {
    const startTime = Date.now();

    try {
      // Get base dimensions (without counts)
      const baseResult = await this.getChartExpansionDimensions(chartDefinitionId, userContext);

      // If no dimensions or no filters, return base result
      if (baseResult.dimensions.length === 0 || !runtimeFilters) {
        return baseResult;
      }

      // Convert runtime filters to ChartFilter[]
      const { createFilterBuilderService } = await import('@/lib/services/filters/filter-builder-service');
      const filterBuilder = createFilterBuilderService(userContext);

      const universalFilters: import('@/lib/types/filters').UniversalChartFilters = {};
      if (typeof runtimeFilters.startDate === 'string') universalFilters.startDate = runtimeFilters.startDate;
      if (typeof runtimeFilters.endDate === 'string') universalFilters.endDate = runtimeFilters.endDate;
      if (Array.isArray(runtimeFilters.practiceUids)) universalFilters.practiceUids = runtimeFilters.practiceUids as number[];
      if (typeof runtimeFilters.measure === 'string') universalFilters.measure = runtimeFilters.measure;
      if (typeof runtimeFilters.frequency === 'string') universalFilters.frequency = runtimeFilters.frequency;
      if (Array.isArray(runtimeFilters.advancedFilters)) {
        universalFilters.advancedFilters = runtimeFilters.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
      }

      const filters = filterBuilder.toChartFilterArray(universalFilters);

      // Fetch value counts for each dimension in parallel
      const dimensionsWithCounts = await Promise.all(
        baseResult.dimensions.map(async (dimension) => {
          try {
            const valuesResponse = await this.getDimensionValues(
              dimension.dataSourceId,
              dimension.columnName,
              filters,
              userContext,
              DIMENSION_EXPANSION_LIMITS.MAXIMUM // Use max limit to get accurate total
            );

            return {
              ...dimension,
              valueCount: valuesResponse.totalValues,
            };
          } catch (error) {
            // If value count fetch fails, log and return dimension without count
            log.warn('Failed to fetch value count for dimension', {
              dimensionColumn: dimension.columnName,
              dataSourceId: dimension.dataSourceId,
              error: error instanceof Error ? error.message : String(error),
              component: 'dimension-discovery',
            });
            return dimension;
          }
        })
      );

      // Filter out dimensions with <= 1 value (can't meaningfully expand with only 0 or 1 value)
      // A dimension needs at least 2 unique values to enable comparison
      const expandableDimensions = dimensionsWithCounts.filter((d) => {
        const count = d.valueCount ?? 0;
        return count > 1;
      });

      const filteredOutCount = dimensionsWithCounts.length - expandableDimensions.length;

      const duration = Date.now() - startTime;

      log.info('Chart expansion dimensions fetched with value counts', {
        chartDefinitionId,
        dataSourceId: baseResult.dataSourceId,
        totalDimensions: dimensionsWithCounts.length,
        expandableDimensions: expandableDimensions.length,
        filteredOut: filteredOutCount,
        valueCounts: dimensionsWithCounts.map((d) => ({
          column: d.columnName,
          count: d.valueCount,
          expandable: (d.valueCount ?? 0) > 1,
        })),
        userId: userContext.user_id,
        duration,
        component: 'dimension-discovery',
      });

      return {
        ...baseResult,
        dimensions: expandableDimensions,
      };
    } catch (error) {
      log.error('Failed to get chart expansion dimensions with counts', error as Error, {
        chartDefinitionId,
        userId: userContext.user_id,
        component: 'dimension-discovery',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const dimensionDiscoveryService = new DimensionDiscoveryService();

