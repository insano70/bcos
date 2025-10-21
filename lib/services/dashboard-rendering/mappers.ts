/**
 * Dashboard Rendering Service - Result Mappers
 *
 * Transform execution results into API response format.
 * Handles result aggregation, metadata building, and formatting.
 */

import type {
  DashboardRenderResponse,
  DashboardUniversalFilters,
  ExecutionResult,
} from './types';

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
