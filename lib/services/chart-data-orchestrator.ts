import type { UserContext } from '@/lib/types/rbac';
import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { chartTypeRegistry } from './chart-type-registry';
import { db } from '@/lib/db';
import { chart_definitions } from '@/lib/db/analytics-schema';
import { eq } from 'drizzle-orm';

// Import chart handlers to ensure they're registered
import './chart-handlers';

/**
 * Chart Data Orchestrator
 *
 * Central service that coordinates chart data fetching and transformation.
 * Routes requests to appropriate chart type handlers via registry.
 *
 * Responsibilities:
 * - Load chart definitions from database
 * - Merge chart config with runtime filters
 * - Delegate to appropriate chart type handler
 * - Handle errors and logging
 * - Coordinate caching (future)
 */

/**
 * Universal chart data request (from API endpoint)
 */
interface UniversalChartDataRequest {
  chartDefinitionId?: string;
  chartConfig?: {
    chartType: string;
    dataSourceId: number;
    [key: string]: unknown;
  };
  runtimeFilters?: {
    startDate?: string;
    endDate?: string;
    dateRangePreset?: string;
    practice?: string;
    practiceUid?: string;
    providerName?: string;
    measure?: string;
    frequency?: string;
  };
}

/**
 * Orchestration result
 */
interface OrchestrationResult {
  chartData: ChartData;
  rawData: Record<string, unknown>[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
  };
}

/**
 * ChartDataOrchestrator class
 * Singleton service for orchestrating chart data requests
 */
class ChartDataOrchestrator {
  /**
   * Main orchestration method
   * Routes request to appropriate handler and returns transformed data
   */
  async orchestrate(
    request: UniversalChartDataRequest,
    userContext: UserContext
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    try {
      // 1. Resolve chart configuration
      const chartConfig = await this.resolveChartConfig(request);

      log.info('Chart configuration resolved', {
        chartType: chartConfig.chartType,
        dataSourceId: chartConfig.dataSourceId,
        hasRuntimeFilters: Boolean(request.runtimeFilters),
        userId: userContext.user_id,
      });

      // 2. Merge runtime filters with chart config
      const mergedConfig = this.mergeRuntimeFilters(chartConfig, request.runtimeFilters);

      log.info('Runtime filters merged', {
        chartType: mergedConfig.chartType,
        hasStartDate: Boolean(mergedConfig.startDate),
        hasEndDate: Boolean(mergedConfig.endDate),
        hasPracticeUid: Boolean(mergedConfig.practiceUid),
      });

      // 3. Get handler from registry
      const chartType = chartConfig.chartType as string;
      const handler = chartTypeRegistry.getHandler(chartType);

      if (!handler) {
        throw new Error(`No handler registered for chart type: ${chartType}`);
      }

      log.info('Chart handler retrieved', {
        chartType: chartConfig.chartType,
        handlerType: handler.type,
      });

      // 4. Validate chart configuration
      const validationResult = handler.validate(mergedConfig);

      if (!validationResult.isValid) {
        throw new Error(
          `Chart configuration validation failed: ${validationResult.errors.join(', ')}`
        );
      }

      log.info('Chart configuration validated', {
        chartType: chartConfig.chartType,
      });

      // 5. Fetch data via handler
      const fetchStartTime = Date.now();

      const rawData = await handler.fetchData(mergedConfig, userContext);

      const fetchDuration = Date.now() - fetchStartTime;

      log.info('Chart data fetched', {
        chartType: chartConfig.chartType,
        recordCount: rawData.length,
        fetchDuration,
      });

      // 6. Transform data via handler
      const transformStartTime = Date.now();

      const chartData = handler.transform(rawData, mergedConfig);

      const transformDuration = Date.now() - transformStartTime;

      log.info('Chart data transformed', {
        chartType: chartConfig.chartType,
        datasetCount: chartData.datasets?.length ?? 0,
        labelCount: chartData.labels?.length ?? 0,
        transformDuration,
      });

      // 7. Build result
      const result: OrchestrationResult = {
        chartData,
        rawData,
        metadata: {
          chartType: chartConfig.chartType as string,
          dataSourceId: chartConfig.dataSourceId as number,
          queryTimeMs: fetchDuration,
          cacheHit: false, // TODO: Implement caching in Phase 6
          recordCount: rawData.length,
        },
      };

      const totalDuration = Date.now() - startTime;

      log.info('Chart data orchestration completed', {
        chartType: chartConfig.chartType,
        totalDuration,
        fetchDuration,
        transformDuration,
        recordCount: rawData.length,
      });

      return result;
    } catch (error) {
      log.error('Chart data orchestration failed', error, {
        hasChartDefinitionId: Boolean(request.chartDefinitionId),
        hasChartConfig: Boolean(request.chartConfig),
        chartType: request.chartConfig?.chartType,
        userId: userContext.user_id,
      });

      throw error;
    }
  }

  /**
   * Resolve chart configuration from request
   * Loads from database if chartDefinitionId provided, otherwise uses inline config
   */
  private async resolveChartConfig(
    request: UniversalChartDataRequest
  ): Promise<Record<string, unknown>> {
    // If chartDefinitionId provided, load from database
    if (request.chartDefinitionId) {
      log.info('Loading chart definition from database', {
        chartDefinitionId: request.chartDefinitionId,
      });

      const [chartDefinition] = await db
        .select()
        .from(chart_definitions)
        .where(eq(chart_definitions.chart_definition_id, request.chartDefinitionId))
        .limit(1);

      if (!chartDefinition) {
        throw new Error(`Chart definition not found: ${request.chartDefinitionId}`);
      }

      if (!chartDefinition.is_active) {
        throw new Error(`Chart definition is inactive: ${request.chartDefinitionId}`);
      }

      // Extract chart config from JSONB
      const chartConfig = chartDefinition.chart_config as Record<string, unknown>;

      // Add chart type and data source from top-level fields
      return {
        ...chartConfig,
        chartType: chartDefinition.chart_type,
        dataSourceId: chartDefinition.data_source_id,
      };
    }

    // Otherwise, use inline chart config
    if (!request.chartConfig) {
      throw new Error('Either chartDefinitionId or chartConfig must be provided');
    }

    return request.chartConfig as Record<string, unknown>;
  }

  /**
   * Merge runtime filters with chart configuration
   * Runtime filters override chart definition filters
   */
  private mergeRuntimeFilters(
    chartConfig: Record<string, unknown>,
    runtimeFilters?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!runtimeFilters) {
      return chartConfig;
    }

    // Merge runtime filters, overriding chart config values
    return {
      ...chartConfig,
      ...runtimeFilters,
    };
  }
}

// Export singleton instance
export const chartDataOrchestrator = new ChartDataOrchestrator();
