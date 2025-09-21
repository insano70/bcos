import type { ChartDefinition, ChartRenderContext, AnalyticsQueryResult } from '@/lib/types/analytics';
import type { ValidationResult } from './chart-validation';
import { analyticsQueryBuilder } from './analytics-query-builder';
import { chartValidator } from './chart-validation';
import { logger } from '@/lib/logger';

/**
 * Chart Executor Service
 * Executes chart definitions stored in the database by converting them to analytics queries
 */

export class ChartExecutor {
  
  /**
   * Execute a chart definition and return data
   */
  async executeChart(
    chartDefinition: ChartDefinition,
    context: ChartRenderContext,
    additionalFilters: Record<string, unknown> = {}
  ): Promise<AnalyticsQueryResult> {
    
    // Validate chart definition
    const validation = await chartValidator.validateChartDefinition(chartDefinition);
    if (!validation.isValid) {
      throw new Error(`Invalid chart definition: ${validation.errors.join(', ')}`);
    }

    logger.info('Executing chart definition', {
      chartId: chartDefinition.chart_definition_id,
      chartName: chartDefinition.chart_name,
      chartType: chartDefinition.chart_type,
      userId: context.user_id
    });

    try {
      // Convert chart definition to analytics query parameters
      const queryParams = this.convertToQueryParams(chartDefinition, additionalFilters);
      
      // Execute the query using the analytics query builder
      const result = await analyticsQueryBuilder.queryMeasures(queryParams, context);
      
      logger.info('Chart definition executed successfully', {
        chartId: chartDefinition.chart_definition_id,
        resultCount: result.data.length,
        queryTime: result.query_time_ms
      });

      return result;
      
    } catch (error) {
      logger.error('Chart definition execution failed', {
        chartId: chartDefinition.chart_definition_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: context.user_id
      });
      
      throw error;
    }
  }

  /**
   * Convert chart definition to analytics query parameters
   */
  private convertToQueryParams(chartDefinition: ChartDefinition, additionalFilters: Record<string, unknown> = {}) {
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
   */
  async getChartDefinition(chartDefinitionId: string): Promise<ChartDefinition | null> {
    try {
      // This would fetch from the database - simplified for now
      // In a real implementation, this would use the chart definitions CRUD API
      logger.info('Fetching chart definition', { chartDefinitionId });
      
      // TODO: Implement actual database fetch
      // const [chart] = await db.select().from(chart_definitions).where(eq(chart_definitions.chart_definition_id, chartDefinitionId));
      
      return null; // Placeholder
      
    } catch (error) {
      logger.error('Failed to fetch chart definition', {
        chartDefinitionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }

  /**
   * Execute chart by ID (convenience method)
   */
  async executeChartById(
    chartDefinitionId: string,
    context: ChartRenderContext,
    additionalFilters: Record<string, unknown> = {}
  ): Promise<AnalyticsQueryResult> {
    
    const chartDefinition = await this.getChartDefinition(chartDefinitionId);
    
    if (!chartDefinition) {
      throw new Error(`Chart definition not found: ${chartDefinitionId}`);
    }

    return this.executeChart(chartDefinition, context, additionalFilters);
  }

  /**
   * Validate and execute chart definition
   */
  async validateAndExecute(
    chartDefinition: ChartDefinition,
    context: ChartRenderContext,
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
          cache_hit: false
        },
        validation
      };
    }

    // Execute if valid
    const result = await this.executeChart(chartDefinition, context, additionalFilters);
    
    return { result, validation };
  }
}

// Export singleton instance
export const chartExecutor = new ChartExecutor();
