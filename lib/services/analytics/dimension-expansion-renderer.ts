/**
 * Dimension Expansion Renderer
 *
 * Orchestrates the expansion of a single chart into multiple charts, one for each
 * unique value of a specified dimension column (e.g., expand by payer, provider, location).
 *
 * Architecture:
 * - Comprehensive orchestrator (548 lines) with error handling, logging, and backward compatibility
 * - Eliminated ~400 lines of duplicate code by delegating to existing services:
 *   • ChartConfigBuilderService: Config resolution and building (was 170 lines of duplication)
 *   • FilterBuilderService: Filter format conversions (was 40 lines of duplication)
 *   • DimensionChartAdapter: Dimension filter injection (was 107 lines of inline logic)
 *   • chartDataOrchestrator: Parallel chart execution (reuses dashboard rendering pattern)
 *
 * Workflow:
 * 1. Resolve chart configuration (supports simple + legacy paths)
 * 2. Validate dimension metadata
 * 3. Fetch unique dimension values with filtering and limit enforcement
 * 4. Create dimension-specific configs via adapter
 * 5. Execute all dimension charts in parallel
 * 6. Aggregate, sort, and return results
 *
 * Responsibilities:
 * - Orchestration of dimension expansion workflow
 * - Security validation (limit clamping, max parallel charts)
 * - Error handling for individual dimension chart failures
 * - Comprehensive logging for observability
 * - Backward compatibility with legacy API paths
 *
 * Single Responsibility: Orchestrate dimension expansion (delegates implementation to services)
 */

import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type {
  DimensionExpandedChart,
  DimensionExpandedChartData,
  DimensionExpansionRequest,
  DimensionValue,
} from '@/lib/types/dimensions';
import { dimensionDiscoveryService } from './dimension-discovery-service';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import {
  DIMENSION_EXPANSION_LIMITS,
  MAX_PARALLEL_DIMENSION_CHARTS,
} from '@/lib/constants/dimension-expansion';
import { orchestrationResultToBatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import { ChartConfigBuilderService } from '@/lib/services/dashboard-rendering/chart-config-builder';
import type { ChartExecutionConfig, ResolvedFilters } from '@/lib/services/dashboard-rendering/types';
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import type { UniversalChartFilters } from '@/lib/types/filters';
import { DimensionChartAdapter } from './dimension-chart-adapter';

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
   * 1. Resolve chart config (via ChartConfigBuilderService)
   * 2. Get dimension metadata
   * 3. Convert filters for dimension discovery (via FilterBuilderService)
   * 4. Get unique dimension values
   * 5. Create dimension-specific configs (via DimensionChartAdapter)
   * 6. Execute all charts in parallel
   * 7. Aggregate and sort results
   *
   * @param request - Dimension expansion request
   * @param userContext - User context for RBAC
   * @returns Dimension-expanded chart data
   */
  async renderByDimension(
    request: DimensionExpansionRequest,
    userContext: UserContext
  ): Promise<DimensionExpandedChartData> {
    const startTime = Date.now();

    try {
      const { finalChartConfig, runtimeFilters, chartDefinitionId, dimensionColumn, baseFilters, limit = DIMENSION_EXPANSION_LIMITS.DEFAULT } = request;

      // SECURITY: Validate and clamp limit parameter
      const validatedLimit = Math.min(
        Math.max(limit, 1),
        DIMENSION_EXPANSION_LIMITS.MAXIMUM
      );

      // 1. Resolve chart execution config
      const chartConfig = await this.resolveChartConfig(
        chartDefinitionId,
        finalChartConfig,
        runtimeFilters,
        baseFilters,
        userContext
      );

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
   * Resolve chart execution config
   *
   * Uses ChartConfigBuilderService to eliminate duplicate config logic.
   *
   * @param chartDefinitionId - Chart definition ID (legacy path)
   * @param finalChartConfig - Provided chart config (simple path)
   * @param runtimeFilters - Provided runtime filters (simple path)
   * @param baseFilters - Base filters for legacy path
   * @param userContext - User context
   * @returns Resolved chart execution config with dataSourceId
   */
  private async resolveChartConfig(
    chartDefinitionId: string | undefined,
    finalChartConfig: Record<string, unknown> | undefined,
    runtimeFilters: Record<string, unknown> | undefined,
    baseFilters: Record<string, unknown> | undefined,
    userContext: UserContext
  ): Promise<ChartExecutionConfig & { dataSourceId: number }> {
    // Simple path: Use provided configs (already built by dashboard rendering)
    if (finalChartConfig && runtimeFilters) {
      const dataSourceId = finalChartConfig.dataSourceId as number;

      if (!dataSourceId || dataSourceId <= 0) {
        throw new Error('Invalid dataSourceId in provided finalChartConfig');
      }

      const metadata: { measure?: string; frequency?: string; groupBy?: string } = {};
      if (typeof runtimeFilters.measure === 'string') metadata.measure = runtimeFilters.measure;
      if (typeof runtimeFilters.frequency === 'string') metadata.frequency = runtimeFilters.frequency;
      if (typeof finalChartConfig.groupBy === 'string') metadata.groupBy = finalChartConfig.groupBy;

      log.info('Using provided configs (simple reuse path)', {
        chartType: finalChartConfig.chartType,
        dataSourceId,
        optimized: true,
        component: 'dimension-expansion',
      });

      return {
        chartId: chartDefinitionId || 'unknown',
        chartName: 'Dimension Expansion',
        chartType: (finalChartConfig.chartType as string) || 'bar',
        finalChartConfig,
        runtimeFilters,
        metadata,
        dataSourceId,
      };
    }

    // Legacy path: Fetch and build config using ChartConfigBuilderService
    if (!chartDefinitionId) {
      throw new Error('Either (finalChartConfig + runtimeFilters) or chartDefinitionId must be provided');
    }

    log.info('Fetching chart metadata (legacy path)', {
      chartDefinitionId,
      optimized: false,
      component: 'dimension-expansion',
    });

    const chartsService = createRBACChartsService(userContext);
    const chartDef = await chartsService.getChartById(chartDefinitionId);

    const dataSourceId = chartDef?.data_source_id || 0;

    if (!chartDef || dataSourceId === 0) {
      throw new Error(`Chart definition not found or missing data_source_id: ${chartDefinitionId}`);
    }

    // Build universal filters from baseFilters
    const filterBuilder = createFilterBuilderService(userContext);
    const universalFilters = this.buildUniversalFilters(baseFilters || {});

    // Build execution filters with organization resolution
    const executionFilters = await filterBuilder.buildExecutionFilters(
      universalFilters,
      { component: 'dimension-expansion' }
    );

    // Convert to ResolvedFilters format
    const resolvedFilters: ResolvedFilters = {
      ...baseFilters,
      startDate: executionFilters.dateRange.startDate,
      endDate: executionFilters.dateRange.endDate,
      practiceUids: executionFilters.practiceUids,
      ...(executionFilters.measure && { measure: executionFilters.measure }),
      ...(executionFilters.frequency && { frequency: executionFilters.frequency }),
      ...(executionFilters.providerName && { providerName: executionFilters.providerName }),
    };

    // Use ChartConfigBuilderService (eliminates 170 lines of duplicate logic!)
    const configBuilder = new ChartConfigBuilderService();
    const chartConfig = configBuilder.buildSingleChartConfig(chartDef, resolvedFilters);

    log.info('Chart configuration built for dimension expansion (legacy path)', {
      chartDefinitionId,
      dataSourceId,
      chartType: chartDef.chart_type,
      practiceUidCount: executionFilters.practiceUids.length,
      component: 'dimension-expansion',
    });

    return { ...chartConfig, dataSourceId };
  }

  /**
   * Build universal filters from base filters object
   *
   * @param baseFilters - Base filters from request
   * @returns Universal chart filters
   */
  private buildUniversalFilters(baseFilters: Record<string, unknown>): UniversalChartFilters {
    const universalFilters: UniversalChartFilters = {};

    if (typeof baseFilters.startDate === 'string') universalFilters.startDate = baseFilters.startDate;
    if (typeof baseFilters.endDate === 'string') universalFilters.endDate = baseFilters.endDate;
    if (typeof baseFilters.organizationId === 'string') universalFilters.organizationId = baseFilters.organizationId;
    if (Array.isArray(baseFilters.practiceUids)) universalFilters.practiceUids = baseFilters.practiceUids as number[];
    if (typeof baseFilters.dateRangePreset === 'string') universalFilters.dateRangePreset = baseFilters.dateRangePreset;
    if (typeof baseFilters.providerName === 'string') universalFilters.providerName = baseFilters.providerName;
    if (typeof baseFilters.measure === 'string') universalFilters.measure = baseFilters.measure;
    if (typeof baseFilters.frequency === 'string') universalFilters.frequency = baseFilters.frequency;
    if (Array.isArray(baseFilters.advancedFilters)) {
      universalFilters.advancedFilters = baseFilters.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
    }

    return universalFilters;
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
   * Execute charts for all dimension values in parallel
   *
   * Uses same orchestration pattern as BatchExecutorService.
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
    const chartPromises = dimensionConfigs.map(async (config, index) => {
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
    });

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
}

// Export singleton instance
export const dimensionExpansionRenderer = new DimensionExpansionRenderer();
