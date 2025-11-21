/**
 * Dashboard Rendering Service - Result Mappers
 *
 * Transform execution results into API response format.
 * Handles result aggregation, metadata building, and formatting.
 *
 * Also includes shared mappers for orchestration results to batch chart data
 * used by both dashboard rendering and dimension expansion systems.
 */

import type {
  DashboardRenderResponse,
  DashboardUniversalFilters,
  ExecutionResult,
} from './types';
import type { OrchestrationResult } from '@/lib/services/chart-data-orchestrator';

/**
 * Map execution result to dashboard render response
 *
 * Transforms the internal execution result into the API response format:
 * - Converts results array to chartId-keyed object
 * - Builds metadata with statistics
 * - Calculates applied filters
 *
 * @param executionResult - Result from batch executor
 * @param universalFilters - Dashboard-level filters
 * @param duration - Total render duration in milliseconds
 * @returns Formatted dashboard render response
 */
export function mapDashboardRenderResponse(
  executionResult: ExecutionResult,
  universalFilters: DashboardUniversalFilters,
  _duration: number
): DashboardRenderResponse {
  // Transform results array to chartId-keyed object
  const charts: DashboardRenderResponse['charts'] = {};

  for (const { chartId, result } of executionResult.results) {
    if (result) {
      charts[chartId] = result;
    }
  }

  return {
    charts,
    metadata: {
      totalQueryTime: executionResult.stats.totalQueryTime,
      cacheHits: executionResult.stats.cacheHits,
      cacheMisses: executionResult.stats.cacheMisses,
      queriesExecuted: executionResult.stats.cacheHits + executionResult.stats.cacheMisses,
      chartsRendered: Object.keys(charts).length,
      dashboardFiltersApplied: getAppliedFilterNames(universalFilters),
      parallelExecution: true,
    },
  };
}

/**
 * Get names of applied dashboard filters for logging
 *
 * @param filters - Dashboard universal filters
 * @returns Array of filter names that are applied
 */
export function getAppliedFilterNames(filters: DashboardUniversalFilters): string[] {
  const applied: string[] = [];

  if (filters.startDate || filters.endDate || filters.dateRangePreset) {
    applied.push('dateRange');
  }
  if (filters.organizationId) {
    applied.push('organization');
  }
  if (filters.practiceUids && filters.practiceUids.length > 0) {
    applied.push('practice');
  }
  if (filters.providerName) {
    applied.push('provider');
  }

  return applied;
}

/**
 * Build empty dashboard response
 *
 * Used when dashboard has no charts or no accessible charts.
 *
 * @param filters - Dashboard universal filters
 * @returns Empty dashboard render response
 */
export function buildEmptyDashboardResponse(
  filters: DashboardUniversalFilters
): DashboardRenderResponse {
  return {
    charts: {},
    metadata: {
      totalQueryTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      queriesExecuted: 0,
      chartsRendered: 0,
      dashboardFiltersApplied: getAppliedFilterNames(filters),
      parallelExecution: false,
    },
  };
}

/**
 * BatchChartData interface
 * Structure expected by BatchChartRenderer component
 */
export interface BatchChartData {
  chartData: OrchestrationResult['chartData'];
  rawData: OrchestrationResult['rawData'];
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
    measure?: string;
    frequency?: string;
    groupBy?: string;
  };
  columns?: OrchestrationResult['columns'];
  // Config and filters used to render this chart (for dimension expansion)
  finalChartConfig?: Record<string, unknown>;
  runtimeFilters?: Record<string, unknown>;
  formattedData?: OrchestrationResult['formattedData'];
}

/**
 * Convert OrchestrationResult to BatchChartData
 *
 * Shared mapper used by:
 * - Dashboard rendering system (batch executor)
 * - Dimension expansion system
 *
 * Transforms the chart orchestrator result into the format expected by
 * BatchChartRenderer component. Handles:
 * - Core chart data (chartData, rawData)
 * - Metadata mapping with additional fields
 * - Optional table data (columns, formattedData)
 * - Optional chart config fields (measure, frequency, groupBy)
 *
 * @param result - Orchestration result from chart data orchestrator
 * @param chartConfig - Chart configuration (optional, for extracting measure/frequency/groupBy)
 * @returns BatchChartData ready for BatchChartRenderer
 *
 * @example
 * ```typescript
 * const result = await chartDataOrchestrator.orchestrate(request, userContext);
 * const batchChartData = orchestrationResultToBatchChartData(result, {
 *   measure: 'revenue',
 *   frequency: 'daily',
 *   groupBy: 'location'
 * });
 * ```
 */
export function orchestrationResultToBatchChartData(
  result: OrchestrationResult,
  chartConfig?: {
    measure?: string | undefined;
    frequency?: string | undefined;
    groupBy?: string | undefined;
    finalChartConfig?: Record<string, unknown>;
    runtimeFilters?: Record<string, unknown>;
    [key: string]: unknown;
  }
): BatchChartData {
  return {
    chartData: result.chartData,
    rawData: result.rawData,
    metadata: {
      chartType: result.metadata.chartType,
      dataSourceId: result.metadata.dataSourceId,
      transformedAt: new Date().toISOString(),
      queryTimeMs: result.metadata.queryTimeMs,
      cacheHit: result.metadata.cacheHit,
      recordCount: result.metadata.recordCount,
      transformDuration: 0, // Not tracked separately in orchestration
      // Optional chart config fields for BatchChartRenderer (only include if defined)
      ...(chartConfig?.measure !== undefined && { measure: chartConfig.measure }),
      ...(chartConfig?.frequency !== undefined && { frequency: chartConfig.frequency }),
      ...(chartConfig?.groupBy !== undefined && { groupBy: chartConfig.groupBy }),
    },
    // Include table-specific data if present
    ...(result.columns && { columns: result.columns }),
    ...(result.formattedData && { formattedData: result.formattedData }),
    // CRITICAL: Include configs for dimension expansion reuse
    ...(chartConfig?.finalChartConfig && { finalChartConfig: chartConfig.finalChartConfig }),
    ...(chartConfig?.runtimeFilters && { runtimeFilters: chartConfig.runtimeFilters }),
  };
}
