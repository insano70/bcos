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
import { convertBaseFiltersToChartFilters, type ResolvedBaseFilters } from '@/lib/utils/filter-converters';
import { resolveOrganizationFilter } from '@/lib/utils/organization-filter-resolver';
import { orchestrationResultToBatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import { ChartConfigBuilderService } from '@/lib/services/dashboard-rendering/chart-config-builder';
import type { ResolvedFilters } from '@/lib/services/dashboard-rendering/types';

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
      const { chartDefinitionId, dimensionColumn, baseFilters, limit = DIMENSION_EXPANSION_LIMITS.DEFAULT } = request;

      // SECURITY: Validate and clamp limit parameter
      const validatedLimit = Math.min(
        Math.max(limit, 1),
        DIMENSION_EXPANSION_LIMITS.MAXIMUM
      );

      // Get chart definition with full data_source config
      const chartsService = createRBACChartsService(userContext);
      const chartDef = await chartsService.getChartById(chartDefinitionId);
      
      // Get data_source_id from the denormalized integer column
      const dataSourceId = chartDef?.data_source_id || 0;

      if (!chartDef || dataSourceId === 0) {
        throw new Error(`Chart definition not found or missing data_source_id: ${chartDefinitionId}`);
      }

      // Get dimension metadata
      const dimensionCol = await dimensionDiscoveryService.getDataSourceExpansionDimensions(
        dataSourceId
      );
      const dimension = dimensionCol.find((d) => d.columnName === dimensionColumn);

      if (!dimension) {
        throw new Error(
          `Dimension not found: ${dimensionColumn} in data source ${dataSourceId}`
        );
      }

      // CRITICAL: Resolve organizationId to practiceUids BEFORE querying dimension values
      // Uses shared utility with proper RBAC validation and security logging
      const resolvedFilters: ResolvedFilters = {
        ...baseFilters,
        practiceUids: (baseFilters.practiceUids as number[] | undefined) || [],
      };
      
      if (baseFilters.organizationId && typeof baseFilters.organizationId === 'string') {
        // Resolve organization filter with RBAC validation
        const resolved = await resolveOrganizationFilter(
          baseFilters.organizationId,
          userContext,
          'dimension-expansion'
        );
        
        // Update with resolved practiceUids
        resolvedFilters.practiceUids = resolved.practiceUids;
        delete resolvedFilters.organizationId;
      }

      // Use ChartConfigBuilderService to extract and normalize chart configuration
      // This replaces ~80 lines of manual config extraction
      const configBuilder = new ChartConfigBuilderService();
      const chartExecutionConfig = configBuilder.buildSingleChartConfig(chartDef, resolvedFilters);

      log.info('Chart configuration built for dimension expansion', {
        chartDefinitionId,
        dataSourceId,
        chartType: chartDef.chart_type,
        hasRuntimeFilters: Object.keys(chartExecutionConfig.runtimeFilters).length > 0,
        hasMeasure: !!chartExecutionConfig.metadata.measure,
        hasFrequency: !!chartExecutionConfig.metadata.frequency,
        hasGroupBy: !!chartExecutionConfig.metadata.groupBy,
        component: 'dimension-expansion',
      });

      // Convert baseFilters to ChartFilter array using shared utility
      // Cast to compatible type for filter conversion
      const chartFilters = convertBaseFiltersToChartFilters(resolvedFilters as unknown as ResolvedBaseFilters);

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
          const batchChartData = orchestrationResultToBatchChartData(result, chartExecutionConfig.metadata);

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

