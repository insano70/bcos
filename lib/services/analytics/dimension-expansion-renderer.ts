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
import type { ChartFilter } from '@/lib/types/analytics';
import type {
  DimensionExpandedChart,
  DimensionExpandedChartData,
  DimensionExpansionRequest,
} from '@/lib/types/dimensions';
import { dimensionDiscoveryService } from './dimension-discovery-service';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
import { 
  DIMENSION_EXPANSION_LIMITS, 
  MAX_PARALLEL_DIMENSION_CHARTS 
} from '@/lib/constants/dimension-expansion';

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

      // Extract chart's data_source config (contains measure, frequency, etc.)
      const chartDataSource = chartDef.data_source as Record<string, unknown>;
      
      // Extract filters from data_source to get measure and frequency
      const filters = (chartDataSource.filters as Array<{ field: string; value: unknown }>) || [];
      const measureFilter = filters.find((f) => f.field === 'measure');
      const frequencyFilter = filters.find((f) => f.field === 'frequency');
      
      // Extract and normalize chart_config for visual settings (colors, stacking, etc.)
      // IMPORTANT: Flatten series.groupBy and series.colorPalette to top-level (matching batch executor pattern)
      const chartConfigRaw = chartDef.chart_config as {
        series?: { groupBy?: string; colorPalette?: string };
        groupBy?: string;
        colorPalette?: string;
        stackingMode?: string;
        dataSourceId?: number;
        seriesConfigs?: unknown[];
        [key: string]: unknown;
      };
      
      const chartConfig: Record<string, unknown> = {
        ...(typeof chartDef.chart_config === 'object' && chartDef.chart_config !== null
          ? (chartDef.chart_config as Record<string, unknown>)
          : {}),
      };
      
      // Flatten series.groupBy to top-level (except for number charts)
      if (chartDef.chart_type !== 'number' && chartConfigRaw.series?.groupBy) {
        chartConfig.groupBy = chartConfigRaw.series.groupBy;
      }
      
      // Flatten series.colorPalette to top-level
      if (chartConfigRaw.series?.colorPalette) {
        chartConfig.colorPalette = chartConfigRaw.series.colorPalette;
      }
      
      log.info('Chart definition loaded for dimension expansion', {
        chartDefinitionId,
        dataSourceId,
        hasDataSource: !!chartDataSource,
        dataSourceKeys: chartDataSource ? Object.keys(chartDataSource) : [],
        measureValue: measureFilter?.value,
        frequencyValue: frequencyFilter?.value,
        component: 'dimension-expansion',
      });

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
      let resolvedFilters = { ...baseFilters };
      
      if (baseFilters.organizationId && typeof baseFilters.organizationId === 'string') {
        // Resolve organization to practice UIDs (with hierarchy)
        const allOrganizations = await organizationHierarchyService.getAllOrganizations();
        const practiceUids = await organizationHierarchyService.getHierarchyPracticeUids(
          baseFilters.organizationId,
          allOrganizations
        );
        
        // Replace organizationId with resolved practiceUids
        resolvedFilters = {
          ...baseFilters,
          practiceUids,
        };
        delete resolvedFilters.organizationId;

        log.info('Resolved organization filter for dimension expansion', {
          chartDefinitionId,
          organizationId: baseFilters.organizationId,
          resolvedPracticeUids: practiceUids.length,
          component: 'dimension-expansion',
        });
      }

      // Convert baseFilters to ChartFilter array
      const chartFilters = this.convertBaseFiltersToChartFilters(resolvedFilters);

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
          // CRITICAL: Separate chartConfig from runtimeFilters (like batch executor does)
          // chartConfig = Visual settings (colorPalette, stackingMode, groupBy)
          // runtimeFilters = Query parameters (measure, frequency, dates, filters)
          
          const finalChartConfig = {
            chartType: chartDef.chart_type,
            dataSourceId,
            ...chartConfig,  // ← All visual config (colorPalette, stackingMode, groupBy, etc.)
          };

          const runtimeFilters = {
            ...resolvedFilters,      // ← Current filters (dates, practiceUids)
            measure: measureFilter?.value as string | undefined,
            frequency: frequencyFilter?.value as string | undefined,
            // Add dimension filter
            advancedFilters: [
              ...(Array.isArray(resolvedFilters.advancedFilters) ? resolvedFilters.advancedFilters : []),
              {
                field: dimensionColumn,
                operator: 'eq' as const,
                value: dimensionValue.value,
              },
            ],
          } as Record<string, unknown>;

          // Execute chart query using orchestrator (matching batch executor pattern)
          const result = await chartDataOrchestrator.orchestrate(
            {
              chartConfig: finalChartConfig as typeof finalChartConfig & {
                chartType: string;
                dataSourceId: number;
              },
              runtimeFilters,
            },
            userContext
          );

          const queryTime = Date.now() - queryStart;

          // Map OrchestrationResult to proper BatchChartData structure matching batch executor pattern
          const batchChartData = {
            chartData: result.chartData,
            rawData: result.rawData,
            metadata: {
              chartType: result.metadata.chartType,
              dataSourceId: result.metadata.dataSourceId,
              transformedAt: new Date().toISOString(),
              queryTimeMs: result.metadata.queryTimeMs,
              cacheHit: result.metadata.cacheHit,
              recordCount: result.metadata.recordCount,
              transformDuration: 0,
              // CRITICAL: Include measure, frequency, groupBy for BatchChartRenderer
              measure: measureFilter?.value as string | undefined,
              frequency: frequencyFilter?.value as string | undefined,
              groupBy: (chartConfig.groupBy as string | undefined),
            },
            // Include table-specific data if present
            ...(result.columns && { columns: result.columns }),
            ...(result.formattedData && { formattedData: result.formattedData }),
          };

          // Update dimensionValue.recordCount with actual filtered count
          const actualRecordCount = result.metadata.recordCount;
          const updatedDimensionValue = {
            ...dimensionValue,
            recordCount: actualRecordCount,
          };

          const expandedChart: DimensionExpandedChart = {
            dimensionValue: updatedDimensionValue,
            // biome-ignore lint/suspicious/noExplicitAny: BatchChartData structure properly mapped from OrchestrationResult
            chartData: batchChartData as any,
            metadata: {
              recordCount: actualRecordCount,
              queryTimeMs: queryTime,
              cacheHit: result.metadata.cacheHit,
              transformDuration: 0,
            },
          };

          return expandedChart;
        } catch (error) {
          log.error('Failed to render chart for dimension value', error as Error, {
            chartDefinitionId,
            dimensionColumn,
            dimensionValue: dimensionValue.value,
            userId: userContext.user_id,
            component: 'dimension-expansion',
          });

          // Return empty chart on error (graceful degradation)
          return {
            dimensionValue,
            chartData: {
              chartData: {
                labels: [],
                datasets: [],
              },
              rawData: [],
              metadata: {
                chartType: '',
                dataSourceId: 0,
                transformedAt: new Date().toISOString(),
                queryTimeMs: Date.now() - queryStart,
                cacheHit: false,
                recordCount: 0,
                transformDuration: 0,
              },
            },
            metadata: {
              recordCount: 0,
              queryTimeMs: Date.now() - queryStart,
              cacheHit: false,
              transformDuration: 0,
            },
          } as DimensionExpandedChart;
        }
      });

      // Execute all in parallel
      const allCharts = await Promise.all(chartPromises);

      // Filter out dimension values with zero records and sort by record count (descending)
      const charts = allCharts
        .filter((chart) => chart.metadata.recordCount > 0)
        .sort((a, b) => b.metadata.recordCount - a.metadata.recordCount);

      const totalTime = Date.now() - startTime;

      log.info('Dimension expansion completed', {
        chartDefinitionId,
        dimensionColumn,
        dimensionValues: values.length,
        totalCharts: allCharts.length,
        chartsWithData: charts.length,
        zeroRecordChartsFiltered: allCharts.length - charts.length,
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

  /**
   * Convert base filters object to ChartFilter array
   *
   * Helper to transform dashboard filter format to chart filter format.
   *
   * @param baseFilters - Base filters from dashboard
   * @returns Array of chart filters
   */
  private convertBaseFiltersToChartFilters(
    baseFilters: Record<string, unknown>
  ): ChartFilter[] {
    const filters: ChartFilter[] = [];

    // Handle advanced filters
    if (Array.isArray(baseFilters.advancedFilters)) {
      filters.push(...(baseFilters.advancedFilters as ChartFilter[]));
    }

    // Handle date range
    if (baseFilters.startDate && typeof baseFilters.startDate === 'string') {
      filters.push({
        field: 'date',
        operator: 'gte',
        value: baseFilters.startDate,
      });
    }

    if (baseFilters.endDate && typeof baseFilters.endDate === 'string') {
      filters.push({
        field: 'date',
        operator: 'lte',
        value: baseFilters.endDate,
      });
    }

    // Handle practice UIDs
    if (Array.isArray(baseFilters.practiceUids) && baseFilters.practiceUids.length > 0) {
      filters.push({
        field: 'practice_uid',
        operator: 'in',
        value: baseFilters.practiceUids as number[],
      });
    }

    return filters;
  }
}

// Export singleton instance
export const dimensionExpansionRenderer = new DimensionExpansionRenderer();

