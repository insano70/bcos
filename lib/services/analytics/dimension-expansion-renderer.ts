/**
 * Dimension Expansion Renderer
 *
 * Handles rendering charts across multiple dimension values.
 * Executes parallel queries for each dimension value and returns
 * side-by-side chart data for comparison.
 *
 * Key Responsibilities:
 * - Fetch unique dimension values
 * - Render chart for each dimension value in parallel
 * - Apply dimension filter to each query
 * - Aggregate results with metadata
 */

import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type {
  DimensionExpandedChart,
  DimensionExpandedChartData,
  DimensionExpansionRequest,
} from '@/lib/types/dimensions';
import { dimensionDiscoveryService } from './dimension-discovery-service';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { 
  DIMENSION_EXPANSION_LIMITS, 
  MAX_PARALLEL_DIMENSION_CHARTS 
} from '@/lib/constants/dimension-expansion';
import { orchestrationResultToBatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import { ChartConfigBuilderService } from '@/lib/services/dashboard-rendering/chart-config-builder';
import type { ResolvedFilters } from '@/lib/services/dashboard-rendering/types';
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import { createFilterPipeline } from '@/lib/services/filters/filter-pipeline';
import type { UniversalChartFilters } from '@/lib/types/filters';

/**
 * Dimension Expansion Renderer
 *
 * Renders charts expanded by dimension values
 */
export class DimensionExpansionRenderer {
  /**
   * Render chart for each dimension value
   *
   * Process:
   * 1. Get unique dimension values
   * 2. For each value, build chart config with dimension filter
   * 3. Execute all chart queries in parallel
   * 4. Transform and aggregate results
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
      const { finalChartConfig: providedConfig, runtimeFilters: providedFilters, chartDefinitionId, dimensionColumn, baseFilters, limit = DIMENSION_EXPANSION_LIMITS.DEFAULT } = request;

      // SECURITY: Validate and clamp limit parameter
      const validatedLimit = Math.min(
        Math.max(limit, 1),
        DIMENSION_EXPANSION_LIMITS.MAXIMUM
      );

      let chartExecutionConfig: import('@/lib/services/dashboard-rendering/types').ChartExecutionConfig;
      let dataSourceId: number;

      // SIMPLE PATH: Use provided configs directly (no fetching, no rebuilding!)
      if (providedConfig && providedFilters) {
        log.info('Using provided configs (simple reuse path)', {
          chartType: providedConfig.chartType,
          hasMultipleSeries: !!providedConfig.multipleSeries,
          hasDualAxisConfig: !!providedConfig.dualAxisConfig,
          optimized: true,
          component: 'dimension-expansion',
        });

        // Just use what was provided - it's already correct!
          const metadata: {
            measure?: string;
            frequency?: string;
            groupBy?: string;
          } = {};
          if (typeof providedFilters.measure === 'string') metadata.measure = providedFilters.measure;
          if (typeof providedFilters.frequency === 'string') metadata.frequency = providedFilters.frequency;
          if (typeof providedConfig.groupBy === 'string') metadata.groupBy = providedConfig.groupBy;

          chartExecutionConfig = {
          chartId: chartDefinitionId || 'unknown',
          chartName: 'Dimension Expansion',
          chartType: (providedConfig.chartType as string) || 'bar',
          finalChartConfig: providedConfig,        // Use AS-IS!
          runtimeFilters: providedFilters,         // Use AS-IS!
          metadata,
        };
        
        dataSourceId = providedConfig.dataSourceId as number;

        if (!dataSourceId || dataSourceId <= 0) {
          throw new Error('Invalid dataSourceId in provided finalChartConfig');
        }

        // Check if runtime filters still need resolution (shouldn't, but handle it)
        const runtimeFilters = chartExecutionConfig.runtimeFilters;
        
        const hasUnresolvedFilters = 
          !!runtimeFilters.dateRangePreset || 
          !!runtimeFilters.organizationId;

        if (hasUnresolvedFilters) {
          log.debug('Resolving unresolved filters in optimized path', {
            chartId: providedConfig.chartId,
            hasDatePreset: !!runtimeFilters.dateRangePreset,
            hasOrgId: !!runtimeFilters.organizationId,
            component: 'dimension-expansion',
          });

          try {
            // Use FilterPipeline to resolve
            const pipeline = createFilterPipeline(userContext);
            const resolved = await pipeline.process(runtimeFilters, {
              component: 'dimension-expansion',
              dataSourceId,
              enableOrgResolution: true,
            });

            // Update chartExecutionConfig with RESOLVED filters
            chartExecutionConfig = {
              ...chartExecutionConfig,
              runtimeFilters: {
                ...resolved.runtimeFilters,
                // Preserve measure and frequency from original
                measure: runtimeFilters.measure || chartExecutionConfig.metadata.measure,
                frequency: runtimeFilters.frequency || chartExecutionConfig.metadata.frequency,
              },
            };

            log.debug('Filters resolved successfully', {
              chartId: providedConfig.chartId,
              hasStartDate: !!chartExecutionConfig.runtimeFilters.startDate,
              hasEndDate: !!chartExecutionConfig.runtimeFilters.endDate,
              hasPracticeUids: !!chartExecutionConfig.runtimeFilters.practiceUids,
              component: 'dimension-expansion',
            });
          } catch (error) {
            log.error('Filter resolution failed, using filters as-is', error as Error, {
              chartId: providedConfig.chartId,
              component: 'dimension-expansion',
            });
            // Continue with unresolved filters (may return 0 results but won't crash)
          }
        }
      }
      // LEGACY PATH: Fetch metadata (backwards compatible)
      else if (chartDefinitionId) {
        log.info('Fetching chart metadata (legacy path)', {
          chartDefinitionId,
          optimized: false,
          component: 'dimension-expansion',
        });

        // Get chart definition with full data_source config
        const chartsService = createRBACChartsService(userContext);
        const chartDef = await chartsService.getChartById(chartDefinitionId);
        
        // Get data_source_id from the denormalized integer column
        dataSourceId = chartDef?.data_source_id || 0;

        if (!chartDef || dataSourceId === 0) {
          throw new Error(`Chart definition not found or missing data_source_id: ${chartDefinitionId}`);
        }

        // CRITICAL: Resolve organizationId to practiceUids BEFORE querying dimension values
        const filterBuilderService = createFilterBuilderService(userContext);
        
        // Build universal filters from baseFilters (only include defined properties)
        const universalFilters: UniversalChartFilters = {};
        
        if (typeof baseFilters?.startDate === 'string') {
          universalFilters.startDate = baseFilters.startDate;
        }
        if (typeof baseFilters?.endDate === 'string') {
          universalFilters.endDate = baseFilters.endDate;
        }
        if (typeof baseFilters?.organizationId === 'string') {
          universalFilters.organizationId = baseFilters.organizationId;
        }
        if (Array.isArray(baseFilters?.practiceUids)) {
          universalFilters.practiceUids = baseFilters.practiceUids as number[];
        }
        if (typeof baseFilters?.dateRangePreset === 'string') {
          universalFilters.dateRangePreset = baseFilters.dateRangePreset;
        }
        if (typeof baseFilters?.providerName === 'string') {
          universalFilters.providerName = baseFilters.providerName;
        }
        if (typeof baseFilters?.measure === 'string') {
          universalFilters.measure = baseFilters.measure;
        }
        if (typeof baseFilters?.frequency === 'string') {
          universalFilters.frequency = baseFilters.frequency;
        }
        if (Array.isArray(baseFilters?.advancedFilters)) {
          universalFilters.advancedFilters = baseFilters.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
        }
        
        // Build execution filters with type-safe organization resolution
        const executionFilters = await filterBuilderService.buildExecutionFilters(
          universalFilters,
          { component: 'dimension-expansion' }
        );
        
        // Convert to ResolvedFilters format for ChartConfigBuilderService
        const resolvedFilters: ResolvedFilters = {
          ...baseFilters, // Preserve all original properties (dateRangePreset, etc.)
          startDate: executionFilters.dateRange.startDate,
          endDate: executionFilters.dateRange.endDate,
          practiceUids: executionFilters.practiceUids,
          ...(executionFilters.measure && { measure: executionFilters.measure }),
          ...(executionFilters.frequency && { frequency: executionFilters.frequency }),
          ...(executionFilters.providerName && { providerName: executionFilters.providerName }),
        };

        // Use ChartConfigBuilderService to extract and normalize chart configuration
        const configBuilder = new ChartConfigBuilderService();
        chartExecutionConfig = configBuilder.buildSingleChartConfig(chartDef, resolvedFilters);

        log.info('Chart configuration built for dimension expansion (legacy path)', {
          chartDefinitionId,
          dataSourceId,
          chartType: chartDef.chart_type,
          hasRuntimeFilters: Object.keys(chartExecutionConfig.runtimeFilters).length > 0,
          hasMeasure: !!chartExecutionConfig.metadata.measure,
          hasFrequency: !!chartExecutionConfig.metadata.frequency,
          hasGroupBy: !!chartExecutionConfig.metadata.groupBy,
          practiceUidCount: executionFilters.practiceUids.length,
          component: 'dimension-expansion',
        });
      } else {
        throw new Error('Either chartExecutionConfig or chartDefinitionId must be provided');
      }

      // Get dimension metadata (still needed for dimension info)
      const dimensionCol = await dimensionDiscoveryService.getDataSourceExpansionDimensions(
        dataSourceId
      );
      const dimension = dimensionCol.find((d) => d.columnName === dimensionColumn);

      if (!dimension) {
        throw new Error(
          `Dimension not found: ${dimensionColumn} in data source ${dataSourceId}`
        );
      }

      // Convert filters to ChartFilter array for dimension discovery
      // Extract from runtime filters (works for both optimized and legacy paths)
      const runtimeFilters = chartExecutionConfig.runtimeFilters;
      
      log.debug('Building filters for dimension discovery', {
        chartId: chartExecutionConfig.chartId,
        chartType: chartExecutionConfig.chartType,
        hasRuntimeMeasure: !!runtimeFilters.measure,
        hasRuntimeFrequency: !!runtimeFilters.frequency,
        hasMetadataMeasure: !!chartExecutionConfig.metadata.measure,
        hasMetadataFrequency: !!chartExecutionConfig.metadata.frequency,
        component: 'dimension-expansion',
      });
      
      const filtersForDimensionDiscovery: UniversalChartFilters = {};
      
      if (typeof runtimeFilters.startDate === 'string') {
        filtersForDimensionDiscovery.startDate = runtimeFilters.startDate;
      }
      if (typeof runtimeFilters.endDate === 'string') {
        filtersForDimensionDiscovery.endDate = runtimeFilters.endDate;
      }
      if (Array.isArray(runtimeFilters.practiceUids)) {
        filtersForDimensionDiscovery.practiceUids = runtimeFilters.practiceUids as number[];
      }
      
      // For measure: prefer runtime filters over metadata (dual-axis charts may not have metadata.measure)
      if (typeof runtimeFilters.measure === 'string') {
        filtersForDimensionDiscovery.measure = runtimeFilters.measure;
      } else if (chartExecutionConfig.metadata.measure) {
        filtersForDimensionDiscovery.measure = chartExecutionConfig.metadata.measure;
      }
      
      // For frequency: prefer runtime filters over metadata
      if (typeof runtimeFilters.frequency === 'string') {
        filtersForDimensionDiscovery.frequency = runtimeFilters.frequency;
      } else if (chartExecutionConfig.metadata.frequency) {
        filtersForDimensionDiscovery.frequency = chartExecutionConfig.metadata.frequency;
      }
      
      if (Array.isArray(runtimeFilters.advancedFilters)) {
        filtersForDimensionDiscovery.advancedFilters = runtimeFilters.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
      }
      
      log.debug('Filters built for dimension discovery', {
        hasMeasure: !!filtersForDimensionDiscovery.measure,
        hasFrequency: !!filtersForDimensionDiscovery.frequency,
        component: 'dimension-expansion',
      });
      
      // TYPE-SAFE: No casting, uses proper filter builder service
      const filterBuilderService = createFilterBuilderService(userContext);
      const chartFilters = filterBuilderService.toChartFilterArray(filtersForDimensionDiscovery);
      
      log.debug('ChartFilter array built', {
        filterCount: chartFilters.length,
        component: 'dimension-expansion',
      });

    // Get unique dimension values (with filters applied)
      const dimensionValuesResponse = await dimensionDiscoveryService.getDimensionValues(
        dataSourceId,
        dimensionColumn,
        chartFilters,
        userContext,
        validatedLimit
      );

      let { values } = dimensionValuesResponse;

      // PERFORMANCE: Enforce maximum parallel chart limit to prevent server overload
      if (values.length > MAX_PARALLEL_DIMENSION_CHARTS) {
        log.warn('Dimension values exceed maximum parallel limit, truncating', {
          chartDefinitionId,
          dimensionColumn,
          requestedCount: values.length,
          maxAllowed: MAX_PARALLEL_DIMENSION_CHARTS,
          userId: userContext.user_id,
          component: 'dimension-expansion',
        });
        values = values.slice(0, MAX_PARALLEL_DIMENSION_CHARTS);
      }

      if (values.length === 0) {
        log.warn('No dimension values found for expansion', {
          chartDefinitionId,
          dimensionColumn,
          userId: userContext.user_id,
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

      // Render chart for each dimension value in parallel
      const chartPromises = values.map(async (dimensionValue) => {
        const queryStart = Date.now();

        try {
          // Use the already-built chart configuration from ChartConfigBuilderService
          // Add dimension-specific filter to the runtime filters
          const dimensionRuntimeFilters: Record<string, unknown> = {
            ...chartExecutionConfig.runtimeFilters,
            // Add dimension filter to existing advancedFilters
            advancedFilters: [
              ...(Array.isArray(chartExecutionConfig.runtimeFilters.advancedFilters) 
                ? chartExecutionConfig.runtimeFilters.advancedFilters 
                : []),
              {
                field: dimensionColumn,
                operator: 'eq' as const,
                value: dimensionValue.value,
              },
            ],
          };

          log.debug('Dimension expansion runtime filters', {
            chartDefinitionId,
            dimensionValue: dimensionValue.value,
            hasStartDate: !!dimensionRuntimeFilters.startDate,
            hasEndDate: !!dimensionRuntimeFilters.endDate,
            startDate: dimensionRuntimeFilters.startDate,
            endDate: dimensionRuntimeFilters.endDate,
            hasFrequency: !!dimensionRuntimeFilters.frequency,
            frequency: dimensionRuntimeFilters.frequency,
            component: 'dimension-expansion',
          });

          // Execute chart query using orchestrator (matching batch executor pattern)
          const result = await chartDataOrchestrator.orchestrate(
            {
              chartConfig: chartExecutionConfig.finalChartConfig as Record<string, unknown> & {
                chartType: string;
                dataSourceId: number;
              },
              runtimeFilters: dimensionRuntimeFilters,
            },
            userContext
          );

          const queryTime = Date.now() - queryStart;

          // Map OrchestrationResult to BatchChartData using shared mapper
          const batchChartData = orchestrationResultToBatchChartData(result, {
            ...chartExecutionConfig.metadata,
            finalChartConfig: chartExecutionConfig.finalChartConfig,
            runtimeFilters: dimensionRuntimeFilters,  // Include the dimension-specific filters
          });

          // Update dimensionValue.recordCount with actual filtered count
          const actualRecordCount = result.metadata.recordCount;
          const updatedDimensionValue = {
            ...dimensionValue,
            recordCount: actualRecordCount,
          };

          const expandedChart: DimensionExpandedChart = {
            dimensionValue: updatedDimensionValue,
            chartData: batchChartData,
            metadata: {
              recordCount: actualRecordCount,
              queryTimeMs: queryTime,
              cacheHit: result.metadata.cacheHit,
              transformDuration: 0,
            },
          };

          return expandedChart;
        } catch (error) {
          const queryTime = Date.now() - queryStart;
          
          log.error('Failed to render chart for dimension value', error as Error, {
            chartDefinitionId,
            dimensionColumn,
            dimensionValue: dimensionValue.value,
            userId: userContext.user_id,
            queryTime,
            component: 'dimension-expansion',
          });

          // Return error state instead of empty chart (proper error handling)
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

      // Execute all in parallel
      const allCharts = await Promise.all(chartPromises);

      // Separate successful charts from errors
      const successfulCharts = allCharts.filter((chart) => !chart.error && chart.metadata.recordCount > 0);
      const errorCharts = allCharts.filter((chart) => chart.error);
      const zeroRecordCharts = allCharts.filter((chart) => !chart.error && chart.metadata.recordCount === 0);

      // Sort successful charts by record count (descending), then append error charts
      const charts = [
        ...successfulCharts.sort((a, b) => b.metadata.recordCount - a.metadata.recordCount),
        ...errorCharts, // Include error charts so UI can display them
      ];

      const totalTime = Date.now() - startTime;

      log.info('Dimension expansion completed', {
        chartDefinitionId,
        dimensionColumn,
        dimensionValues: values.length,
        totalCharts: allCharts.length,
        successfulCharts: successfulCharts.length,
        errorCharts: errorCharts.length,
        zeroRecordCharts: zeroRecordCharts.length,
        totalQueryTime: totalTime,
        userId: userContext.user_id,
        component: 'dimension-expansion',
      });

      return {
        dimension,
        charts,
        metadata: {
          totalQueryTime: totalTime,
          parallelExecution: true,
          totalCharts: charts.length,
        },
      };
    } catch (error) {
      log.error('Dimension expansion failed', error as Error, {
        request,
        userId: userContext.user_id,
        component: 'dimension-expansion',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const dimensionExpansionRenderer = new DimensionExpansionRenderer();

