/**
 * Dimension Discovery Service
 *
 * Discovers and retrieves expansion dimensions from data source metadata.
 * Enables dynamic dimension-based chart expansion without hardcoded configuration.
 *
 * Key Responsibilities:
 * - Find expansion dimensions in data source columns
 * - Query unique dimension values from analytics data
 * - Apply RBAC filtering to dimension values
 * - Support current dashboard filters when discovering values
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chart_data_source_columns, chart_data_sources } from '@/lib/db/chart-config-schema';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartFilter } from '@/lib/types/analytics';
import type {
  AvailableDimensionsResponse,
  DimensionValue,
  DimensionValuesResponse,
  ExpansionDimension,
} from '@/lib/types/dimensions';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { buildChartRenderContext } from '@/lib/utils/chart-context';
import { queryBuilder } from './query-builder';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';

/**
 * Dimension Discovery Service
 *
 * Discovers expansion dimensions from data source configuration
 */
export class DimensionDiscoveryService {
  /**
   * Get expansion dimensions available for a chart
   *
   * Queries data source columns marked as expansion dimensions.
   *
   * @param chartDefinitionId - Chart definition ID
   * @param userContext - User context for RBAC
   * @returns Available expansion dimensions
   */
  async getChartExpansionDimensions(
    chartDefinitionId: string,
    userContext: UserContext
  ): Promise<AvailableDimensionsResponse> {
    const startTime = Date.now();

    try {
      // Get chart definition to find data source
      const chartsService = createRBACChartsService(userContext);
      const chartDef = await chartsService.getChartById(chartDefinitionId);
      
      // Get data_source_id from the denormalized integer column
      const dataSourceId = chartDef?.data_source_id || 0;

      if (!chartDef || dataSourceId === 0) {
        log.warn('Chart not found or missing data_source_id', {
          chartDefinitionId,
          hasChartDef: !!chartDef,
          dataSourceId,
          component: 'dimension-discovery',
        });
        
        return {
          dimensions: [],
          chartDefinitionId,
          dataSourceId: 0,
        };
      }

      // Query expansion dimension columns
      const columns = await db
        .select({
          column_name: chart_data_source_columns.column_name,
          display_name: chart_data_source_columns.display_name,
          expansion_display_name: chart_data_source_columns.expansion_display_name,
          data_type: chart_data_source_columns.data_type,
          data_source_id: chart_data_source_columns.data_source_id,
        })
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, dataSourceId),
            eq(chart_data_source_columns.is_expansion_dimension, true),
            eq(chart_data_source_columns.is_active, true)
          )
        )
        .orderBy(chart_data_source_columns.sort_order);

      const dimensions: ExpansionDimension[] = columns.map((col) => ({
        columnName: col.column_name,
        displayName: col.expansion_display_name || col.display_name,
        dataType: col.data_type as 'string' | 'integer' | 'boolean',
        dataSourceId: col.data_source_id,
      }));

      const duration = Date.now() - startTime;

      log.info('Chart expansion dimensions discovered', {
        chartDefinitionId,
        dataSourceId,
        dimensionCount: dimensions.length,
        dimensions: dimensions.map((d) => d.columnName),
        userId: userContext.user_id,
        duration,
        component: 'dimension-discovery',
      });

      return {
        dimensions,
        chartDefinitionId,
        dataSourceId,
      };
    } catch (error) {
      log.error('Failed to discover chart expansion dimensions', error as Error, {
        chartDefinitionId,
        userId: userContext.user_id,
        component: 'dimension-discovery',
      });
      throw error;
    }
  }

  /**
   * Get unique values for an expansion dimension
   *
   * Queries analytics data for distinct dimension values,
   * respecting user RBAC and current filters.
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumn - Dimension column name
   * @param filters - Current filters (date range, organization, etc.)
   * @param userContext - User context for RBAC
   * @param limit - Maximum number of values to return (default: 20)
   * @returns Unique dimension values
   */
  async getDimensionValues(
    dataSourceId: number,
    dimensionColumn: string,
    filters: ChartFilter[],
    userContext: UserContext,
    limit?: number
  ): Promise<DimensionValuesResponse> {
    const startTime = Date.now();

    // SECURITY: Validate and clamp limit parameter
    const validatedLimit = Math.min(
      Math.max(limit || DIMENSION_EXPANSION_LIMITS.DEFAULT, 1),
      DIMENSION_EXPANSION_LIMITS.MAXIMUM
    );

    try {
      // Get data source configuration
      const dataSource = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, dataSourceId))
        .limit(1)
        .then((rows) => rows[0]);

      if (!dataSource) {
        throw new Error(`Data source not found: ${dataSourceId}`);
      }

      // Get dimension column metadata
      const dimensionCol = await db
        .select()
        .from(chart_data_source_columns)
        .where(
          and(
            eq(chart_data_source_columns.data_source_id, dataSourceId),
            eq(chart_data_source_columns.column_name, dimensionColumn),
            eq(chart_data_source_columns.is_expansion_dimension, true)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!dimensionCol) {
        throw new Error(
          `Expansion dimension column not found: ${dimensionColumn} in data source ${dataSourceId}`
        );
      }

      // SECURITY: Validate dimension column matches validated metadata
      // This prevents SQL injection via column name manipulation
      if (dimensionCol.column_name !== dimensionColumn) {
        throw new Error(`Column name mismatch: requested ${dimensionColumn}, validated ${dimensionCol.column_name}`);
      }

      // Build chart context for RBAC filtering
      const context = await buildChartRenderContext(userContext);

      // Build WHERE clause with RBAC + filters
      const whereClause = await queryBuilder.buildWhereClause(filters, context);

      // SECURITY: Use validated column name and parameterized limit
      // Quote identifiers to prevent SQL injection
      const validatedColumn = dimensionCol.column_name;
      const query = `
        SELECT DISTINCT "${validatedColumn}" as value,
               COUNT(*) OVER () as total_records
        FROM "${dataSource.schema_name}"."${dataSource.table_name}"
        ${whereClause.clause}
        ORDER BY "${validatedColumn}"
        LIMIT $${whereClause.params.length + 1}
      `;

      const queryParams = [...whereClause.params, validatedLimit];

      log.debug('Dimension values query', {
        dataSourceId,
        dimensionColumn: validatedColumn,
        query,
        params: queryParams,
        component: 'dimension-discovery',
      });

      const rows = await executeAnalyticsQuery<{
        value: string | number;
        total_records: string;
      }>(query, queryParams);

      // Transform to dimension values
      // NOTE: recordCount is intentionally omitted here because total_records is a window function
      // that returns the TOTAL count across all rows, not per dimension value.
      // The actual per-dimension recordCount is set later after filtering in dimension-expansion-renderer.
      const values: DimensionValue[] = rows.map((row) => ({
        value: row.value,
        label: String(row.value),
        // recordCount omitted - will be populated with actual filtered count in dimension-expansion-renderer
      }));

      const duration = Date.now() - startTime;

      const dimension: ExpansionDimension = {
        columnName: dimensionCol.column_name,
        displayName: dimensionCol.expansion_display_name || dimensionCol.display_name,
        dataType: dimensionCol.data_type as 'string' | 'integer' | 'boolean',
        dataSourceId: dimensionCol.data_source_id,
        valueCount: values.length,
      };

      log.info('Dimension values discovered', {
        dataSourceId,
        dimensionColumn,
        valueCount: values.length,
        totalRecords: rows[0]?.total_records || 0,
        userId: userContext.user_id,
        duration,
        component: 'dimension-discovery',
      });

      return {
        values,
        dimension,
        totalValues: values.length,
        filtered: context.permission_scope !== 'all',
      };
    } catch (error) {
      log.error('Failed to discover dimension values', error as Error, {
        dataSourceId,
        dimensionColumn,
        userId: userContext.user_id,
        component: 'dimension-discovery',
      });
      throw error;
    }
  }

  /**
   * Get expansion dimensions for a data source
   *
   * Helper method to get all expansion dimensions configured for a data source.
   *
   * @param dataSourceId - Data source ID
   * @returns Expansion dimension columns
   */
  async getDataSourceExpansionDimensions(dataSourceId: number): Promise<ExpansionDimension[]> {
    const columns = await db
      .select({
        column_name: chart_data_source_columns.column_name,
        display_name: chart_data_source_columns.display_name,
        expansion_display_name: chart_data_source_columns.expansion_display_name,
        data_type: chart_data_source_columns.data_type,
        data_source_id: chart_data_source_columns.data_source_id,
      })
      .from(chart_data_source_columns)
      .where(
        and(
          eq(chart_data_source_columns.data_source_id, dataSourceId),
          eq(chart_data_source_columns.is_expansion_dimension, true),
          eq(chart_data_source_columns.is_active, true)
        )
      )
      .orderBy(chart_data_source_columns.sort_order);

    return columns.map((col) => ({
      columnName: col.column_name,
      displayName: col.expansion_display_name || col.display_name,
      dataType: col.data_type as 'string' | 'integer' | 'boolean',
      dataSourceId: col.data_source_id,
    }));
  }
}

// Export singleton instance
export const dimensionDiscoveryService = new DimensionDiscoveryService();

