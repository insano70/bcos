/**
 * Query Executor Module
 *
 * Handles legacy path query execution (direct database queries without cache).
 * Used when ChartRenderContext is provided OR data_source_id is missing.
 *
 * ARCHITECTURE:
 * - Legacy Path: RBAC filters in SQL → queries only accessible data
 * - Cache Path (handled by DataSourceCacheService): RBAC in-memory → max cache reuse
 *
 * KEY METHODS:
 * - executeLegacyQuery(): Main legacy path execution
 * - executeMultipleSeries(): Handle multiple series (delegates to queryMeasures per series)
 * - executePeriodComparison(): Handle period comparison (calls executeBaseQuery twice)
 * - getColumnMappings(): Resolve dynamic column mappings from data source config
 *
 * SECURITY:
 * - Uses QueryValidator for field/table validation
 * - Uses QueryBuilder for RBAC-aware WHERE clause construction
 * - Uses QuerySanitizer for value sanitization
 * - All queries are parameterized to prevent SQL injection
 */

import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { columnMappingService } from '@/lib/services/column-mapping-service';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartFilter,
  ChartRenderContext,
} from '@/lib/types/analytics';
import { MeasureAccessor } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { queryBuilder } from './query-builder';
import type { ColumnMappings } from './query-types';
import { queryValidator } from './query-validator';

/**
 * Query executor for legacy path (direct database queries)
 * Used when cache path is not available
 */
export class QueryExecutor {
  /**
   * Get dynamic column mappings from data source metadata
   * If dataSourceConfig is provided, skip the lookup for efficiency
   */
  async getColumnMappings(
    tableName: string,
    schemaName: string,
    dataSourceConfig?: import('@/lib/services/chart-config-service').DataSourceConfig | null
  ): Promise<ColumnMappings> {
    const config =
      dataSourceConfig || (await chartConfigService.getDataSourceConfig(tableName, schemaName));

    if (!config) {
      throw new Error(`Data source configuration not found for ${schemaName}.${tableName}`);
    }

    // Find the time period field first (it's the frequency column like 'Daily', 'Weekly', etc.)
    const timePeriodColumn = config.columns.find((col) => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';

    // Find the date field - exclude time period field, prefer column named 'date_value' or 'date_index'
    const dateColumn =
      config.columns.find(
        (col) =>
          col.isDateField &&
          col.columnName !== timePeriodField &&
          (col.columnName === 'date_value' ||
            col.columnName === 'date_index' ||
            col.dataType === 'date')
      ) || config.columns.find((col) => col.isDateField && col.columnName !== timePeriodField);
    const dateField = dateColumn?.columnName || 'date_index';

    // Find the measure value field
    const measureColumn = config.columns.find((col) => col.isMeasure);
    const measureValueField = measureColumn?.columnName || 'measure_value';

    // Find the measure type field
    const measureTypeColumn = config.columns.find((col) => col.isMeasureType);
    const measureTypeField = measureTypeColumn?.columnName || 'measure_type';

    // Get all column names
    const allColumns = config.columns.map((col) => col.columnName);

    return {
      dateField,
      timePeriodField,
      measureValueField,
      measureTypeField,
      allColumns,
    };
  }

  /**
   * Process advanced filters to standardize format
   */
  private processAdvancedFilters(advancedFilters: ChartFilter[]): ChartFilter[] {
    return advancedFilters.map((filter) => ({
      field: filter.field,
      operator: filter.operator || 'eq',
      value: filter.value,
    }));
  }

  /**
   * Execute legacy query path (direct database query with RBAC in SQL)
   * Used when: ChartRenderContext provided OR missing data_source_id
   *
   * @param params - Query parameters
   * @param context - Chart render context with RBAC information
   * @returns Query result with data and metadata
   */
  async executeLegacyQuery(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    log.info('Building analytics query (legacy path)', {
      params: { ...params, limit: params.limit || 1000 },
      userId: context.user_id,
    });

    // Get data source configuration if data_source_id is provided
    let dataSourceConfig = null;
    let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
    let schemaName = 'ih';

    if (params.data_source_id) {
      // Use data_source_id directly to get config from cache
      dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);

      if (dataSourceConfig) {
        tableName = dataSourceConfig.tableName;
        schemaName = dataSourceConfig.schemaName;
      }
    }

    // Validate table access - pass config to avoid redundant lookup
    await queryValidator.validateTable(tableName, schemaName, dataSourceConfig);

    // Get dynamic column mappings from metadata - pass config to avoid redundant lookup
    const columnMappings = await this.getColumnMappings(tableName, schemaName, dataSourceConfig);

    // Build filters from params - use dynamic column mappings
    const filters: ChartFilter[] = [];

    if (params.measure) {
      filters.push({ field: 'measure', operator: 'eq', value: params.measure });
    }

    if (params.frequency) {
      filters.push({
        field: columnMappings.timePeriodField,
        operator: 'eq',
        value: params.frequency,
      });
    }

    if (params.practice) {
      filters.push({ field: 'practice', operator: 'eq', value: params.practice });
    }

    if (params.practice_primary) {
      filters.push({ field: 'practice_primary', operator: 'eq', value: params.practice_primary });
    }

    if (params.practice_uid) {
      filters.push({ field: 'practice_uid', operator: 'eq', value: params.practice_uid });
    }

    if (params.provider_name) {
      filters.push({ field: 'provider_name', operator: 'eq', value: params.provider_name });
    }

    if (params.start_date) {
      filters.push({ field: columnMappings.dateField, operator: 'gte', value: params.start_date });
    }

    if (params.end_date) {
      filters.push({ field: columnMappings.dateField, operator: 'lte', value: params.end_date });
    }

    // Process advanced filters if provided
    if (params.advanced_filters) {
      const advancedFilters = this.processAdvancedFilters(params.advanced_filters);
      filters.push(...advancedFilters);
    }

    // Build WHERE clause with security context - pass config to avoid redundant lookups
    const { clause: whereClause, params: queryParams } = await queryBuilder.buildWhereClause(
      filters,
      context
    );

    // Build dynamic SELECT column list using metadata
    // NO aliasing - use actual column names from data source
    const selectColumns = columnMappings.allColumns;

    const query = `
      SELECT ${selectColumns.join(', ')}
      FROM ${schemaName}.${tableName}
      ${whereClause}
      ORDER BY ${columnMappings.dateField} ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

    // Get appropriate total based on measure_type
    // For currency/quantity: sum the values, for count: count the rows
    const totalQuery = `
      SELECT
        CASE
          WHEN ${columnMappings.measureTypeField} IN ('currency', 'quantity') THEN SUM(${columnMappings.measureValueField})::text
          ELSE COUNT(*)::text
        END as total,
        ${columnMappings.measureTypeField} as measure_type
      FROM ${schemaName}.${tableName}
      ${whereClause}
      GROUP BY ${columnMappings.measureTypeField}
    `;

    const totalResult = await executeAnalyticsQuery<{ total: string; measure_type: string }>(
      totalQuery,
      queryParams
    );

    const queryTime = Date.now() - startTime;

    // Calculate appropriate total based on measure_type
    let totalCount = 0;
    if (totalResult.length > 0) {
      const firstResult = totalResult[0];
      totalCount = parseInt(firstResult?.total || '0', 10);
    }

    const result: AnalyticsQueryResult = {
      data,
      total_count: totalCount,
      query_time_ms: queryTime,
      cache_hit: false,
    };

    log.info('Analytics query completed (legacy path)', {
      queryTime,
      resultCount: data.length,
      totalCount,
      userId: context.user_id,
    });

    return result;
  }

  /**
   * Execute multiple series query
   * Delegates to main queryMeasures for each series (can hit cache per measure)
   *
   * @param params - Query parameters with multiple_series configuration
   * @param contextOrUserContext - Chart render context or user context
   * @param queryMeasuresDelegate - Delegate function to call for each series
   * @returns Combined result from all series
   */
  async executeMultipleSeries(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext,
    queryMeasuresDelegate: (
      params: AnalyticsQueryParams,
      context: ChartRenderContext | UserContext
    ) => Promise<AnalyticsQueryResult>
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.multiple_series || params.multiple_series.length === 0) {
      throw new Error('Multiple series configuration is required');
    }

    const isUserContext = 'email' in contextOrUserContext;
    const userId = isUserContext
      ? (contextOrUserContext as UserContext).user_id
      : (contextOrUserContext as ChartRenderContext).user_id;

    log.info('Building multiple series query with caching', {
      seriesCount: params.multiple_series.length,
      measures: params.multiple_series.map((s) => s.measure),
      userId,
    });

    // Fetch each series separately (can hit cache per measure)
    const seriesPromises = params.multiple_series.map(async (series) => {
      const seriesParams: AnalyticsQueryParams = {
        ...params,
        measure: series.measure,
        multiple_series: undefined, // Clear to avoid recursion
      };

      // Recursive call - will hit cache per measure
      const result = await queryMeasuresDelegate(seriesParams, contextOrUserContext);

      // Tag with series metadata
      return result.data.map((item) => ({
        ...item,
        series_id: series.id,
        series_label: series.label,
        series_aggregation: series.aggregation,
        ...(series.color && { series_color: series.color }),
      }));
    });

    const allSeriesData = await Promise.all(seriesPromises);
    const combinedData = allSeriesData.flat();

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: combinedData,
      total_count: combinedData.length,
      query_time_ms: duration,
      cache_hit: true, // Each series fetched from cache (potentially)
    };

    log.info('Multiple series query completed (with caching)', {
      seriesCount: params.multiple_series.length,
      totalRecords: combinedData.length,
      queryTime: duration,
      userId,
    });

    return result;
  }

  /**
   * Execute period comparison query
   * Calls executeLegacyQuery twice (current + comparison period) in parallel
   *
   * @param params - Query parameters with period_comparison configuration
   * @param contextOrUserContext - Chart render context or user context
   * @param executeBaseQueryDelegate - Delegate function to call for each period
   * @returns Combined result with comparison data
   */
  async executePeriodComparison(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext,
    executeBaseQueryDelegate: (
      params: AnalyticsQueryParams,
      context: ChartRenderContext | UserContext
    ) => Promise<AnalyticsQueryResult>
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.period_comparison?.enabled) {
      throw new Error('Period comparison configuration is required');
    }

    if (!params.frequency || !params.start_date || !params.end_date) {
      throw new Error('Frequency, start_date, and end_date are required for period comparison');
    }

    // Validate period comparison configuration
    if (!params.period_comparison.comparisonType) {
      throw new Error('Comparison type is required for period comparison');
    }

    if (
      params.period_comparison.comparisonType === 'custom_period' &&
      (!params.period_comparison.customPeriodOffset ||
        params.period_comparison.customPeriodOffset < 1)
    ) {
      throw new Error('Custom period offset must be at least 1');
    }

    const isUserContext = 'email' in contextOrUserContext;
    const userId = isUserContext
      ? (contextOrUserContext as UserContext).user_id
      : (contextOrUserContext as ChartRenderContext).user_id;

    log.info('Building period comparison analytics query', {
      comparisonType: params.period_comparison.comparisonType,
      frequency: params.frequency,
      currentRange: { start: params.start_date, end: params.end_date },
      userId,
    });

    // Import period comparison utilities
    const { calculateComparisonDateRange, generateComparisonLabel } = await import(
      '@/lib/utils/period-comparison'
    );

    // Calculate comparison date range
    let comparisonRange: { start: string; end: string };
    try {
      comparisonRange = calculateComparisonDateRange(
        params.start_date,
        params.end_date,
        params.frequency,
        params.period_comparison
      );
    } catch (error) {
      log.error('Failed to calculate comparison date range', error, {
        comparisonType: params.period_comparison.comparisonType,
        frequency: params.frequency,
        startDate: params.start_date,
        endDate: params.end_date,
      });
      throw new Error(
        `Failed to calculate comparison date range: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Create comparison query parameters
    const { period_comparison: _period_comparison, ...baseParams } = params;
    const comparisonParams: AnalyticsQueryParams = {
      ...baseParams,
      start_date: comparisonRange.start,
      end_date: comparisonRange.end,
    };

    // Execute both queries in parallel
    let currentResult: AnalyticsQueryResult, comparisonResult: AnalyticsQueryResult;
    try {
      [currentResult, comparisonResult] = await Promise.all([
        executeBaseQueryDelegate(params, contextOrUserContext),
        executeBaseQueryDelegate(comparisonParams, contextOrUserContext),
      ]);
    } catch (error) {
      log.error('Failed to execute period comparison queries', error, {
        comparisonType: params.period_comparison.comparisonType,
        currentRange: { start: params.start_date, end: params.end_date },
        comparisonRange,
      });
      throw new Error(
        `Failed to execute period comparison queries: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Validate that we have data for both periods
    if (!currentResult.data || currentResult.data.length === 0) {
      log.warn('No data found for current period', {
        comparisonType: params.period_comparison.comparisonType,
        currentRange: { start: params.start_date, end: params.end_date },
        userId,
      });
    }

    if (!comparisonResult.data || comparisonResult.data.length === 0) {
      log.warn('No data found for comparison period', {
        comparisonType: params.period_comparison.comparisonType,
        comparisonRange,
        userId,
      });
    }

    // Generate comparison label
    const comparisonLabel = generateComparisonLabel(params.frequency, params.period_comparison);

    // Tag all records with period information
    const currentData = currentResult.data.map((item) => ({
      ...item,
      comparison_period: 'current' as const,
      comparison_label: 'Current Period',
    }));

    const comparisonData = comparisonResult.data.map((item) => ({
      ...item,
      comparison_period: 'comparison' as const,
      comparison_label: comparisonLabel,
    }));

    const combinedData = [...currentData, ...comparisonData];

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: combinedData,
      total_count: combinedData.length,
      query_time_ms: duration,
      cache_hit: Boolean(currentResult.cache_hit || comparisonResult.cache_hit),
    };

    log.info('Period comparison query completed', {
      comparisonType: params.period_comparison.comparisonType,
      currentRecords: currentData.length,
      comparisonRecords: comparisonData.length,
      totalRecords: combinedData.length,
      queryTime: duration,
      userId,
    });

    return result;
  }

  /**
   * Calculate total count from filtered rows using MeasureAccessor
   * For currency: sum measure values, for others: count rows
   *
   * @param rows - The data rows
   * @param dataSourceId - Data source ID for column mapping
   * @returns Total count or sum
   */
  async calculateTotal(rows: AggAppMeasure[], dataSourceId: number): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    const firstRow = rows[0];
    if (!firstRow) {
      return 0;
    }

    // Get column mapping for this data source
    const mapping = await columnMappingService.getMapping(dataSourceId);
    const accessor = new MeasureAccessor(firstRow, mapping);

    const measureType = accessor.getMeasureType();

    if (measureType === 'currency' || measureType === 'quantity') {
      // Sum all measure values using accessor
      return rows.reduce((sum, row) => {
        const rowAccessor = new MeasureAccessor(row, mapping);
        return sum + rowAccessor.getMeasureValue();
      }, 0);
    }

    // For count, just return row count
    return rows.length;
  }
}

// Export singleton instance
export const queryExecutor = new QueryExecutor();
