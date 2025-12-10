import { eq, like, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { chart_categories, chart_definitions, dashboard_charts, users } from '@/lib/db/schema';
import { NotFoundError } from '@/lib/errors/domain-errors';
import { log } from '@/lib/logger';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
  type JoinQueryConfig,
} from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Enhanced Charts Service with RBAC
 * Provides chart definition management with automatic permission checking and data filtering
 *
 * Migrated to use BaseCrudService infrastructure with JOIN support.
 */

export interface CreateChartData {
  chart_name: string;
  chart_description?: string | undefined;
  chart_type: string;
  data_source: string | Record<string, unknown>;
  chart_config?: Record<string, unknown> | undefined;
  chart_category_id?: number | undefined;
  is_active?: boolean | undefined;
  // Drill-down configuration
  drill_down_enabled?: boolean | undefined;
  drill_down_type?: string | null | undefined;
  drill_down_target_chart_id?: string | null | undefined;
  drill_down_button_label?: string | undefined;
}

export interface UpdateChartData {
  chart_name?: string | undefined;
  chart_description?: string | undefined;
  chart_type?: string | undefined;
  data_source?: string | Record<string, unknown> | undefined;
  chart_config?: Record<string, unknown> | undefined;
  chart_category_id?: number | undefined;
  is_active?: boolean | undefined;
  // Drill-down configuration
  drill_down_enabled?: boolean | undefined;
  drill_down_type?: string | null | undefined;
  drill_down_target_chart_id?: string | null | undefined;
  drill_down_button_label?: string | undefined;
}

export interface ChartQueryOptions extends BaseQueryOptions {
  category_id?: string | undefined;
  is_active?: boolean | undefined;
}

export interface ChartWithMetadata {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | undefined;
  chart_type: string;
  data_source: string | Record<string, unknown>;
  data_source_id?: number | null | undefined;
  chart_config: Record<string, unknown>;
  chart_category_id: number | undefined;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  // Drill-down configuration
  drill_down_enabled?: boolean;
  drill_down_type?: string | null;
  drill_down_target_chart_id?: string | null;
  drill_down_button_label?: string;
  category:
    | {
        chart_category_id: number;
        category_name: string;
        category_description: string | undefined;
      }
    | undefined;
  creator:
    | {
        user_id: string;
        first_name: string;
        last_name: string;
        email: string;
      }
    | undefined;
}

/**
 * RBAC Charts Service
 * Provides secure chart definition management with automatic permission checking
 */
export class RBACChartsService extends BaseCrudService<
  typeof chart_definitions,
  ChartWithMetadata,
  CreateChartData,
  UpdateChartData,
  ChartQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof chart_definitions,
    ChartWithMetadata,
    CreateChartData,
    UpdateChartData,
    ChartQueryOptions
  > = {
    table: chart_definitions,
    resourceName: 'charts',
    displayName: 'chart',
    primaryKeyName: 'chart_definition_id',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: ['charts:read:own', 'charts:read:organization', 'charts:read:all'],
      create: ['charts:create:organization', 'charts:manage:all'],
      update: ['charts:create:organization', 'charts:manage:all'],
      delete: ['charts:create:organization', 'charts:manage:all'],
    },
    validators: {
      beforeDelete: async (id) => {
        // Remove all dashboard associations before deleting the chart
        await db.delete(dashboard_charts).where(eq(dashboard_charts.chart_definition_id, String(id)));
      },
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): ChartWithMetadata => {
        // Handle both flat row (from JOIN query) and nested row structures
        const def = (row.chart_definitions as Record<string, unknown>) || row;
        const cat = row.chart_categories as Record<string, unknown> | null;
        const usr = row.users as Record<string, unknown> | null;

        return {
          chart_definition_id: (def.chart_definition_id as string) || (row.chart_definition_id as string),
          chart_name: (def.chart_name as string) || (row.chart_name as string),
          chart_description: ((def.chart_description as string) || (row.chart_description as string)) || undefined,
          chart_type: (def.chart_type as string) || (row.chart_type as string),
          data_source: (def.data_source || row.data_source) as string | Record<string, unknown>,
          data_source_id: (def.data_source_id as number | null) || (row.data_source_id as number | null) || undefined,
          chart_config: ((def.chart_config || row.chart_config) as Record<string, unknown>) || {},
          chart_category_id: (def.chart_category_id as number) || (row.chart_category_id as number) || undefined,
          created_by: (def.created_by as string) || (row.created_by as string),
          created_at: ((def.created_at as Date) || (row.created_at as Date))?.toISOString() || new Date().toISOString(),
          updated_at: ((def.updated_at as Date) || (row.updated_at as Date))?.toISOString() || new Date().toISOString(),
          is_active: (def.is_active as boolean) ?? (row.is_active as boolean) ?? true,
          // Drill-down configuration
          drill_down_enabled: (def.drill_down_enabled as boolean) ?? (row.drill_down_enabled as boolean) ?? false,
          drill_down_type: (def.drill_down_type as string | null) ?? (row.drill_down_type as string | null) ?? null,
          drill_down_target_chart_id: (def.drill_down_target_chart_id as string | null) ?? (row.drill_down_target_chart_id as string | null) ?? null,
          drill_down_button_label: (def.drill_down_button_label as string) ?? (row.drill_down_button_label as string) ?? 'Drill Down',
          category: cat
            ? {
                chart_category_id: cat.chart_category_id as number,
                category_name: cat.category_name as string,
                category_description: (cat.category_description as string) || undefined,
              }
            : undefined,
          creator: usr
            ? {
                user_id: usr.user_id as string,
                first_name: (usr.first_name as string) || '',
                last_name: (usr.last_name as string) || '',
                email: usr.email as string,
              }
            : undefined,
        };
      },
      toCreateValues: (data, ctx) => {
        // Extract data_source_id from chart_config if present
        const dataSourceId =
          data.chart_config && typeof data.chart_config === 'object'
            ? (data.chart_config as { dataSourceId?: number }).dataSourceId
            : undefined;

        return {
          chart_name: data.chart_name,
          chart_description: data.chart_description ?? null,
          chart_type: data.chart_type,
          data_source: data.data_source,
          chart_config: data.chart_config ?? {},
          data_source_id: dataSourceId ?? null,
          chart_category_id: data.chart_category_id ?? null,
          created_by: ctx.user_id,
          is_active: data.is_active ?? true,
          drill_down_enabled: data.drill_down_enabled ?? false,
          drill_down_type: data.drill_down_type ?? null,
          drill_down_target_chart_id: data.drill_down_target_chart_id ?? null,
          drill_down_button_label: data.drill_down_button_label ?? 'Drill Down',
        };
      },
      toUpdateValues: (data) => {
        const values: Record<string, unknown> = {};

        if (data.chart_name !== undefined) values.chart_name = data.chart_name;
        if (data.chart_description !== undefined) values.chart_description = data.chart_description;
        if (data.chart_type !== undefined) values.chart_type = data.chart_type;
        if (data.data_source !== undefined) values.data_source = data.data_source;
        if (data.chart_config !== undefined) {
          values.chart_config = data.chart_config;
          // Extract and update data_source_id from chart_config if present
          const dataSourceId =
            typeof data.chart_config === 'object'
              ? (data.chart_config as { dataSourceId?: number }).dataSourceId
              : undefined;
          if (dataSourceId !== undefined) {
            values.data_source_id = dataSourceId || null;
          }
        }
        if (data.chart_category_id !== undefined) values.chart_category_id = data.chart_category_id;
        if (data.is_active !== undefined) values.is_active = data.is_active;
        if (data.drill_down_enabled !== undefined) values.drill_down_enabled = data.drill_down_enabled;
        if (data.drill_down_type !== undefined) values.drill_down_type = data.drill_down_type;
        if (data.drill_down_target_chart_id !== undefined) values.drill_down_target_chart_id = data.drill_down_target_chart_id;
        if (data.drill_down_button_label !== undefined) values.drill_down_button_label = data.drill_down_button_label;

        return values;
      },
    },
  };

  /**
   * Build JOIN query for enriched chart data with category and creator info
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
        chart_definitions: chart_definitions,
        chart_categories: chart_categories,
        users: users,
      },
      joins: [
        {
          table: chart_categories,
          on: eq(chart_definitions.chart_category_id, chart_categories.chart_category_id),
          type: 'left',
        },
        {
          table: users,
          on: eq(chart_definitions.created_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  /**
   * Build search conditions for chart name filtering
   */
  protected buildSearchConditions(search: string): SQL[] {
    return [like(chart_definitions.chart_name, `%${search}%`)];
  }

  /**
   * Build custom conditions for category and is_active filtering
   */
  protected buildCustomConditions(options: ChartQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    if (options.category_id) {
      const categoryId = parseInt(options.category_id, 10);
      if (!Number.isNaN(categoryId) && categoryId > 0) {
        conditions.push(eq(chart_definitions.chart_category_id, categoryId));
      }
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(chart_definitions.is_active, options.is_active));
    }

    return conditions;
  }

  // ===========================================================================
  // Public API Methods - Maintain backward compatibility
  // ===========================================================================

  /**
   * Get charts list with RBAC filtering, pagination, and metadata joins
   */
  async getCharts(options: ChartQueryOptions = {}): Promise<ChartWithMetadata[]> {
    const result = await this.getList({
      ...options,
      limit: options.limit ?? 1000000,
      offset: options.offset ?? 0,
    });
    return result.items;
  }

  /**
   * Get chart count for pagination
   */
  async getChartCount(options: ChartQueryOptions = {}): Promise<number> {
    return this.getCount(options);
  }

  /**
   * Get a specific chart by ID with permission checking
   */
  async getChartById(chartId: string): Promise<ChartWithMetadata | null> {
    return this.getById(chartId);
  }

  /**
   * Create a new chart with permission checking
   */
  async createChart(chartData: CreateChartData): Promise<ChartWithMetadata> {
    const startTime = Date.now();

    log.info('Chart creation initiated', {
      requestingUserId: this.userContext.user_id,
      chartName: chartData.chart_name,
      chartType: chartData.chart_type,
      operation: 'create_chart',
      securityLevel: 'medium',
    });

    const newChart = await this.create(chartData);

    log.info('Chart created successfully', {
      chartId: newChart.chart_definition_id,
      chartName: newChart.chart_name,
      chartType: newChart.chart_type,
      createdBy: this.userContext.user_id,
      totalRequestTime: Date.now() - startTime,
    });

    return newChart;
  }

  /**
   * Update a chart with permission checking
   */
  async updateChart(chartId: string, updateData: UpdateChartData): Promise<ChartWithMetadata> {
    const updatedChart = await this.update(chartId, updateData);

    log.info('Chart updated successfully', {
      chartId: updatedChart.chart_definition_id,
      chartName: updatedChart.chart_name,
      updatedBy: this.userContext.user_id,
    });

    return updatedChart;
  }

  /**
   * Delete a chart with permission checking
   */
  async deleteChart(chartId: string): Promise<void> {
    // Get chart name for logging before deletion
    const existingChart = await this.getById(chartId);
    if (!existingChart) {
      throw new NotFoundError('Chart', chartId);
    }

    await this.delete(chartId);

    log.info('Chart deleted successfully', {
      chartId,
      chartName: existingChart.chart_name,
      deletedBy: this.userContext.user_id,
    });
  }
}

/**
 * Factory function to create RBAC Charts Service
 */
export function createRBACChartsService(userContext: UserContext): RBACChartsService {
  return new RBACChartsService(userContext);
}
