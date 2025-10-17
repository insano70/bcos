/**
 * Query Validator - Security-Critical Validation Module
 *
 * Provides validation for tables, fields, operators, and filters.
 * SHARED by both DataSourceCacheService and legacy query path.
 *
 * Security Principles:
 * - Whitelist-based validation (not blacklist)
 * - Fail-closed (reject on uncertainty)
 * - Dynamic validation using database configuration
 * - Comprehensive security logging
 */

import { log } from '@/lib/logger';
import { chartConfigService, type DataSourceConfig } from '@/lib/services/chart-config-service';
import { createRBACDataSourceColumnsService } from '@/lib/services/rbac-data-source-columns-service';
import type { ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { ALLOWED_OPERATORS, isAllowedOperator } from './query-types';

/**
 * Standard columns that always exist across all data sources
 * These are always allowed for filtering
 */
const STANDARD_COLUMNS = new Set([
  'practice_uid',
  'provider_uid',
  'measure',
  'frequency',
  'time_period', // Alternative to frequency
]);

/**
 * Query Validator Class
 *
 * Provides validation methods used by both cache and legacy query paths.
 */
export class QueryValidator {
  /**
   * Validate table name against database configuration
   *
   * @param tableName - Table name to validate
   * @param schemaName - Schema name (default: 'ih')
   * @param dataSourceConfig - Optional pre-loaded config (avoid redundant lookup)
   * @throws Error if table not authorized or inactive
   */
  async validateTable(
    tableName: string,
    schemaName: string = 'ih',
    dataSourceConfig?: DataSourceConfig | null
  ): Promise<void> {
    const config =
      dataSourceConfig || (await chartConfigService.getDataSourceConfig(tableName, schemaName));

    if (!config || !config.isActive) {
      log.security('Unauthorized table access attempt', 'high', {
        tableName,
        schemaName,
        hasConfig: !!config,
        isActive: config?.isActive,
      });
      throw new Error(`Unauthorized table access: ${schemaName}.${tableName}`);
    }
  }

  /**
   * Validate field name against database configuration
   *
   * @param fieldName - Field name to validate
   * @param tableName - Table name
   * @param schemaName - Schema name (default: 'ih')
   * @param dataSourceConfig - Optional pre-loaded config (avoid redundant lookup)
   * @throws Error if field not authorized
   */
  async validateField(
    fieldName: string,
    tableName: string,
    schemaName: string = 'ih',
    dataSourceConfig?: DataSourceConfig | null
  ): Promise<void> {
    // Use provided config to avoid redundant lookup
    const allowedFields = dataSourceConfig
      ? dataSourceConfig.columns.map((col) => col.columnName)
      : await chartConfigService.getAllowedFields(tableName, schemaName);

    if (!allowedFields.includes(fieldName)) {
      log.security('Unauthorized field access attempt', 'high', {
        fieldName,
        tableName,
        schemaName,
        allowedFields: allowedFields.slice(0, 10), // Log first 10 for context
      });
      throw new Error(`Unauthorized field access: ${fieldName}`);
    }
  }

  /**
   * Validate operator against whitelist
   *
   * @param operator - Operator to validate (e.g., 'eq', 'in', 'like')
   * @throws Error if operator not in whitelist
   */
  validateOperator(operator: string): void {
    if (!isAllowedOperator(operator)) {
      log.security('Unauthorized operator attempt', 'high', {
        operator,
        allowedOperators: Object.keys(ALLOWED_OPERATORS),
      });
      throw new Error(`Unauthorized operator: ${operator}`);
    }
  }

  /**
   * Validate advanced filter fields against data source configuration
   *
   * SECURITY-CRITICAL: Prevents SQL injection via custom column names
   * EXTRACTED from DataSourceCacheService.validateFilterFields()
   *
   * Only allows filtering on:
   * 1. Standard columns (practice_uid, provider_uid, measure, frequency, time_period)
   * 2. Columns defined in data source configuration marked as filterable
   *
   * @param filters - Array of filters to validate
   * @param dataSourceId - Data source ID
   * @param userContext - User context for RBAC data source access
   * @throws Error if any filter field is invalid or not filterable
   */
  async validateFilterFields(
    filters: ChartFilter[],
    dataSourceId: number,
    userContext: UserContext
  ): Promise<void> {
    if (!filters || filters.length === 0) {
      return;
    }

    // Get data source column configuration using RBAC-aware service
    const columnsService = createRBACDataSourceColumnsService(userContext);
    const columns = await columnsService.getDataSourceColumns({
      data_source_id: dataSourceId,
      is_active: true,
    });

    // Build allowed column names set
    const allowedColumns = new Set([
      ...Array.from(STANDARD_COLUMNS),
      ...columns
        .filter((col) => col.is_filterable !== false) // Only filterable columns
        .map((col) => col.column_name),
    ]);

    // Validate each filter field
    for (const filter of filters) {
      if (!allowedColumns.has(filter.field)) {
        log.security('Attempted to filter on invalid column', 'high', {
          field: filter.field,
          dataSourceId,
          userId: userContext.user_id,
          allowedColumns: Array.from(allowedColumns),
        });
        throw new Error(
          `Invalid filter field: ${filter.field}. Field not defined or not filterable in data source configuration.`
        );
      }
    }

    log.debug('Filter fields validated', {
      filterCount: filters.length,
      fields: filters.map((f) => f.field),
      dataSourceId,
    });
  }
}

// Export singleton instance
export const queryValidator = new QueryValidator();
