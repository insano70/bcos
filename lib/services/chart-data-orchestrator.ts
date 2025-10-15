import type { UserContext } from '@/lib/types/rbac';
import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { chartTypeRegistry } from './chart-type-registry';
import { createRBACDataSourcesService } from './rbac-data-sources-service';
import { createRBACChartDefinitionsService } from './rbac-chart-definitions-service';

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
  chartDefinitionId?: string | undefined;
  chartConfig?: {
    chartType: string;
    dataSourceId: number;
    [key: string]: unknown;
  } | undefined;
  runtimeFilters?: {
    startDate?: string | undefined;
    endDate?: string | undefined;
    dateRangePreset?: string | undefined;
    practice?: string | undefined;
    practiceUid?: string | undefined;
    providerName?: string | undefined;
    measure?: string | undefined;
    frequency?: string | undefined;
  } | undefined;
}

/**
 * Column definition for table charts
 */
export interface ColumnDefinition {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: Record<string, unknown> | null;
}

/**
 * Formatted cell for table charts (Phase 3.2)
 */
export interface FormattedCell {
  formatted: string; // Display value (e.g., "$1,000.00")
  raw: unknown; // Original value for sorting/exporting
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Orchestration result
 */
interface OrchestrationResult {
  chartData: ChartData;
  rawData: Record<string, unknown>[];
  columns?: ColumnDefinition[]; // Optional: Only for table charts
  formattedData?: Array<Record<string, FormattedCell>>; // Optional: Only for table charts (Phase 3.2)
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
      const chartConfig = await this.resolveChartConfig(request, userContext);

      log.info('Chart configuration resolved', {
        chartType: chartConfig.chartType,
        dataSourceId: chartConfig.dataSourceId,
        hasRuntimeFilters: Boolean(request.runtimeFilters),
        userId: userContext.user_id,
      });

      // 1a. Verify user has access to the data source (security: defense-in-depth)
      await this.verifyDataSourceAccess(chartConfig.dataSourceId as number, userContext);

      log.info('Data source access verified', {
        dataSourceId: chartConfig.dataSourceId,
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
      const requestedChartType = chartConfig.chartType as string;
      const handler = chartTypeRegistry.getHandler(requestedChartType);

      if (!handler) {
        const availableTypes = chartTypeRegistry.getAllTypes();
        throw new Error(
          `No handler registered for chart type: ${requestedChartType}. ` +
          `Available types: ${availableTypes.join(', ')}`
        );
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

      // 6. Transform data via handler (may be async for data source config lookups)
      const transformStartTime = Date.now();

      const chartData = await handler.transform(rawData, mergedConfig);

      const transformDuration = Date.now() - transformStartTime;

      log.info('Chart data transformed', {
        chartType: chartConfig.chartType,
        datasetCount: chartData.datasets?.length ?? 0,
        labelCount: chartData.labels?.length ?? 0,
        transformDuration,
      });

      // 7. Build result (defensive type checking)
      const chartType = typeof chartConfig.chartType === 'string'
        ? chartConfig.chartType
        : 'unknown';

      const dataSourceId = typeof chartConfig.dataSourceId === 'number'
        ? chartConfig.dataSourceId
        : 0;

      // Extract column metadata if present (for table charts)
      const columns = Array.isArray(mergedConfig.columns)
        ? (mergedConfig.columns as ColumnDefinition[])
        : undefined;

      // Extract formatted data if present (for table charts - Phase 3.2)
      const formattedData = Array.isArray(mergedConfig.formattedData)
        ? (mergedConfig.formattedData as Array<Record<string, FormattedCell>>)
        : undefined;

      const result: OrchestrationResult = {
        chartData,
        rawData,
        ...(columns && { columns }), // Only include columns if present
        ...(formattedData && { formattedData }), // Only include formatted data if present (Phase 3.2)
        metadata: {
          chartType,
          dataSourceId,
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
        hasColumns: Boolean(columns),
        columnCount: columns?.length ?? 0,
        hasFormattedData: Boolean(formattedData),
        formattedRowCount: formattedData?.length ?? 0,
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
   *
   * @param request - Chart data request
   * @param userContext - User context for RBAC enforcement
   * @returns Resolved chart configuration
   */
  private async resolveChartConfig(
    request: UniversalChartDataRequest,
    userContext: UserContext
  ): Promise<Record<string, unknown>> {
    // If chartDefinitionId provided, load from database with RBAC
    if (request.chartDefinitionId) {
      log.info('Loading chart definition from database', {
        chartDefinitionId: request.chartDefinitionId,
        userId: userContext.user_id,
      });

      // Use RBAC-enabled service to fetch chart definition
      // This enforces organization and ownership scoping automatically
      const chartDefService = createRBACChartDefinitionsService(userContext);
      const chartDefinition = await chartDefService.getChartDefinitionById(
        request.chartDefinitionId
      );

      if (!chartDefinition) {
        throw new Error(`Chart definition not found: ${request.chartDefinitionId}`);
      }

      if (!chartDefinition.is_active) {
        throw new Error(`Chart definition is inactive: ${request.chartDefinitionId}`);
      }

      log.info('Chart definition loaded successfully', {
        chartDefinitionId: request.chartDefinitionId,
        chartType: chartDefinition.chart_type,
        dataSourceId: chartDefinition.data_source_id,
        userId: userContext.user_id,
      });

      // Extract chart config from JSONB
      const chartConfig = chartDefinition.chart_config as Record<string, unknown>;

      // Add chart type and data source from top-level fields
      const resolvedConfig = {
        ...chartConfig,
        chartType: chartDefinition.chart_type,
        dataSourceId: chartDefinition.data_source_id,
      };

      return resolvedConfig;
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

  /**
   * Verify user has access to the specified data source
   * Security: Prevents privilege escalation via chart definition references
   */
  private async verifyDataSourceAccess(
    dataSourceId: number,
    userContext: UserContext
  ): Promise<void> {
    try {
      const dataSourcesService = createRBACDataSourcesService(userContext);

      // This call automatically checks RBAC permissions
      // Will throw PermissionDeniedError if user doesn't have access
      const dataSource = await dataSourcesService.getDataSourceById(dataSourceId);

      if (!dataSource) {
        throw new Error(`Data source not found or access denied: ${dataSourceId}`);
      }

      if (!dataSource.is_active) {
        throw new Error(`Data source is inactive: ${dataSourceId}`);
      }

      log.info('Data source access check passed', {
        dataSourceId,
        dataSourceName: dataSource.data_source_name,
        userId: userContext.user_id,
      });
    } catch (error) {
      log.error('Data source access verification failed', error, {
        dataSourceId,
        userId: userContext.user_id,
      });

      throw new Error(
        `Insufficient permissions to access data source ${dataSourceId}`
      );
    }
  }
}

// Export singleton instance
export const chartDataOrchestrator = new ChartDataOrchestrator();
