/**
 * Data Source Query Service
 *
 * Responsible for building and executing database queries for analytics data.
 *
 * RESPONSIBILITIES:
 * - Build SQL SELECT queries for data sources
 * - Execute queries via executeAnalyticsQuery()
 * - Apply explicit chart filters (practice_uid, provider_uid, frequency)
 * - Apply advanced filters (dashboard universal filters)
 * - Column name resolution (dynamic field mapping)
 *
 * SECURITY:
 * - Field validation via query-validator (before this layer)
 * - Parameterized queries prevent SQL injection
 * - Table authorization checks
 *
 * ARCHITECTURE:
 * - Does NOT apply RBAC filtering (done in-memory by rbac-filter-service)
 * - Does NOT cache (done by data-source-cache)
 * - Pure query building and execution
 */

import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { queryBuilder } from './query-builder';
import { queryValidator } from './query-validator';

/**
 * Query parameters for database queries
 */
export interface DataSourceQueryParams {
  dataSourceId: number;
  schema: string;
  table: string;
  dataSourceType?: 'measure-based' | 'table-based';
  measure?: string; // Required for measure-based, N/A for table-based
  practiceUid?: number;
  providerUid?: number;
  frequency?: string; // Required for measure-based, N/A for table-based
  startDate?: string;
  endDate?: string;
  advancedFilters?: ChartFilter[];
}

/**
 * Data Source Query Service
 * Handles database query building and execution
 */
export class DataSourceQueryService {
  /**
   * Query database with explicit chart filters
   * Builds SELECT query with WHERE clause based on parameters
   *
   * IMPORTANT:
   * - Does NOT apply RBAC filtering here (done in-memory after cache/DB fetch)
   * - DOES apply explicit chart filters (practice_uid, provider_uid, dashboard universal filters)
   * - DOES apply advancedFilters (dashboard universal filters like organization → practices)
   * - DOES validate all filter field names against data source configuration
   *
   * This allows maximum cache reuse while respecting explicit chart-level filters
   *
   * @param params - Query parameters
   * @param userContext - User context for field validation
   * @returns Query results
   */
  async queryDataSource(
    params: DataSourceQueryParams,
    userContext: UserContext
  ): Promise<Record<string, unknown>[]> {
    const {
      schema,
      table,
      measure,
      practiceUid,
      providerUid,
      frequency,
      advancedFilters,
      dataSourceId,
    } = params;

    // Get data source config to determine correct column names
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);
    if (!dataSourceConfig) {
      const error = new Error(`Data source not found: ${dataSourceId}`);
      log.error('Data source configuration not found', error, {
        dataSourceId,
        schema,
        table,
        operation: 'queryDataSource',
        component: 'data-source-query-service',
      });
      throw error;
    }

    // Determine the time period column name (could be 'frequency', 'time_period', or custom)
    const timePeriodColumn = dataSourceConfig.columns.find((col) => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';

    // Determine the date field column name (could be 'date_index', 'date_value', or custom)
    const dateColumn =
      dataSourceConfig.columns.find(
        (col) =>
          col.isDateField &&
          col.columnName !== timePeriodField &&
          (col.columnName === 'date_value' ||
            col.columnName === 'date_index' ||
            col.dataType === 'date')
      ) ||
      dataSourceConfig.columns.find((col) => col.isDateField && col.columnName !== timePeriodField);
    const dateField = dateColumn?.columnName || 'date_index';

    // Build WHERE clause (explicit chart filters only, NOT RBAC)
    const whereClauses: string[] = [];
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (measure) {
      whereClauses.push(`measure = $${paramIndex++}`);
      queryParams.push(measure);
    }

    // Only filter by practice_uid if explicitly specified in chart config
    if (practiceUid) {
      whereClauses.push(`practice_uid = $${paramIndex++}`);
      queryParams.push(practiceUid);
    }

    if (providerUid) {
      whereClauses.push(`provider_uid = $${paramIndex++}`);
      queryParams.push(providerUid);
    }

    if (frequency) {
      // Use the correct column name from data source config
      whereClauses.push(`${timePeriodField} = $${paramIndex++}`);
      queryParams.push(frequency);
    }

    // CRITICAL: Validate and apply advanced filters (dashboard universal filters)
    // This includes organizationId → practiceUids conversion
    if (advancedFilters && advancedFilters.length > 0) {
      // SECURITY: Validate filter fields before building SQL
      await queryValidator.validateFilterFields(advancedFilters, dataSourceId, userContext);

      const advancedResult = await queryBuilder.buildAdvancedFilterClause(
        advancedFilters,
        paramIndex
      );
      if (advancedResult.clause) {
        whereClauses.push(advancedResult.clause);
        queryParams.push(...advancedResult.params);
        paramIndex = advancedResult.nextIndex;
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM ${schema}.${table}
      ${whereClause}
      ORDER BY ${dateField} ASC
    `;

    log.debug('Executing data source query', {
      query,
      paramCount: queryParams.length,
      hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
      note: 'RBAC filtering will be applied in-memory after fetch',
    });

    const queryStart = Date.now();
    const rows = await executeAnalyticsQuery(query, queryParams);
    const queryDuration = Date.now() - queryStart;

    log.info('Database query completed', {
      schema,
      table,
      rowCount: rows.length,
      queryDuration,
      hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
    });

    return rows;
  }
}

// Export singleton instance
export const dataSourceQueryService = new DataSourceQueryService();
