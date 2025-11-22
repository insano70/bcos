/**
 * Dimension Expansion Renderer
 *
 * Orchestrates the expansion of a single chart into multiple charts, one for each
 * unique value of a specified dimension column (e.g., expand by payer, provider, location).
 *
 * Architecture:
 * - Focused orchestrator (~390 lines) with error handling and comprehensive logging
 * - Eliminates code duplication by delegating to existing services:
 *   • FilterBuilderService: Filter format conversions
 *   • DimensionChartAdapter: Dimension filter injection
 *   • chartDataOrchestrator: Parallel chart execution (reuses dashboard rendering pattern)
 *
 * Workflow:
 * 1. Extract config from provided finalChartConfig and runtimeFilters
 * 2. Validate dimension metadata
 * 3. Convert filters for dimension discovery (via FilterBuilderService)
 * 4. Fetch unique dimension values with filtering and limit enforcement
 * 5. Create dimension-specific configs (via DimensionChartAdapter)
 * 6. Execute all dimension charts in parallel
 * 7. Aggregate, sort, and return results
 *
 * Responsibilities:
 * - Orchestration of dimension expansion workflow
 * - Security validation (limit clamping, max parallel charts)
 * - Error handling for individual dimension chart failures
 * - Comprehensive logging for observability
 *
 * Single Responsibility: Orchestrate dimension expansion (delegates implementation to services)
 */

import pLimit from 'p-limit';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type {
  DimensionExpandedChart,
  DimensionExpandedChartData,
  DimensionExpansionRequest,
  DimensionValue,
  MultiDimensionExpansionRequest,
  MultiDimensionExpandedChartData,
  DimensionValueCombination,
} from '@/lib/types/dimensions';
import { dimensionDiscoveryService } from './dimension-discovery-service';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import {
  DIMENSION_EXPANSION_LIMITS,
  MAX_PARALLEL_DIMENSION_CHARTS,
  MAX_CONCURRENT_DIMENSION_QUERIES,
} from '@/lib/constants/dimension-expansion';
import { orchestrationResultToBatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import type { ChartExecutionConfig } from '@/lib/services/dashboard-rendering/types';
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import type { UniversalChartFilters } from '@/lib/types/filters';
import { DimensionChartAdapter } from './dimension-chart-adapter';
import {
  generateDimensionCombinations,
  calculateCombinationCount,
} from '@/lib/utils/dimension-combinations';

/**
 * Dimension Expansion Renderer
 *
 * Renders charts expanded by dimension values using existing services.
 */
export class DimensionExpansionRenderer {
  /**
   * Render chart for each dimension value
   *
   * Process:
   * 1. Extract config from provided finalChartConfig and runtimeFilters
   * 2. Get dimension metadata
   * 3. Convert filters for dimension discovery (via FilterBuilderService)
   * 4. Get unique dimension values
   * 5. Create dimension-specific configs (via DimensionChartAdapter)
   * 6. Execute all charts in parallel
   * 7. Aggregate and sort results
   *
   * @param request - Dimension expansion request (requires finalChartConfig + runtimeFilters)
   * @param userContext - User context for RBAC
   * @returns Dimension-expanded chart data
   */
  async renderByDimension(
    request: DimensionExpansionRequest,
    userContext: UserContext
  ): Promise<DimensionExpandedChartData> {
    const startTime = Date.now();

    try {
      const { finalChartConfig, runtimeFilters, dimensionColumn, limit = DIMENSION_EXPANSION_LIMITS.DEFAULT } = request;

      // Validate required parameters
      if (!finalChartConfig || !runtimeFilters) {
        throw new Error('finalChartConfig and runtimeFilters are required');
      }

      // SECURITY: Validate and clamp limit parameter
      const validatedLimit = Math.min(
        Math.max(limit, 1),
        DIMENSION_EXPANSION_LIMITS.MAXIMUM
      );

      // 1. Extract config from provided finalChartConfig
      const dataSourceId = finalChartConfig.dataSourceId as number;

      if (!dataSourceId || dataSourceId <= 0) {
        throw new Error('Invalid dataSourceId in provided finalChartConfig');
      }

      const metadata: { measure?: string; frequency?: string; groupBy?: string } = {};
      if (typeof runtimeFilters.measure === 'string') metadata.measure = runtimeFilters.measure;
      if (typeof runtimeFilters.frequency === 'string') metadata.frequency = runtimeFilters.frequency;
      if (typeof finalChartConfig.groupBy === 'string') metadata.groupBy = finalChartConfig.groupBy;

      const chartConfig: ChartExecutionConfig & { dataSourceId: number } = {
        chartId: 'dimension-expansion',
        chartName: 'Dimension Expansion',
        chartType: (finalChartConfig.chartType as string) || 'bar',
        finalChartConfig,
        runtimeFilters,
        metadata,
        dataSourceId,
      };

      log.info('Using provided configs for dimension expansion', {
        chartType: finalChartConfig.chartType,
        dataSourceId,
        component: 'dimension-expansion',
      });

      // 2. Get dimension metadata
      const dimension = await this.getDimensionMetadata(
        chartConfig.dataSourceId,
        dimensionColumn
      );

      // 3. Convert filters for dimension discovery
      const filterBuilder = createFilterBuilderService(userContext);
      const discoveryFilters = await this.buildDiscoveryFilters(
        chartConfig,
        filterBuilder
      );

      // 4. Get unique dimension values
      const dimensionValues = await this.getDimensionValues(
        chartConfig.dataSourceId,
        dimensionColumn,
        discoveryFilters,
        userContext,
        validatedLimit
      );

      if (dimensionValues.length === 0) {
        return this.buildEmptyResponse(dimension, startTime);
      }

      // 5. Create dimension-specific configs
      const adapter = new DimensionChartAdapter();
      const dimensionConfigs = adapter.createDimensionConfigs(
        dimensionValues,
        chartConfig,
        dimensionColumn
      );

      // 6. Execute all charts in parallel
      const charts = await this.executeAllDimensions(
        dimensionConfigs,
        dimensionValues,
        chartConfig,
        userContext
      );

      // 7. Aggregate results
      return this.aggregateResults(charts, dimension, startTime);
    } catch (error) {
      log.error('Dimension expansion failed', error as Error, {
        request,
        userId: userContext.user_id,
        component: 'dimension-expansion',
      });
      throw error;
    }
  }

  /**
   * Build filters for dimension discovery
   *
   * Uses FilterBuilderService to convert to ChartFilter array.
   *
   * @param chartConfig - Chart execution config
   * @param filterBuilder - Filter builder service instance
   * @returns Chart filter array for dimension discovery
   */
  private async buildDiscoveryFilters(
    chartConfig: ChartExecutionConfig,
    filterBuilder: ReturnType<typeof createFilterBuilderService>
  ): Promise<import('@/lib/types/analytics').ChartFilter[]> {
    const runtimeFilters = chartConfig.runtimeFilters;
    const universalFilters: UniversalChartFilters = {};

    if (typeof runtimeFilters.startDate === 'string') universalFilters.startDate = runtimeFilters.startDate;
    if (typeof runtimeFilters.endDate === 'string') universalFilters.endDate = runtimeFilters.endDate;
    if (Array.isArray(runtimeFilters.practiceUids)) universalFilters.practiceUids = runtimeFilters.practiceUids as number[];

    // Prefer runtime filters over metadata
    if (typeof runtimeFilters.measure === 'string') {
      universalFilters.measure = runtimeFilters.measure;
    } else if (chartConfig.metadata.measure) {
      universalFilters.measure = chartConfig.metadata.measure;
    }

    if (typeof runtimeFilters.frequency === 'string') {
      universalFilters.frequency = runtimeFilters.frequency;
    } else if (chartConfig.metadata.frequency) {
      universalFilters.frequency = chartConfig.metadata.frequency;
    }

    if (Array.isArray(runtimeFilters.advancedFilters)) {
      universalFilters.advancedFilters = runtimeFilters.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
    }

    // Use FilterBuilderService (eliminates 40 lines of duplicate conversion logic!)
    return filterBuilder.toChartFilterArray(universalFilters);
  }

  /**
   * Get dimension metadata
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumn - Dimension column name
   * @returns Dimension metadata
   */
  private async getDimensionMetadata(dataSourceId: number, dimensionColumn: string) {
    const dimensionCols = await dimensionDiscoveryService.getDataSourceExpansionDimensions(dataSourceId);
    const dimension = dimensionCols.find((d) => d.columnName === dimensionColumn);

    if (!dimension) {
      throw new Error(`Dimension not found: ${dimensionColumn} in data source ${dataSourceId}`);
    }

    return dimension;
  }

  /**
   * Get unique dimension values
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumn - Dimension column name
   * @param filters - Chart filters for scoping
   * @param userContext - User context
   * @param limit - Maximum values to return
   * @returns Array of dimension values
   */
  private async getDimensionValues(
    dataSourceId: number,
    dimensionColumn: string,
    filters: import('@/lib/types/analytics').ChartFilter[],
    userContext: UserContext,
    limit: number
  ): Promise<DimensionValue[]> {
    const response = await dimensionDiscoveryService.getDimensionValues(
      dataSourceId,
      dimensionColumn,
      filters,
      userContext,
      limit
    );

    let { values } = response;

    // PERFORMANCE: Enforce maximum parallel chart limit
    if (values.length > MAX_PARALLEL_DIMENSION_CHARTS) {
      log.warn('Dimension values exceed maximum parallel limit, truncating', {
        dimensionColumn,
        requestedCount: values.length,
        maxAllowed: MAX_PARALLEL_DIMENSION_CHARTS,
        userId: userContext.user_id,
        component: 'dimension-expansion',
      });
      values = values.slice(0, MAX_PARALLEL_DIMENSION_CHARTS);
    }

    return values;
  }

  /**
   * Execute charts for all dimension values with concurrency limiting
   *
   * Uses same orchestration pattern as BatchExecutorService with p-limit
   * for concurrency control to prevent database connection pool exhaustion.
   *
   * Max 10 concurrent queries to balance performance and resource usage.
   *
   * @param dimensionConfigs - Dimension-specific chart configs
   * @param dimensionValues - Dimension values (for result mapping)
   * @param baseConfig - Base chart config (for metadata)
   * @param userContext - User context
   * @returns Array of dimension expanded charts
   */
  private async executeAllDimensions(
    dimensionConfigs: ChartExecutionConfig[],
    dimensionValues: DimensionValue[],
    baseConfig: ChartExecutionConfig,
    userContext: UserContext
  ): Promise<DimensionExpandedChart[]> {
    // PERFORMANCE: Limit concurrent queries to prevent database overload
    const limit = pLimit(MAX_CONCURRENT_DIMENSION_QUERIES);

    log.info('Executing dimension expansion with concurrency control', {
      totalDimensions: dimensionConfigs.length,
      maxConcurrent: MAX_CONCURRENT_DIMENSION_QUERIES,
      userId: userContext.user_id,
      component: 'dimension-expansion',
    });

    const chartPromises = dimensionConfigs.map((config, index) =>
      limit(async () => {
        const dimensionValue = dimensionValues[index];
        if (!dimensionValue) {
          throw new Error(`Missing dimension value for index ${index}`);
        }

        const queryStart = Date.now();

        try {
          // Execute chart query using orchestrator (same pattern as BatchExecutorService)
          const result = await chartDataOrchestrator.orchestrate(
            {
              chartConfig: config.finalChartConfig as Record<string, unknown> & {
                chartType: string;
                dataSourceId: number;
              },
              runtimeFilters: config.runtimeFilters,
            },
            userContext
          );

          const queryTime = Date.now() - queryStart;

          // Map to BatchChartData using shared mapper
          const batchChartData = orchestrationResultToBatchChartData(result, {
            ...baseConfig.metadata,
            finalChartConfig: config.finalChartConfig,
            runtimeFilters: config.runtimeFilters,
          });

          const expandedChart: DimensionExpandedChart = {
            dimensionValue: {
              ...dimensionValue,
              recordCount: result.metadata.recordCount,
            },
            chartData: batchChartData,
            metadata: {
              recordCount: result.metadata.recordCount,
              queryTimeMs: queryTime,
              cacheHit: result.metadata.cacheHit,
              transformDuration: 0,
            },
          };

          return expandedChart;
        } catch (error) {
          const queryTime = Date.now() - queryStart;

          log.error('Failed to render chart for dimension value', error as Error, {
            dimensionValue: dimensionValue.value,
            userId: userContext.user_id,
            queryTime,
            component: 'dimension-expansion',
          });

          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          const errorResult: DimensionExpandedChart = {
            dimensionValue,
            chartData: null,
            error: {
              message: 'Failed to load chart data',
              code: 'DIMENSION_CHART_RENDER_FAILED',
              ...(process.env.NODE_ENV === 'development' && { details: errorMessage }),
            },
            metadata: {
              recordCount: 0,
              queryTimeMs: queryTime,
              cacheHit: false,
              transformDuration: 0,
            },
          };

          return errorResult;
        }
      })
    );

    return Promise.all(chartPromises);
  }

  /**
   * Aggregate and sort results
   *
   * @param charts - All dimension expanded charts
   * @param dimension - Dimension metadata
   * @param startTime - Start time for duration calculation
   * @returns Aggregated dimension expansion result
   */
  private aggregateResults(
    charts: DimensionExpandedChart[],
    dimension: import('@/lib/types/dimensions').ExpansionDimension,
    startTime: number
  ): DimensionExpandedChartData {
    const successfulCharts = charts.filter((chart) => !chart.error && chart.metadata.recordCount > 0);
    const errorCharts = charts.filter((chart) => chart.error);
    const zeroRecordCharts = charts.filter((chart) => !chart.error && chart.metadata.recordCount === 0);

    // Sort successful charts by record count (descending), then append errors
    const sortedCharts = [
      ...successfulCharts.sort((a, b) => b.metadata.recordCount - a.metadata.recordCount),
      ...errorCharts,
    ];

    const totalTime = Date.now() - startTime;

    log.info('Dimension expansion completed', {
      dimensionColumn: dimension.columnName,
      dimensionValues: charts.length,
      totalCharts: charts.length,
      successfulCharts: successfulCharts.length,
      errorCharts: errorCharts.length,
      zeroRecordCharts: zeroRecordCharts.length,
      totalQueryTime: totalTime,
      component: 'dimension-expansion',
    });

    return {
      dimension,
      charts: sortedCharts,
      metadata: {
        totalQueryTime: totalTime,
        parallelExecution: true,
        totalCharts: sortedCharts.length,
      },
    };
  }

  /**
   * Build empty response when no dimension values found
   *
   * @param dimension - Dimension metadata
   * @param startTime - Start time
   * @returns Empty dimension expansion result
   */
  private buildEmptyResponse(
    dimension: import('@/lib/types/dimensions').ExpansionDimension,
    startTime: number
  ): DimensionExpandedChartData {
    log.warn('No dimension values found for expansion', {
      dimensionColumn: dimension.columnName,
      component: 'dimension-expansion',
    });

    return {
      dimension,
      charts: [],
      metadata: {
        totalQueryTime: Date.now() - startTime,
        parallelExecution: true,
        totalCharts: 0,
      },
    };
  }

  /**
   * Render chart for each combination of multiple dimension values
   *
   * Extends single-dimension expansion to support cartesian product of
   * multiple dimensions (e.g., Location × Line of Business).
   *
   * Process:
   * 1. Extract config from provided finalChartConfig and runtimeFilters
   * 2. Get metadata for ALL dimensions
   * 3. Convert filters for dimension discovery
   * 4. Fetch unique values for ALL dimensions in parallel
   * 5. Generate cartesian product of dimension values
   * 6. Validate total combination count (max 20 charts)
   * 7. Create dimension-specific configs with multiple filters per chart
   * 8. Execute all charts in parallel
   * 9. Aggregate and sort results
   *
   * @param request - Multi-dimension expansion request
   * @param userContext - User context for RBAC
   * @returns Multi-dimension expanded chart data
   */
  async renderByMultipleDimensions(
    request: MultiDimensionExpansionRequest,
    userContext: UserContext
  ): Promise<MultiDimensionExpandedChartData> {
    const startTime = Date.now();

    try {
      const {
        finalChartConfig,
        runtimeFilters,
        dimensionColumns,
        limit = DIMENSION_EXPANSION_LIMITS.DEFAULT,
        offset = 0,
      } = request;

      // Validate required parameters
      if (!finalChartConfig || !runtimeFilters) {
        throw new Error('finalChartConfig and runtimeFilters are required');
      }

      if (dimensionColumns.length === 0) {
        throw new Error('At least one dimension column required');
      }

      // SECURITY: Validate and clamp limit parameter
      const validatedLimit = Math.min(Math.max(limit, 1), DIMENSION_EXPANSION_LIMITS.MAXIMUM);

      // 1. Extract config from provided finalChartConfig
      const dataSourceId = finalChartConfig.dataSourceId as number;

      if (!dataSourceId || dataSourceId <= 0) {
        throw new Error('Invalid dataSourceId in provided finalChartConfig');
      }

      const metadata: { measure?: string; frequency?: string; groupBy?: string } = {};
      if (typeof runtimeFilters.measure === 'string') metadata.measure = runtimeFilters.measure;
      if (typeof runtimeFilters.frequency === 'string')
        metadata.frequency = runtimeFilters.frequency;
      if (typeof finalChartConfig.groupBy === 'string') metadata.groupBy = finalChartConfig.groupBy;

      const chartConfig: ChartExecutionConfig & { dataSourceId: number } = {
        chartId: 'multi-dimension-expansion',
        chartName: 'Multi-Dimension Expansion',
        chartType: (finalChartConfig.chartType as string) || 'bar',
        finalChartConfig,
        runtimeFilters,
        metadata,
        dataSourceId,
      };

      log.info('Using provided configs for multi-dimension expansion', {
        chartType: finalChartConfig.chartType,
        dataSourceId,
        dimensionCount: dimensionColumns.length,
        dimensions: dimensionColumns,
        component: 'dimension-expansion',
      });

      // 2. Get dimension metadata for ALL dimensions
      const dimensions = await Promise.all(
        dimensionColumns.map((col) => this.getDimensionMetadata(chartConfig.dataSourceId, col))
      );

      // 3. Convert filters for dimension discovery
      const filterBuilder = createFilterBuilderService(userContext);
      const discoveryFilters = await this.buildDiscoveryFilters(chartConfig, filterBuilder);

      // 4. Fetch dimension values for ALL dimensions in parallel
      const dimensionValuesArrays = await Promise.all(
        dimensionColumns.map((col) =>
          this.getDimensionValues(
            chartConfig.dataSourceId,
            col,
            discoveryFilters,
            userContext,
            validatedLimit
          )
        )
      );

      // Build map of column name to dimension values
      const dimensionValuesByColumn: Record<string, DimensionValue[]> = {};
      for (let i = 0; i < dimensionColumns.length; i++) {
        const col = dimensionColumns[i];
        const values = dimensionValuesArrays[i];
        if (col && values) {
          dimensionValuesByColumn[col] = values;
        }
      }

      // Check if any dimension has no values
      const emptyDimensions = dimensionColumns.filter(
        (col) => !dimensionValuesByColumn[col] || dimensionValuesByColumn[col].length === 0
      );

      if (emptyDimensions.length > 0) {
        log.warn('Some dimensions have no values', {
          emptyDimensions,
          allDimensions: dimensionColumns,
          component: 'dimension-expansion',
        });

        return {
          dimensions,
          charts: [],
          metadata: {
            totalQueryTime: Date.now() - startTime,
            parallelExecution: true,
            totalCharts: 0,
            dimensionCounts: Object.fromEntries(
              dimensionColumns.map((col) => [col, dimensionValuesByColumn[col]?.length || 0])
            ),
          },
        };
      }

      // 5. Calculate and validate combination count
      const totalCombinations = calculateCombinationCount(dimensionValuesByColumn);

      // 6. Generate cartesian product (all combinations)
      const allCombinations = generateDimensionCombinations(dimensionValuesByColumn);

      // 7. Sort combinations by estimated record count (descending)
      const sortedCombinations = allCombinations.sort((a, b) => {
        const countA = a.recordCount ?? 0;
        const countB = b.recordCount ?? 0;
        return countB - countA;
      });

      // 8. LAZY LOADING: Paginate BEFORE executing queries (only execute visible page)
      const paginatedCombinations = sortedCombinations.slice(offset, offset + limit);
      const hasMore = offset + limit < sortedCombinations.length;

      log.info('Generated and paginated dimension combinations', {
        totalCombinations: sortedCombinations.length,
        offset,
        limit,
        returned: paginatedCombinations.length,
        hasMore,
        dimensions: dimensionColumns,
        dimensionCounts: Object.fromEntries(
          dimensionColumns.map((col) => [col, dimensionValuesByColumn[col]?.length || 0])
        ),
        component: 'dimension-expansion',
      });

      // 9. Create dimension-specific configs for paginated combinations only
      const adapter = new DimensionChartAdapter();
      const dimensionConfigs = adapter.createMultiDimensionConfigs(paginatedCombinations, chartConfig);

      // 10. Execute only the paginated charts (LAZY: not all combinations)
      const charts = await this.executeAllDimensionCombinations(
        dimensionConfigs,
        paginatedCombinations,
        chartConfig,
        userContext
      );

      // 11. Aggregate results with pagination metadata
      return this.aggregateMultiDimensionResults(
        charts,
        dimensions,
        dimensionColumns,
        dimensionValuesByColumn,
        startTime,
        sortedCombinations.length,
        offset,
        limit,
        hasMore
      );
    } catch (error) {
      log.error('Multi-dimension expansion failed', error as Error, {
        request,
        userId: userContext.user_id,
        component: 'dimension-expansion',
      });
      throw error;
    }
  }

  /**
   * Execute charts for all dimension value combinations
   *
   * Similar to executeAllDimensions but uses DimensionValueCombination instead of DimensionValue.
   *
   * @param dimensionConfigs - Dimension-specific chart configs
   * @param combinations - Dimension value combinations (for result mapping)
   * @param baseConfig - Base chart config (for metadata)
   * @param userContext - User context
   * @returns Array of dimension expanded charts
   */
  private async executeAllDimensionCombinations(
    dimensionConfigs: ChartExecutionConfig[],
    combinations: DimensionValueCombination[],
    baseConfig: ChartExecutionConfig,
    userContext: UserContext
  ): Promise<DimensionExpandedChart[]> {
    // PERFORMANCE: Limit concurrent queries to prevent database overload
    const limit = pLimit(MAX_CONCURRENT_DIMENSION_QUERIES);

    log.info('Executing multi-dimension expansion with concurrency control', {
      totalCombinations: dimensionConfigs.length,
      maxConcurrent: MAX_CONCURRENT_DIMENSION_QUERIES,
      userId: userContext.user_id,
      component: 'dimension-expansion',
    });

    const chartPromises = dimensionConfigs.map((config, index) =>
      limit(async () => {
        const combination = combinations[index];
        if (!combination) {
          throw new Error(`Missing combination for index ${index}`);
        }

        const queryStart = Date.now();

        try {
          // Execute chart query using orchestrator
          const result = await chartDataOrchestrator.orchestrate(
            {
              chartConfig: config.finalChartConfig as Record<string, unknown> & {
                chartType: string;
                dataSourceId: number;
              },
              runtimeFilters: config.runtimeFilters,
            },
            userContext
          );

          const queryTime = Date.now() - queryStart;

          // Map to BatchChartData using shared mapper
          const batchChartData = orchestrationResultToBatchChartData(result, {
            ...baseConfig.metadata,
            finalChartConfig: config.finalChartConfig,
            runtimeFilters: config.runtimeFilters,
          });

          const expandedChart: DimensionExpandedChart = {
            dimensionValue: {
              ...combination,
              recordCount: result.metadata.recordCount,
            },
            chartData: batchChartData,
            metadata: {
              recordCount: result.metadata.recordCount,
              queryTimeMs: queryTime,
              cacheHit: result.metadata.cacheHit,
              transformDuration: 0,
            },
          };

          return expandedChart;
        } catch (error) {
          const queryTime = Date.now() - queryStart;

          log.error('Failed to render chart for dimension combination', error as Error, {
            combination: combination.label,
            userId: userContext.user_id,
            queryTime,
            component: 'dimension-expansion',
          });

          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

          const errorResult: DimensionExpandedChart = {
            dimensionValue: combination,
            chartData: null,
            error: {
              message: 'Failed to load chart data',
              code: 'DIMENSION_CHART_RENDER_FAILED',
              ...(process.env.NODE_ENV === 'development' && { details: errorMessage }),
            },
            metadata: {
              recordCount: 0,
              queryTimeMs: queryTime,
              cacheHit: false,
              transformDuration: 0,
            },
          };

          return errorResult;
        }
      })
    );

    return Promise.all(chartPromises);
  }

  /**
   * Aggregate and sort multi-dimension results
   *
   * @param charts - All dimension expanded charts
   * @param dimensions - All dimensions used for expansion
   * @param dimensionColumns - Dimension column names
   * @param dimensionValuesByColumn - Value count per dimension
   * @param startTime - Start time for duration calculation
   * @param totalCombinations - Total combinations before pagination
   * @param offset - Current pagination offset
   * @param limit - Current page size
   * @param hasMore - Whether more charts available
   * @returns Aggregated multi-dimension expansion result
   */
  private aggregateMultiDimensionResults(
    charts: DimensionExpandedChart[],
    dimensions: import('@/lib/types/dimensions').ExpansionDimension[],
    dimensionColumns: string[],
    dimensionValuesByColumn: Record<string, DimensionValue[]>,
    startTime: number,
    totalCombinations: number,
    offset: number,
    limit: number,
    hasMore: boolean
  ): MultiDimensionExpandedChartData {
    const successfulCharts = charts.filter((chart) => !chart.error && chart.metadata.recordCount > 0);
    const errorCharts = charts.filter((chart) => chart.error);
    const zeroRecordCharts = charts.filter(
      (chart) => !chart.error && chart.metadata.recordCount === 0
    );

    // Sort successful charts by record count (descending), then append errors
    const sortedCharts = [
      ...successfulCharts.sort((a, b) => b.metadata.recordCount - a.metadata.recordCount),
      ...errorCharts,
    ];

    const totalTime = Date.now() - startTime;

    log.info('Multi-dimension expansion completed', {
      dimensions: dimensionColumns,
      totalCombinations,
      offset,
      limit,
      returned: charts.length,
      hasMore,
      totalCharts: charts.length,
      successfulCharts: successfulCharts.length,
      errorCharts: errorCharts.length,
      zeroRecordCharts: zeroRecordCharts.length,
      totalQueryTime: totalTime,
      component: 'dimension-expansion',
    });

    return {
      dimensions,
      charts: sortedCharts,
      metadata: {
        totalQueryTime: totalTime,
        parallelExecution: true,
        totalCharts: sortedCharts.length,
        dimensionCounts: Object.fromEntries(
          dimensionColumns.map((col) => [col, dimensionValuesByColumn[col]?.length || 0])
        ),
        totalCombinations,
        offset,
        limit,
        hasMore,
      },
    };
  }
}

// Export singleton instance
export const dimensionExpansionRenderer = new DimensionExpansionRenderer();
