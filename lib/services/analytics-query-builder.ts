import { log } from '@/lib/logger';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartFilter,
  ChartFilterValue,
  ChartRenderContext,
} from '@/lib/types/analytics';
import { MeasureAccessor } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
// Redis cache integration for data source query results
import { dataSourceCache, type CacheQueryParams } from '@/lib/cache';
// Note: Query result caching removed - was in-memory only and not effective across serverless instances
// Metadata caching (columns, dashboards, charts) handled by @/lib/cache/analytics-cache
import { executeAnalyticsQuery } from './analytics-db';
import { chartConfigService } from './chart-config-service';
import { columnMappingService } from './column-mapping-service';

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
   * If dataSourceConfig is provided, skip the lookup for efficiency
   */
  private async validateTable(
    tableName: string,
    schemaName: string = 'ih',
    dataSourceConfig?: import('@/lib/services/chart-config-service').DataSourceConfig | null
  ): Promise<void> {
    const config = dataSourceConfig || await chartConfigService.getDataSourceConfig(tableName, schemaName);
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
    schemaName: string = 'ih',
    dataSourceConfig?: import('@/lib/services/chart-config-service').DataSourceConfig | null
  ): Promise<void> {
    // Use provided config to avoid redundant lookup
    const allowedFields = dataSourceConfig
      ? dataSourceConfig.columns.map((col) => col.columnName)
      : await chartConfigService.getAllowedFields(tableName, schemaName);

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
    schemaName: string = 'ih',
    dataSourceConfig?: import('@/lib/services/chart-config-service').DataSourceConfig | null
  ): Promise<{ clause: string; params: unknown[] }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Add security filters based on user context
    
    // PRACTICE_UID FILTERING (organization-level security)
    if (context.accessible_practices.length > 0) {
      conditions.push(`practice_uid = ANY($${paramIndex})`);
      params.push(context.accessible_practices);

      // Enhanced security audit logging
      log.info('Applied practice_uid security filter', {
        userId: context.user_id,
        permissionScope: context.permission_scope,
        practiceUidCount: context.accessible_practices.length,
        practiceUids: context.accessible_practices,
        includesHierarchy: context.includes_hierarchy,
        organizationIds: context.organization_ids,
        filterType: 'organization-level',
      });

      paramIndex++;
    } else if (context.permission_scope === 'organization') {
      // FAIL-CLOSED SECURITY: Organization user with no practice_uids
      log.security('Organization user has no accessible practice_uids - query will return empty results', 'medium', {
        userId: context.user_id,
        organizationCount: context.organization_ids?.length || 0,
        organizationIds: context.organization_ids,
        failedClosed: true,
        reason: 'empty_practice_uids',
      });
    } else if (context.permission_scope === 'all') {
      // Super admin: no practice_uid filtering
      log.info('Super admin access - no practice_uid filtering applied', {
        userId: context.user_id,
        permissionScope: 'all',
        filterType: 'none',
      });
    }

    // PROVIDER_UID FILTERING (provider-level security)
    if (context.accessible_providers.length > 0) {
      // Allow NULL provider_uid OR matching provider_uid
      // (NULL = system-level data not tied to specific provider)
      conditions.push(`(provider_uid IS NULL OR provider_uid = ANY($${paramIndex}))`);
      params.push(context.accessible_providers);

      // Enhanced security audit logging
      log.info('Applied provider_uid security filter', {
        userId: context.user_id,
        permissionScope: context.permission_scope,
        providerUidCount: context.accessible_providers.length,
        providerUids: context.accessible_providers,
        filterType: 'provider-level',
        allowsNullProviderUid: true,
      });

      paramIndex++;
    } else if (context.permission_scope === 'own') {
      // FAIL-CLOSED SECURITY: Provider user with no provider_uid
      log.security('Provider user has no provider_uid - query will return empty results', 'medium', {
        userId: context.user_id,
        providerUid: context.provider_uid,
        failedClosed: true,
        reason: 'empty_provider_uid',
      });
    }

    // Add user-specified filters
    for (const filter of filters) {
      await this.validateField(filter.field, tableName, schemaName, dataSourceConfig);
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
   * If dataSourceConfig is provided, skip the lookup for efficiency
   */
  private async getColumnMappings(
    tableName: string,
    schemaName: string,
    dataSourceConfig?: import('@/lib/services/chart-config-service').DataSourceConfig | null
  ): Promise<{
    dateField: string;
    timePeriodField: string;
    measureValueField: string;
    measureTypeField: string;
    allColumns: string[];
  }> {
    const config = dataSourceConfig || await chartConfigService.getDataSourceConfig(tableName, schemaName);

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
   * Extract provider_uid from params
   * Checks params.provider_uid and advanced_filters
   */
  private extractProviderUid(params: AnalyticsQueryParams): number | undefined {
    // Direct provider_uid param
    if (params.provider_uid) {
      return typeof params.provider_uid === 'number'
        ? params.provider_uid
        : parseInt(String(params.provider_uid), 10);
    }

    // Check advanced filters for provider_uid
    if (params.advanced_filters) {
      const providerFilter = params.advanced_filters.find(
        (f) => f.field === 'provider_uid' && f.operator === 'eq'
      );
      
      if (providerFilter && typeof providerFilter.value === 'number') {
        return providerFilter.value;
      }
    }

    return undefined;
  }

  /**
   * Calculate total count from filtered rows using MeasureAccessor
   * For currency: sum measure values, for others: count rows
   * 
   * @param rows - The data rows
   * @param dataSourceId - Data source ID for column mapping
   */
  private async calculateTotal(rows: AggAppMeasure[], dataSourceId: number): Promise<number> {
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

    if (measureType === 'currency') {
      // Sum all measure values using accessor
      return rows.reduce((sum, row) => {
        const rowAccessor = new MeasureAccessor(row, mapping);
        return sum + rowAccessor.getMeasureValue();
      }, 0);
    }

    // For count, just return row count
    return rows.length;
  }

  /**
   * Query measures data with security and validation
   * Now integrates with Redis cache for data source query results
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    // Determine if we received UserContext or ChartRenderContext
    // UserContext has more fields (email, first_name, etc.)
    const isUserContext = 'email' in contextOrUserContext;
    const userContext = isUserContext ? (contextOrUserContext as UserContext) : undefined;
    const context = isUserContext ? undefined : (contextOrUserContext as ChartRenderContext);
    const userId = isUserContext ? userContext?.user_id : context?.user_id;

    try {

      // If multiple series are requested, handle them separately
      if (params.multiple_series && params.multiple_series.length > 0) {
        return await this.queryMultipleSeries(params, contextOrUserContext);
      }

      // If period comparison is requested, handle it separately
      if (params.period_comparison?.enabled) {
        return await this.queryWithPeriodComparison(params, contextOrUserContext);
      }

      this.log.info('Building analytics query with caching', {
        params: { ...params, limit: params.limit || 1000 },
        userId,
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
      await this.validateTable(tableName, schemaName, dataSourceConfig);

      // ===== NEW: CACHE INTEGRATION =====
      
      // If we have UserContext, use cache (preferred path)
      if (isUserContext && userContext && params.data_source_id) {
        // Extract provider_uid from params
        const providerUid = this.extractProviderUid(params);

        // Build cache query params
        const cacheParams: CacheQueryParams = {
          dataSourceId: params.data_source_id,
          schema: schemaName,
          table: tableName,
          
          // Cache key components (only include if defined)
          ...(params.measure && { measure: params.measure }),
          ...(params.practice_uid && { practiceUid: params.practice_uid }),
          ...(providerUid && { providerUid: providerUid }),
          ...(params.frequency && { frequency: params.frequency }),
          
          // In-memory filters (NOT in cache key)
          ...(params.start_date && { startDate: params.start_date }),
          ...(params.end_date && { endDate: params.end_date }),
          ...(params.advanced_filters && { advancedFilters: params.advanced_filters }),
        };

        // Fetch with caching (passing UserContext - ChartRenderContext built internally)
        const fetchResult = await dataSourceCache.fetchDataSource(
          cacheParams,
          userContext, // Pass UserContext (fetchDataSource builds ChartRenderContext internally)
          params.nocache || false
        );

        // Calculate total using MeasureAccessor for dynamic column access
        const totalCount = await this.calculateTotal(fetchResult.rows as AggAppMeasure[], params.data_source_id);

        const duration = Date.now() - startTime;

        const result: AnalyticsQueryResult = {
          data: fetchResult.rows as AggAppMeasure[],
          total_count: totalCount,
          query_time_ms: duration,
          cache_hit: fetchResult.cacheHit, // Now accurate!
        };

        this.log.info('Analytics query completed (with caching)', {
          dataSourceId: params.data_source_id,
          measure: params.measure,
          practiceUid: params.practice_uid,
          rowCount: fetchResult.rows.length,
          totalCount,
          duration,
          cacheHit: fetchResult.cacheHit,
          userId: userContext.user_id,
        });

        return result;
      }

      // ===== FALLBACK: LEGACY PATH (for ChartRenderContext or missing data_source_id) =====
      
      // If we have UserContext but no data_source_id, build ChartRenderContext for legacy path
      let legacyContext = context;
      if (isUserContext && userContext && !context) {
        const { buildChartRenderContext } = await import('@/lib/utils/chart-context');
        legacyContext = await buildChartRenderContext(userContext);
        this.log.info('Built ChartRenderContext for legacy path', {
          userId: userContext.user_id,
          permissionScope: legacyContext.permission_scope,
          reason: 'missing_data_source_id',
        });
      }
      
      // Get dynamic column mappings from metadata - pass config to avoid redundant lookup
      const columnMappings = await this.getColumnMappings(tableName, schemaName, dataSourceConfig);

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

      // Build WHERE clause with security context - pass config to avoid redundant lookups
      // Note: legacyContext is now guaranteed to be defined (built from UserContext if needed)
      const { clause: whereClause, params: queryParams } = await this.buildWhereClause(
        filters,
        legacyContext as ChartRenderContext,
        tableName,
        schemaName,
        dataSourceConfig
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

      this.log.info('Analytics query completed (legacy path)', {
        queryTime,
        resultCount: data.length,
        totalCount,
        userId: userId,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error('Analytics query failed', {
        error: errorMessage,
        params,
        userId: userId,
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
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    const isUserContext = 'email' in contextOrUserContext;
    const context = isUserContext ? undefined : (contextOrUserContext as ChartRenderContext);
    const userId = isUserContext ? (contextOrUserContext as UserContext).user_id : context?.user_id;
    const startTime = Date.now();

    this.log.info('Building analytics query (legacy path)', {
      params: { ...params, limit: params.limit || 1000 },
      userId,
    });

    // Get data source configuration if data_source_id is provided
    let _dataSourceConfig = null;
    let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
    let schemaName = 'ih';

    if (params.data_source_id) {
      // Use data_source_id directly to get config from cache
      _dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);

      if (_dataSourceConfig) {
        tableName = _dataSourceConfig.tableName;
        schemaName = _dataSourceConfig.schemaName;
      }
    }

    // Validate table access - pass config to avoid redundant lookup
    await this.validateTable(tableName, schemaName, _dataSourceConfig);

    // Get dynamic column mappings from metadata - pass config to avoid redundant lookup
    const columnMappings = await this.getColumnMappings(tableName, schemaName, _dataSourceConfig);

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

    // Build WHERE clause with security context - pass config to avoid redundant lookups
    // Note: context is guaranteed to be defined if not UserContext
    const { clause: whereClause, params: queryParams } = await this.buildWhereClause(
      filters,
      context as ChartRenderContext,
      tableName,
      schemaName,
      _dataSourceConfig
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

    this.log.info('Analytics query completed (legacy path)', {
      queryTime,
      resultCount: data.length,
      totalCount,
      userId,
    });

    return result;
  }

  /**
   * Query multiple series data efficiently using WHERE measure IN (...)
   */
  private async queryMultipleSeries(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.multiple_series || params.multiple_series.length === 0) {
      throw new Error('Multiple series configuration is required');
    }

    const isUserContext = 'email' in contextOrUserContext;
    const userId = isUserContext ? (contextOrUserContext as UserContext).user_id : (contextOrUserContext as ChartRenderContext).user_id;

    this.log.info('Building multiple series query with caching', {
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
      const result = await this.queryMeasures(seriesParams, contextOrUserContext);

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

    this.log.info('Multiple series query completed (with caching)', {
      seriesCount: params.multiple_series.length,
      totalRecords: combinedData.length,
      queryTime: duration,
      userId,
    });

    return result;
  }

  /**
   * Query data with period comparison support
   */
  private async queryWithPeriodComparison(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    // Already works with cache because it calls executeBaseQuery() which calls queryMeasures()
    // queryMeasures() now uses cache when UserContext is provided
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
    const userId = isUserContext ? (contextOrUserContext as UserContext).user_id : (contextOrUserContext as ChartRenderContext).user_id;

    this.log.info('Building period comparison analytics query', {
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
        this.executeBaseQuery(params, contextOrUserContext),
        this.executeBaseQuery(comparisonParams, contextOrUserContext),
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
      userId,
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
