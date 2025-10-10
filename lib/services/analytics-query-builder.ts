import { log } from '@/lib/logger';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartFilter,
  ChartFilterValue,
  ChartRenderContext,
} from '@/lib/types/analytics';
// Note: Query result caching removed - was in-memory only and not effective across serverless instances
// Metadata caching (columns, dashboards, charts) handled by @/lib/cache/analytics-cache
import { executeAnalyticsQuery } from './analytics-db';
import { chartConfigService } from './chart-config-service';

/**
 * Secure Query Builder for Analytics Database
 * Implements security-first approach with parameterized queries and field whitelisting
 */

/**
 * Dynamic field and table validation using database configuration
 * Replaces hardcoded ALLOWED_TABLES and ALLOWED_FIELDS arrays
 */

/**
 * Allowed operators for filters - prevents injection attacks
 */
const ALLOWED_OPERATORS = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  not_in: 'NOT IN',
  like: 'ILIKE',
  between: 'BETWEEN',
} as const;

/**
 * Secure Query Builder Class
 */
export class AnalyticsQueryBuilder {
  private log = log;

  /**
   * Validate table name against database configuration
   */
  private async validateTable(tableName: string, schemaName: string = 'ih'): Promise<void> {
    const config = await chartConfigService.getDataSourceConfig(tableName, schemaName);
    if (!config || !config.isActive) {
      throw new Error(`Unauthorized table access: ${schemaName}.${tableName}`);
    }
  }

  /**
   * Validate field name against database configuration
   */
  private async validateField(
    fieldName: string,
    tableName: string,
    schemaName: string = 'ih'
  ): Promise<void> {
    const allowedFields = await chartConfigService.getAllowedFields(tableName, schemaName);
    if (!allowedFields.includes(fieldName)) {
      throw new Error(`Unauthorized field access: ${fieldName}`);
    }
  }

  /**
   * Validate operator against whitelist
   */
  private validateOperator(operator: string): void {
    if (!Object.keys(ALLOWED_OPERATORS).includes(operator)) {
      throw new Error(`Unauthorized operator: ${operator}`);
    }
  }

  /**
   * Sanitize and validate filter values
   */
  private sanitizeValue(value: unknown, operator: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle array values for IN/NOT IN operators
    if (operator === 'in' || operator === 'not_in') {
      if (!Array.isArray(value)) {
        throw new Error(`${operator} operator requires array value`);
      }
      return value.map((v) => this.sanitizeSingleValue(v));
    }

    // Handle BETWEEN operator
    if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error('BETWEEN operator requires array with exactly 2 values');
      }
      return value.map((v) => this.sanitizeSingleValue(v));
    }

    return this.sanitizeSingleValue(value);
  }

  /**
   * Sanitize individual values based on type
   */
  private sanitizeSingleValue(value: unknown): unknown {
    if (typeof value === 'string') {
      // For date strings, validate format and return as-is if valid
      if (this.isValidDateString(value)) {
        return value;
      }

      // Check if the string contains only safe characters
      if (this.isSafeString(value)) {
        return value; // Return as-is if safe
      }

      // For potentially unsafe strings, only remove truly dangerous SQL injection characters
      // Be much more conservative - only remove actual SQL injection threats
      return value.replace(/[';\\x00\\n\\r\\x1a"\\]/g, '');
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Invalid number value');
      }
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    }

    return value;
  }

  /**
   * Check if value is a safe string (contains only safe characters)
   */
  private isSafeString(value: string): boolean {
    // Allow alphanumeric characters, spaces, hyphens, underscores, and common punctuation
    // This is much more permissive than the previous approach
    const safePattern = /^[a-zA-Z0-9\s\-_.,()&]+$/;
    return safePattern.test(value);
  }

  /**
   * Validate if a string is a valid date format (YYYY-MM-DD)
   */
  private isValidDateString(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const date = new Date(dateString);
    return (
      date instanceof Date &&
      !Number.isNaN(date.getTime()) &&
      date.toISOString().split('T')[0] === dateString
    );
  }

  /**
   * Build WHERE clause with parameterized queries
   */
  private async buildWhereClause(
    filters: ChartFilter[],
    context: ChartRenderContext,
    tableName: string = 'agg_app_measures',
    schemaName: string = 'ih'
  ): Promise<{ clause: string; params: unknown[] }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Add security filters based on user context
    if (context.accessible_practices.length > 0) {
      conditions.push(`practice_uid = ANY($${paramIndex})`);
      params.push(context.accessible_practices);
      paramIndex++;
    }

    if (context.accessible_providers.length > 0) {
      conditions.push(`(provider_uid IS NULL OR provider_uid = ANY($${paramIndex}))`);
      params.push(context.accessible_providers);
      paramIndex++;
    }

    // Add user-specified filters
    for (const filter of filters) {
      await this.validateField(filter.field, tableName, schemaName);
      this.validateOperator(filter.operator);

      const sanitizedValue = this.sanitizeValue(filter.value, filter.operator);
      const sqlOperator = ALLOWED_OPERATORS[filter.operator as keyof typeof ALLOWED_OPERATORS];

      if (filter.operator === 'in' || filter.operator === 'not_in') {
        // Use ANY for array parameters in PostgreSQL
        const anyOperator = filter.operator === 'in' ? '= ANY' : '!= ANY';
        conditions.push(`${filter.field} ${anyOperator}($${paramIndex})`);
        params.push(sanitizedValue);
        paramIndex++;
      } else if (filter.operator === 'between') {
        conditions.push(`${filter.field} ${sqlOperator} $${paramIndex} AND $${paramIndex + 1}`);
        if (Array.isArray(sanitizedValue) && sanitizedValue.length >= 2) {
          params.push(sanitizedValue[0], sanitizedValue[1]);
        } else {
          throw new Error('Between operator requires array with two values');
        }
        paramIndex += 2;
      } else {
        conditions.push(`${filter.field} ${sqlOperator} $${paramIndex}`);
        params.push(sanitizedValue);
        paramIndex++;
      }
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }

  /**
   * Get dynamic column mappings from data source metadata
   */
  private async getColumnMappings(tableName: string, schemaName: string): Promise<{
    dateField: string;
    timePeriodField: string;
    measureValueField: string;
    measureTypeField: string;
    allColumns: string[];
  }> {
    const config = await chartConfigService.getDataSourceConfig(tableName, schemaName);

    if (!config) {
      throw new Error(`Data source configuration not found for ${schemaName}.${tableName}`);
    }

    // Find the time period field first (it's the frequency column like 'Daily', 'Weekly', etc.)
    const timePeriodColumn = config.columns.find(col => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';

    // Find the date field - exclude time period field, prefer column named 'date_value' or 'date_index'
    const dateColumn = config.columns.find(col =>
      col.isDateField &&
      col.columnName !== timePeriodField &&
      (col.columnName === 'date_value' || col.columnName === 'date_index' || col.dataType === 'date')
    ) || config.columns.find(col => col.isDateField && col.columnName !== timePeriodField);
    const dateField = dateColumn?.columnName || 'date_index';

    // Find the measure value field
    const measureColumn = config.columns.find(col => col.isMeasure);
    const measureValueField = measureColumn?.columnName || 'measure_value';

    // Find the measure type field
    const measureTypeColumn = config.columns.find(col => col.isMeasureType);
    const measureTypeField = measureTypeColumn?.columnName || 'measure_type';

    // Get all column names
    const allColumns = config.columns.map(col => col.columnName);

    return {
      dateField,
      timePeriodField,
      measureValueField,
      measureTypeField,
      allColumns
    };
  }

  /**
   * Query measures data with security and validation
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    try {
      // If multiple series are requested, handle them separately
      if (params.multiple_series && params.multiple_series.length > 0) {
        return await this.queryMultipleSeries(params, context);
      }

      // If period comparison is requested, handle it separately
      if (params.period_comparison?.enabled) {
        return await this.queryWithPeriodComparison(params, context);
      }

      this.log.info('Building analytics query', {
        params: { ...params, limit: params.limit || 1000 },
        userId: context.user_id,
        contextPractices: context.accessible_practices,
        contextProviders: context.accessible_providers,
      });

      // Get data source configuration if data_source_id is provided
      let _dataSourceConfig = null;
      let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
      let schemaName = 'ih';

      if (params.data_source_id) {
        // Load data source directly from database using chart config service
        const { db, chart_data_sources } = await import('@/lib/db');
        const { eq } = await import('drizzle-orm');

        const [dataSource] = await db
          .select()
          .from(chart_data_sources)
          .where(eq(chart_data_sources.data_source_id, params.data_source_id))
          .limit(1);

        if (dataSource) {
          tableName = dataSource.table_name;
          schemaName = dataSource.schema_name;
          _dataSourceConfig = await chartConfigService.getDataSourceConfig(tableName, schemaName);
        }
      }

      // Validate table access
      await this.validateTable(tableName, schemaName);

      // Get dynamic column mappings from metadata
      const columnMappings = await this.getColumnMappings(tableName, schemaName);

      // Build filters from params - use dynamic column mappings
      const filters: ChartFilter[] = [];

      if (params.measure) {
        filters.push({ field: 'measure', operator: 'eq', value: params.measure });
      }

      if (params.frequency) {
        filters.push({ field: columnMappings.timePeriodField, operator: 'eq', value: params.frequency });
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

      // Build WHERE clause with security context
      const { clause: whereClause, params: queryParams } = await this.buildWhereClause(
        filters,
        context,
        tableName,
        schemaName
      );

      // Build dynamic SELECT column list using metadata
      const selectColumns = columnMappings.allColumns
        .map(col => {
          // Alias special columns for consistent interface
          if (col === columnMappings.dateField) return `${col} as date_index`;
          if (col === columnMappings.timePeriodField) return `${col} as frequency`;
          if (col === columnMappings.measureValueField) return `${col} as measure_value`;
          if (col === columnMappings.measureTypeField) return `${col} as measure_type`;
          return col;
        });

      const query = `
        SELECT ${selectColumns.join(', ')}
        FROM ${schemaName}.${tableName}
        ${whereClause}
        ORDER BY ${columnMappings.dateField} ASC
      `;

      // Execute query
      const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

      // Get appropriate total based on measure_type
      // For currency: sum the values, for count: count the rows
      const totalQuery = `
        SELECT
          CASE
            WHEN ${columnMappings.measureTypeField} = 'currency' THEN SUM(${columnMappings.measureValueField})::text
            ELSE COUNT(*)::text
          END as total,
          ${columnMappings.measureTypeField} as measure_type
        FROM ${schemaName}.${tableName}
        ${whereClause}
        GROUP BY ${columnMappings.measureTypeField}
      `;

      const totalResult = await executeAnalyticsQuery<{ total: string; measure_type: string }>(
        totalQuery,
        queryParams // Use all params since we removed LIMIT/OFFSET
      );

      const queryTime = Date.now() - startTime;

      // Calculate appropriate total based on measure_type
      let totalCount = 0;
      if (totalResult.length > 0) {
        const firstResult = totalResult[0];
        totalCount = parseInt(firstResult?.total || '0', 10);

        // Total calculation completed
      }

      const result: AnalyticsQueryResult = {
        data,
        total_count: totalCount,
        query_time_ms: queryTime,
        cache_hit: false,
      };

      this.log.info('Analytics query completed', {
        queryTime,
        resultCount: data.length,
        totalCount,
        userId: context.user_id,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error('Analytics query failed', {
        error: errorMessage,
        params,
        userId: context.user_id,
      });

      throw new Error(`Query execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute base query without period comparison or multiple series logic
   * Used internally by period comparison to avoid infinite recursion
   */
  private async executeBaseQuery(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    this.log.info('Building analytics query', {
      params: { ...params, limit: params.limit || 1000 },
      userId: context.user_id,
      contextPractices: context.accessible_practices,
      contextProviders: context.accessible_providers,
    });

    // Get data source configuration if data_source_id is provided
    let _dataSourceConfig = null;
    let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
    let schemaName = 'ih';

    if (params.data_source_id) {
      // Load data source directly from database using chart config service
      const { db, chart_data_sources } = await import('@/lib/db');
      const { eq } = await import('drizzle-orm');

      const [dataSource] = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, params.data_source_id))
        .limit(1);

      if (dataSource) {
        tableName = dataSource.table_name;
        schemaName = dataSource.schema_name;
        _dataSourceConfig = await chartConfigService.getDataSourceConfig(tableName, schemaName);
      }
    }

    // Validate table access
    await this.validateTable(tableName, schemaName);

    // Get dynamic column mappings from metadata
    const columnMappings = await this.getColumnMappings(tableName, schemaName);

    // Build filters from params - use dynamic column mappings
    const filters: ChartFilter[] = [];

    if (params.measure) {
      filters.push({ field: 'measure', operator: 'eq', value: params.measure });
    }

    if (params.frequency) {
      filters.push({ field: columnMappings.timePeriodField, operator: 'eq', value: params.frequency });
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

    // Build WHERE clause with security context
    const { clause: whereClause, params: queryParams } = await this.buildWhereClause(
      filters,
      context,
      tableName,
      schemaName
    );

    // Build dynamic SELECT column list using metadata
    const selectColumns = columnMappings.allColumns
      .map(col => {
        // Alias special columns for consistent interface
        if (col === columnMappings.dateField) return `${col} as date_index`;
        if (col === columnMappings.timePeriodField) return `${col} as frequency`;
        if (col === columnMappings.measureValueField) return `${col} as measure_value`;
        if (col === columnMappings.measureTypeField) return `${col} as measure_type`;
        return col;
      });

    const query = `
      SELECT ${selectColumns.join(', ')}
      FROM ${schemaName}.${tableName}
      ${whereClause}
      ORDER BY ${columnMappings.dateField} ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

    // Get appropriate total based on measure_type
    // For currency: sum the values, for count: count the rows
    const totalQuery = `
      SELECT
        CASE
          WHEN ${columnMappings.measureTypeField} = 'currency' THEN SUM(${columnMappings.measureValueField})::text
          ELSE COUNT(*)::text
        END as total,
        ${columnMappings.measureTypeField} as measure_type
      FROM ${schemaName}.${tableName}
      ${whereClause}
      GROUP BY ${columnMappings.measureTypeField}
    `;

    const totalResult = await executeAnalyticsQuery<{ total: string; measure_type: string }>(
      totalQuery,
      queryParams // Use all params since we removed LIMIT/OFFSET
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

    this.log.info('Analytics query completed', {
      queryTime,
      resultCount: data.length,
      totalCount,
      userId: context.user_id,
    });

    return result;
  }

  /**
   * Query multiple series data efficiently using WHERE measure IN (...)
   */
  private async queryMultipleSeries(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.multiple_series || params.multiple_series.length === 0) {
      throw new Error('Multiple series configuration is required');
    }

    this.log.info('Building efficient multiple series analytics query', {
      seriesCount: params.multiple_series.length,
      measures: params.multiple_series.map((s) => s.measure),
      userId: context.user_id,
    });

    // Get data source configuration if data_source_id is provided
    let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
    let schemaName = 'ih';

    if (params.data_source_id) {
      // Load data source directly from database using chart config service
      const { db, chart_data_sources } = await import('@/lib/db');
      const { eq } = await import('drizzle-orm');

      const [dataSource] = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, params.data_source_id))
        .limit(1);

      if (dataSource) {
        tableName = dataSource.table_name;
        schemaName = dataSource.schema_name;
      }
    }

    // Validate table access
    await this.validateTable(tableName, schemaName);

    // Get dynamic column mappings from metadata
    const columnMappings = await this.getColumnMappings(tableName, schemaName);

    // Build filters from params (excluding measure - we'll handle that separately)
    const filters: ChartFilter[] = [];

    // Add multiple measures using IN operator for efficiency
    const measures = params.multiple_series.map((s) => s.measure);
    filters.push({ field: 'measure', operator: 'in', value: measures });

    if (params.frequency) {
      filters.push({ field: columnMappings.timePeriodField, operator: 'eq', value: params.frequency });
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

    // Build WHERE clause with security context
    const { clause: whereClause, params: queryParams } = await this.buildWhereClause(
      filters,
      context,
      tableName,
      schemaName
    );

    // Build dynamic SELECT column list using metadata
    const selectColumns = columnMappings.allColumns
      .map(col => {
        // Alias special columns for consistent interface
        if (col === columnMappings.dateField) return `${col} as date_index`;
        if (col === columnMappings.timePeriodField) return `${col} as frequency`;
        if (col === columnMappings.measureValueField) return `${col} as measure_value`;
        if (col === columnMappings.measureTypeField) return `${col} as measure_type`;
        return col;
      });

    const query = `
      SELECT ${selectColumns.join(', ')}
      FROM ${schemaName}.${tableName}
      ${whereClause}
      ORDER BY measure, ${columnMappings.dateField} ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

    // Add series metadata to each data point
    const enhancedData = data.map((item) => {
      const seriesConfig = params.multiple_series?.find((s) => s.measure === item.measure);
      return {
        ...item,
        series_id: seriesConfig?.id || item.measure,
        series_label: seriesConfig?.label || item.measure,
        series_aggregation: seriesConfig?.aggregation || 'sum',
        ...(seriesConfig?.color && { series_color: seriesConfig.color }),
      };
    });

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM ${schemaName}.${tableName}
      ${whereClause}
    `;

    const countResult = await executeAnalyticsQuery<{ count: number }>(countQuery, queryParams);
    const totalCount = countResult[0]?.count || 0;

    const result: AnalyticsQueryResult = {
      data: enhancedData,
      total_count: totalCount,
      query_time_ms: Date.now() - startTime,
      cache_hit: false, // Multiple series queries are not cached yet
    };

    this.log.info('Efficient multiple series query completed', {
      seriesCount: params.multiple_series.length,
      totalRecords: enhancedData.length,
      queryTime: result.query_time_ms,
      userId: context.user_id,
      measuresQueried: measures,
    });

    return result;
  }

  /**
   * Query data with period comparison support
   */
  private async queryWithPeriodComparison(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
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

    this.log.info('Building period comparison analytics query', {
      comparisonType: params.period_comparison.comparisonType,
      frequency: params.frequency,
      currentRange: { start: params.start_date, end: params.end_date },
      userId: context.user_id,
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
      this.log.error('Failed to calculate comparison date range', {
        error: error instanceof Error ? error.message : 'Unknown error',
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
        this.executeBaseQuery(params, context),
        this.executeBaseQuery(comparisonParams, context),
      ]);
    } catch (error) {
      this.log.error('Failed to execute period comparison queries', {
        error: error instanceof Error ? error.message : 'Unknown error',
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
      this.log.warn('No data found for current period', {
        comparisonType: params.period_comparison.comparisonType,
        currentRange: { start: params.start_date, end: params.end_date },
      });
    }

    if (!comparisonResult.data || comparisonResult.data.length === 0) {
      this.log.warn('No data found for comparison period', {
        comparisonType: params.period_comparison.comparisonType,
        comparisonRange,
      });
    }

    // Add comparison metadata to comparison data
    const comparisonLabel = generateComparisonLabel(params.frequency, params.period_comparison);
    const enhancedComparisonData = (comparisonResult.data || []).map((item) => ({
      ...item,
      series_id: 'comparison',
      series_label: comparisonLabel,
      series_aggregation: 'sum' as const,
    }));

    // Add current period metadata to current data
    const enhancedCurrentData = (currentResult.data || []).map((item) => ({
      ...item,
      series_id: 'current',
      series_label: 'Current Period',
      series_aggregation: 'sum' as const,
    }));

    // Combine results
    const combinedData = [...enhancedCurrentData, ...enhancedComparisonData];

    const result: AnalyticsQueryResult = {
      data: combinedData,
      total_count: currentResult.total_count + comparisonResult.total_count,
      query_time_ms: Date.now() - startTime,
      cache_hit: false,
    };

    this.log.info('Period comparison query completed', {
      comparisonType: params.period_comparison.comparisonType,
      currentRecords: enhancedCurrentData.length,
      comparisonRecords: enhancedComparisonData.length,
      totalRecords: combinedData.length,
      queryTime: result.query_time_ms,
      userId: context.user_id,
      comparisonRange,
    });

    return result;
  }

  /**
   * Get practice revenue trend data (common use case)
   */
  async getPracticeRevenueTrend(
    context: ChartRenderContext,
    practiceUid?: string,
    months: number = 12
  ): Promise<AggAppMeasure[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const params: AnalyticsQueryParams = {
      measure: 'Charges by Provider',
      frequency: 'Monthly',
      start_date: startDateStr,
      end_date: endDateStr,
      limit: months * 2, // Buffer for multiple practices
    };

    if (practiceUid) {
      params.practice_uid = parseInt(practiceUid, 10);
    }

    const result = await this.queryMeasures(params, context);
    return result.data;
  }

  /**
   * Process advanced filters into query filters
   */
  private processAdvancedFilters(
    advancedFilters:
      | ChartFilter[]
      | { conditions?: Array<{ field: string; operator: string; value: unknown }> }
      | undefined
  ): ChartFilter[] {
    const filters: ChartFilter[] = [];

    if (!advancedFilters) {
      return filters;
    }

    // Handle direct ChartFilter array
    if (Array.isArray(advancedFilters)) {
      return advancedFilters;
    }

    // Handle object with conditions property
    if (!advancedFilters.conditions || !Array.isArray(advancedFilters.conditions)) {
      return filters;
    }

    // Process each condition in the advanced filters
    for (const condition of advancedFilters.conditions) {
      if (condition.field && condition.operator && condition.value !== undefined) {
        // Map advanced filter operators to query filter operators
        let operator = condition.operator;
        let value = condition.value;

        switch (condition.operator) {
          case 'equals':
            operator = 'eq';
            break;
          case 'not_equals':
            operator = 'ne';
            break;
          case 'greater_than':
            operator = 'gt';
            break;
          case 'greater_than_or_equal':
            operator = 'gte';
            break;
          case 'less_than':
            operator = 'lt';
            break;
          case 'less_than_or_equal':
            operator = 'lte';
            break;
          case 'contains':
            operator = 'like';
            value = `%${value}%`;
            break;
          case 'starts_with':
            operator = 'like';
            value = `${value}%`;
            break;
          case 'ends_with':
            operator = 'like';
            value = `%${value}`;
            break;
          case 'in':
            operator = 'in';
            break;
          case 'not_in':
            operator = 'not_in';
            break;
        }

        // Ensure value is compatible with ChartFilterValue
        const chartFilterValue: ChartFilterValue =
          typeof value === 'string' || typeof value === 'number' || Array.isArray(value)
            ? (value as ChartFilterValue)
            : String(value);

        filters.push({
          field: condition.field,
          operator: operator as ChartFilter['operator'],
          value: chartFilterValue,
        });
      }
    }

    return filters;
  }
}

// Export singleton instance
export const analyticsQueryBuilder = new AnalyticsQueryBuilder();
