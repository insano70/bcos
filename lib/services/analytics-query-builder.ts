import type { 
  AggAppMeasure, 
  AnalyticsQueryParams, 
  AnalyticsQueryResult,
  ChartFilter,
  ChartFilterValue,
  ChartOrderBy,
  ChartRenderContext 
} from '@/lib/types/analytics';
import { executeAnalyticsQuery } from './analytics-db';
import { analyticsCache } from './analytics-cache';
import { chartConfigService } from './chart-config-service';
import { logger } from '@/lib/logger';

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
  between: 'BETWEEN'
} as const;

/**
 * Secure Query Builder Class
 */
export class AnalyticsQueryBuilder {
  private logger = logger;

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
  private async validateField(fieldName: string, tableName: string, schemaName: string = 'ih'): Promise<void> {
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
      return value.map(v => this.sanitizeSingleValue(v));
    }

    // Handle BETWEEN operator
    if (operator === 'between') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error('BETWEEN operator requires array with exactly 2 values');
      }
      return value.map(v => this.sanitizeSingleValue(v));
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
    return date instanceof Date && !isNaN(date.getTime()) && 
           date.toISOString().split('T')[0] === dateString;
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
   * Build ORDER BY clause
   */
  private async buildOrderByClause(orderBy: ChartOrderBy[], tableName: string = 'agg_app_measures', schemaName: string = 'ih'): Promise<string> {
    if (orderBy.length === 0) {
      const defaultDateField = tableName === 'agg_chart_data' ? 'date_value' : 'date_index';
      return `ORDER BY ${defaultDateField} DESC`; // Default ordering
    }

    const orderClauses = await Promise.all(orderBy.map(async order => {
      await this.validateField(order.field, tableName, schemaName);
      const direction = order.direction === 'ASC' ? 'ASC' : 'DESC';
      return `${order.field} ${direction}`;
    }));

    return `ORDER BY ${orderClauses.join(', ')}`;
  }

  /**
   * Get the measure type column name for a data source
   */
  private async getMeasureTypeColumn(dataSourceId: number): Promise<string | null> {
    try {
      // Query for the column marked as measure type indicator
      const result = await executeAnalyticsQuery<{ column_name: string }>(`
        SELECT column_name 
        FROM chart_data_source_columns 
        WHERE data_source_id = $1 AND is_measure_type = true AND is_active = true
        LIMIT 1
      `, [dataSourceId]);
      
      return result && result.length > 0 ? result[0]?.column_name || null : null;
    } catch (error) {
      this.logger.warn('Failed to get measure type column', { dataSourceId, error });
      return null;
    }
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

      // Check cache first
      const cachedResult = analyticsCache.get(params, context.user_id);
      if (cachedResult) {
        this.logger.info('Analytics query served from cache', {
          params,
          userId: context.user_id,
          cacheAge: typeof cachedResult === 'object' && cachedResult !== null && 'timestamp' in cachedResult && typeof cachedResult.timestamp === 'number' 
            ? Date.now() - cachedResult.timestamp 
            : 0
        });
        return cachedResult;
      }

      this.logger.info('Building analytics query', { 
        params: { ...params, limit: params.limit || 1000 },
        userId: context.user_id,
        contextPractices: context.accessible_practices,
        contextProviders: context.accessible_providers
      });

      // Get data source configuration if data_source_id is provided
      let dataSourceConfig = null;
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
          dataSourceConfig = await chartConfigService.getDataSourceConfig(tableName, schemaName);
        }
      }

      // Validate table access
      await this.validateTable(tableName, schemaName);

      // Build filters from params - use column mappings if available
      const filters: ChartFilter[] = [];
      
      // Define field mappings based on table type
      const mainDateField = tableName === 'agg_chart_data' ? 'date_value' : 'date_index';
      const mainFrequencyField = tableName === 'agg_chart_data' ? 'time_period' : 'frequency';
      
      if (params.measure) {
        filters.push({ field: 'measure', operator: 'eq', value: params.measure });
      }
      
      if (params.frequency) {
        filters.push({ field: mainFrequencyField, operator: 'eq', value: params.frequency });
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
        filters.push({ field: mainDateField, operator: 'gte', value: params.start_date });
      }
      
      if (params.end_date) {
        filters.push({ field: mainDateField, operator: 'lte', value: params.end_date });
      }

      // Process advanced filters if provided
      if (params.advanced_filters) {
        const advancedFilters = this.processAdvancedFilters(params.advanced_filters);
        filters.push(...advancedFilters);
      }

      // Build WHERE clause with security context
      const { clause: whereClause, params: queryParams } = await this.buildWhereClause(filters, context, tableName, schemaName);

      // Build complete query for pre-aggregated data
      // Build the query with dynamic table name and column mapping
      const mainQueryDateField = tableName === 'agg_chart_data' ? 'date_value' : 'date_index';
      const valueField = tableName === 'agg_chart_data' ? 'numeric_value' : 'measure_value';
      const mainQueryFrequencyField = tableName === 'agg_chart_data' ? 'time_period' : 'frequency';
      
      // Get the dynamic measure type column name for this data source
      let measureTypeColumn = 'measure_type'; // Default fallback
      if (params.data_source_id) {
        const dynamicMeasureTypeColumn = await this.getMeasureTypeColumn(params.data_source_id);
        if (dynamicMeasureTypeColumn) {
          measureTypeColumn = dynamicMeasureTypeColumn;
        }
      }
      
      const query = `
        SELECT 
          practice,
          practice_primary,
          practice_uid,
          provider_name,
          measure,
          ${mainQueryFrequencyField} as frequency,
          ${mainQueryDateField} as date_index,
          ${valueField} as measure_value,
          ${measureTypeColumn} as measure_type
        FROM ${schemaName}.${tableName}
        ${whereClause}
        ORDER BY ${mainQueryDateField} ASC
      `;

      // Execute query
      const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

      // Get appropriate total based on measure_type
      // For currency: sum the values, for count: count the rows
      const totalQuery = `
        SELECT 
          CASE 
            WHEN ${measureTypeColumn} = 'currency' THEN SUM(${valueField})::text
            ELSE COUNT(*)::text
          END as total,
          ${measureTypeColumn} as measure_type
        FROM ${schemaName}.${tableName}
        ${whereClause}
        GROUP BY ${measureTypeColumn}
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
        cache_hit: false
      };

      // Cache the result
      analyticsCache.set(params, context.user_id, result);

      this.logger.info('Analytics query completed', {
        queryTime,
        resultCount: data.length,
        totalCount,
        userId: context.user_id,
        cached: true
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Analytics query failed', { 
        error: errorMessage,
        params,
        userId: context.user_id
      });
      
      throw new Error(`Query execution failed: ${errorMessage}`);
    }
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

    this.logger.info('Building efficient multiple series analytics query', {
      seriesCount: params.multiple_series.length,
      measures: params.multiple_series.map(s => s.measure),
      userId: context.user_id
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

    // Build filters from params (excluding measure - we'll handle that separately)
    const filters: ChartFilter[] = [];
    
    // Use column mappings based on table type
    const msDateField = tableName === 'agg_chart_data' ? 'date_value' : 'date_index';
    const msFrequencyField = tableName === 'agg_chart_data' ? 'time_period' : 'frequency';
    
    // Add multiple measures using IN operator for efficiency
    const measures = params.multiple_series.map(s => s.measure);
    filters.push({ field: 'measure', operator: 'in', value: measures });
    
    if (params.frequency) {
      filters.push({ field: msFrequencyField, operator: 'eq', value: params.frequency });
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
        filters.push({ field: 'date_index', operator: 'gte', value: params.start_date });
      }
      
      if (params.end_date) {
        filters.push({ field: 'date_index', operator: 'lte', value: params.end_date });
      }

    // Process advanced filters if provided
    if (params.advanced_filters) {
      const advancedFilters = this.processAdvancedFilters(params.advanced_filters);
      filters.push(...advancedFilters);
    }

    // Build WHERE clause with security context
    const { clause: whereClause, params: queryParams } = await this.buildWhereClause(filters, context);

    // Build complete query for pre-aggregated data with dynamic table and column mapping
    const msValueField = tableName === 'agg_chart_data' ? 'numeric_value' : 'measure_value';
    
    const query = `
      SELECT 
        practice,
        practice_primary,
        practice_uid,
        provider_name,
        measure,
        ${msFrequencyField} as frequency,
        ${msDateField} as date_index,
        ${msValueField} as measure_value,
        measure_type
      FROM ${schemaName}.${tableName}
      ${whereClause}
      ORDER BY measure, ${msDateField} ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);
    
    // Add series metadata to each data point
    const enhancedData = data.map(item => {
      const seriesConfig = params.multiple_series!.find(s => s.measure === item.measure);
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
      FROM ih.agg_app_measures
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

    this.logger.info('Efficient multiple series query completed', {
      seriesCount: params.multiple_series.length,
      totalRecords: enhancedData.length,
      queryTime: result.query_time_ms,
      userId: context.user_id,
      measuresQueried: measures
    });

    return result;
  }

  /**
   * Execute a single series query (used internally by queryMultipleSeries)
   */
  private async querySingleSeries(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    // Get data source configuration if data_source_id is provided
    let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
    let schemaName = 'ih';

    if (params.data_source_id) {
      // Load data source directly from database
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

    // Build filters from params
    const filters: ChartFilter[] = [];
    
    // Define field mappings based on table type
    const dateField = tableName === 'agg_chart_data' ? 'date_value' : 'date_index';
    const frequencyField = tableName === 'agg_chart_data' ? 'time_period' : 'frequency';
    
    if (params.measure) {
      filters.push({ field: 'measure', operator: 'eq', value: params.measure });
    }
    
    if (params.frequency) {
      filters.push({ field: frequencyField, operator: 'eq', value: params.frequency });
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
        filters.push({ field: 'date_index', operator: 'gte', value: params.start_date });
      }
      
      if (params.end_date) {
        filters.push({ field: 'date_index', operator: 'lte', value: params.end_date });
      }

    // Process advanced filters if provided
    if (params.advanced_filters) {
      const advancedFilters = this.processAdvancedFilters(params.advanced_filters);
      filters.push(...advancedFilters);
    }

    // Build WHERE clause with security context
    const { clause: whereClause, params: queryParams } = await this.buildWhereClause(filters, context);

    // Build complete query for pre-aggregated data
    const query = `
      SELECT 
        practice,
        practice_primary,
        practice_uid,
        provider_name,
        measure,
        frequency,
        date_index,
        measure_value,
        measure_type
      FROM ih.agg_app_measures
      ${whereClause}
      ORDER BY date_index ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM ih.agg_app_measures
      ${whereClause}
    `;

    const countResult = await executeAnalyticsQuery<{ count: number }>(countQuery, queryParams);
    const totalCount = countResult[0]?.count || 0;

    return {
      data,
      total_count: totalCount,
      query_time_ms: 0, // Will be calculated by parent method
      cache_hit: false,
    };
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
  private processAdvancedFilters(advancedFilters: ChartFilter[] | { conditions?: Array<{ field: string; operator: string; value: unknown }> } | undefined): ChartFilter[] {
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
            ? value as ChartFilterValue
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
