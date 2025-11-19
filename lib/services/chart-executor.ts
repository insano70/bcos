import { log } from '@/lib/logger';
import type {
  AnalyticsQueryResult,
  ChartDefinition,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { analyticsQueryBuilder } from './analytics';
import type { ValidationResult } from './chart-validation';
import { chartValidator } from './chart-validation';

/**
 * Chart Executor Service
 * Executes chart definitions stored in the database by converting them to analytics queries
 *
 * ⚠️ CURRENTLY UNUSED - Dead Code Candidate
 *
 * This service was designed to execute chart definitions by ID, but the application
 * currently uses a different pattern:
 * - Chart definitions are fetched via rbac-charts-service.ts
 * - Analytics queries are executed directly via analyticsQueryBuilder
 * - No code imports or uses this ChartExecutor service
 *
 * Status: Kept for potential future use (scheduled chart refreshes, server-side rendering)
 * Alternative: Remove if confirmed not needed for future features
 */

export class ChartExecutor {
  /**
   * Execute a chart definition and return data
   */
  async executeChart(
    chartDefinition: ChartDefinition,
    userContext: UserContext,
    additionalFilters: Record<string, unknown> = {}
  ): Promise<AnalyticsQueryResult> {
    // Validate chart definition
    const validation = await chartValidator.validateChartDefinition(chartDefinition);
    if (!validation.isValid) {
      throw new Error(`Invalid chart definition: ${validation.errors.join(', ')}`);
    }

    log.info('Executing chart definition', {
      chartId: chartDefinition.chart_definition_id,
      chartName: chartDefinition.chart_name,
      chartType: chartDefinition.chart_type,
      userId: userContext.user_id,
    });

    try {
      // Convert chart definition to analytics query parameters
      const queryParams = this.convertToQueryParams(chartDefinition, additionalFilters);

      // Execute the query using the analytics query builder
      const result = await analyticsQueryBuilder.queryMeasures(queryParams, userContext);

      log.info('Chart definition executed successfully', {
        chartId: chartDefinition.chart_definition_id,
        resultCount: result.data.length,
        queryTime: result.query_time_ms,
      });

      return result;
    } catch (error) {
      log.error('Chart definition execution failed', {
        chartId: chartDefinition.chart_definition_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userContext.user_id,
      });

      throw error;
    }
  }

  /**
   * Convert chart definition to analytics query parameters
   */
  private convertToQueryParams(
    chartDefinition: ChartDefinition,
    additionalFilters: Record<string, unknown> = {}
  ) {
    const dataSource = chartDefinition.data_source;
    const params: Record<string, unknown> = {};

    // Extract filters and convert to query parameters
    if (dataSource.filters) {
      for (const filter of dataSource.filters) {
        switch (filter.field) {
          case 'measure':
            params.measure = filter.value;
            break;
          case 'frequency':
            params.frequency = filter.value;
            break;
          case 'practice_uid':
            params.practice_uid = filter.value;
            break;
          case 'provider_uid':
            params.provider_uid = filter.value;
            break;
          case 'period_start':
            if (filter.operator === 'gte') {
              params.start_date = filter.value;
            }
            break;
          case 'period_end':
            if (filter.operator === 'lte') {
              params.end_date = filter.value;
            }
            break;
        }
      }
    }

    // Apply additional filters from request
    Object.assign(params, additionalFilters);

    // Apply limit from data source
    if (dataSource.limit) {
      params.limit = dataSource.limit;
    }

    return params;
  }

  /**
   * Get chart definition by ID from database
   *
   * ⚠️ UNUSED METHOD - Removed to eliminate dead code
   *
   * Original TODO: "Implement actual database fetch"
   * Resolution: Not needed. Chart definitions are fetched via:
   * - API route: /api/admin/analytics/charts/[chartId]
   * - Service: rbac-charts-service.ts (getChartById method)
   *
   * If this functionality is needed in the future, use the existing
   * rbac-charts-service.ts pattern which includes proper RBAC checks.
   */

  /**
   * Execute chart by ID (convenience method)
   *
   * ⚠️ UNUSED METHOD - Removed to eliminate dead code
   *
   * Original purpose: Execute chart definition by ID
   * Current pattern: Charts are executed via:
   * 1. Fetch definition via rbac-charts-service
   * 2. Execute query via analyticsQueryBuilder.queryMeasures()
   *
   * If needed in future, implement using existing service patterns.
   */

  /**
   * Validate and execute chart definition
   */
  async validateAndExecute(
    chartDefinition: ChartDefinition,
    userContext: UserContext,
    additionalFilters: Record<string, unknown> = {}
  ): Promise<{ result: AnalyticsQueryResult; validation: ValidationResult }> {
    // Validate first
    const validation = await chartValidator.validateChartDefinition(chartDefinition);

    if (!validation.isValid) {
      return {
        result: {
          data: [],
          total_count: 0,
          query_time_ms: 0,
          cache_hit: false,
        },
        validation,
      };
    }

    // Execute if valid
    const result = await this.executeChart(chartDefinition, userContext, additionalFilters);

    return { result, validation };
  }
}

// Export singleton instance
export const chartExecutor = new ChartExecutor();
