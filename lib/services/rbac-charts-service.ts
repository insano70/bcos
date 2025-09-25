import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createAppLogger } from '@/lib/logger/factory';
import { chart_definitions, chart_categories, users, dashboard_charts } from '@/lib/db/schema';
import { eq, and, inArray, isNull, like, or, count, desc } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * Enhanced Charts Service with RBAC
 * Provides chart definition management with automatic permission checking and data filtering
 */

// Universal logger for RBAC charts service operations
const rbacChartsLogger = createAppLogger('rbac-charts-service', {
  component: 'business-logic',
  feature: 'chart-management',
  businessIntelligence: true
})

export interface CreateChartData {
  chart_name: string;
  chart_description?: string | undefined;
  chart_type: string;
  data_source: string | Record<string, unknown>;
  chart_config?: Record<string, unknown> | undefined;
  chart_category_id?: number | undefined;
  is_active?: boolean | undefined;
}

export interface UpdateChartData {
  chart_name?: string | undefined;
  chart_description?: string | undefined;
  chart_type?: string | undefined;
  data_source?: string | Record<string, unknown> | undefined;
  chart_config?: Record<string, unknown> | undefined;
  chart_category_id?: number | undefined;
  is_active?: boolean | undefined;
}

export interface ChartQueryOptions {
  category_id?: string | undefined;
  is_active?: boolean | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ChartWithMetadata {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | undefined;
  chart_type: string;
  data_source: string | Record<string, unknown>;
  chart_config: Record<string, unknown>;
  chart_category_id: number | undefined;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  category: {
    chart_category_id: number;
    category_name: string;
    category_description: string | undefined;
  } | undefined;
  creator: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | undefined;
}

/**
 * RBAC Charts Service
 * Provides secure chart definition management with automatic permission checking
 */
export class RBACChartsService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext);
  }

  /**
   * Get charts list with RBAC filtering, pagination, and metadata joins
   */
  async getCharts(options: ChartQueryOptions = {}): Promise<ChartWithMetadata[]> {
    this.requireAnyPermission([
      'analytics:read:all'
    ]);

    // Build where conditions
    const conditions = [];

    if (options.category_id) {
      conditions.push(eq(chart_definitions.chart_category_id, parseInt(options.category_id)));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(chart_definitions.is_active, options.is_active));
    }

    if (options.search) {
      conditions.push(like(chart_definitions.chart_name, `%${options.search}%`));
    }

    // Fetch charts with category and creator info
    const charts = await db
      .select()
      .from(chart_definitions)
      .leftJoin(chart_categories, eq(chart_definitions.chart_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(chart_definitions.created_by, users.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(chart_definitions.created_at))
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    // Transform to flattened structure
    return charts.map((chart) => ({
      chart_definition_id: chart.chart_definitions!.chart_definition_id,
      chart_name: chart.chart_definitions!.chart_name,
      chart_description: chart.chart_definitions!.chart_description || undefined,
      chart_type: chart.chart_definitions!.chart_type,
      data_source: chart.chart_definitions!.data_source as Record<string, unknown>,
      chart_config: chart.chart_definitions!.chart_config as Record<string, unknown>,
      chart_category_id: chart.chart_definitions!.chart_category_id || undefined,
      created_by: chart.chart_definitions!.created_by,
      created_at: chart.chart_definitions!.created_at?.toISOString() || new Date().toISOString(),
      updated_at: chart.chart_definitions!.updated_at?.toISOString() || new Date().toISOString(),
      is_active: chart.chart_definitions!.is_active ?? true,
      category: chart.chart_categories ? {
        chart_category_id: chart.chart_categories.chart_category_id,
        category_name: chart.chart_categories.category_name,
        category_description: chart.chart_categories.category_description || undefined,
      } : undefined,
      creator: chart.users ? {
        user_id: chart.users.user_id,
        first_name: chart.users.first_name || '',
        last_name: chart.users.last_name || '',
        email: chart.users.email
      } : undefined,
    }));
  }

  /**
   * Get chart count for pagination
   */
  async getChartCount(options: ChartQueryOptions = {}): Promise<number> {
    this.requireAnyPermission([
      'analytics:read:all'
    ]);

    // Build where conditions
    const conditions = [];

    if (options.category_id) {
      conditions.push(eq(chart_definitions.chart_category_id, parseInt(options.category_id)));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(chart_definitions.is_active, options.is_active));
    }

    if (options.search) {
      conditions.push(like(chart_definitions.chart_name, `%${options.search}%`));
    }

    const [result] = await db
      .select({ count: count() })
      .from(chart_definitions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result?.count || 0;
  }

  /**
   * Get a specific chart by ID with permission checking
   */
  async getChartById(chartId: string): Promise<ChartWithMetadata | null> {
    this.requireAnyPermission([
      'analytics:read:all'
    ]);

    // Get chart with category and creator info
    const charts = await db
      .select()
      .from(chart_definitions)
      .leftJoin(chart_categories, eq(chart_definitions.chart_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(chart_definitions.created_by, users.user_id))
      .where(eq(chart_definitions.chart_definition_id, chartId))
      .limit(1);

    if (charts.length === 0) {
      return null;
    }

    const chart = charts[0]!; // Safe: we just checked charts.length > 0

    return {
      chart_definition_id: chart.chart_definitions!.chart_definition_id,
      chart_name: chart.chart_definitions!.chart_name,
      chart_description: chart.chart_definitions!.chart_description || undefined,
      chart_type: chart.chart_definitions!.chart_type,
      data_source: chart.chart_definitions!.data_source as Record<string, unknown>,
      chart_config: chart.chart_definitions!.chart_config as Record<string, unknown>,
      chart_category_id: chart.chart_definitions!.chart_category_id || undefined,
      created_by: chart.chart_definitions!.created_by,
      created_at: chart.chart_definitions!.created_at?.toISOString() || new Date().toISOString(),
      updated_at: chart.chart_definitions!.updated_at?.toISOString() || new Date().toISOString(),
      is_active: chart.chart_definitions!.is_active ?? true,
      category: chart.chart_categories ? {
        chart_category_id: chart.chart_categories.chart_category_id,
        category_name: chart.chart_categories.category_name,
        category_description: chart.chart_categories.category_description || undefined,
      } : undefined,
      creator: chart.users ? {
        user_id: chart.users.user_id,
        first_name: chart.users.first_name || '',
        last_name: chart.users.last_name || '',
        email: chart.users.email
      } : undefined,
    };
  }

  /**
   * Create a new chart with permission checking
   */
  async createChart(chartData: CreateChartData): Promise<ChartWithMetadata> {
    const startTime = Date.now();

    // Enhanced chart creation logging
    if (true) {
      rbacChartsLogger.info('Chart creation initiated', {
        requestingUserId: this.userContext.user_id,
        chartName: chartData.chart_name,
        chartType: chartData.chart_type,
        operation: 'create_chart',
        securityLevel: 'medium'
      });
    }

    this.requirePermission('analytics:read:all', undefined);

    // Create new chart
    const [newChart] = await db
      .insert(chart_definitions)
      .values({
        chart_name: chartData.chart_name,
        chart_description: chartData.chart_description || null,
        chart_type: chartData.chart_type,
        data_source: chartData.data_source,
        chart_config: chartData.chart_config || {},
        chart_category_id: chartData.chart_category_id || null,
        created_by: this.userContext.user_id,
        is_active: chartData.is_active ?? true
      })
      .returning();

    if (!newChart) {
      throw new Error('Failed to create chart');
    }

    rbacChartsLogger.info('Chart created successfully', {
      chartId: newChart.chart_definition_id,
      chartName: newChart.chart_name,
      chartType: newChart.chart_type,
      createdBy: this.userContext.user_id,
      totalRequestTime: Date.now() - startTime
    });

    // Return the created chart with metadata
    return this.getChartById(newChart.chart_definition_id).then(chart => {
      if (!chart) {
        throw new Error('Failed to retrieve created chart');
      }
      return chart;
    });
  }

  /**
   * Update a chart with permission checking
   */
  async updateChart(chartId: string, updateData: UpdateChartData): Promise<ChartWithMetadata> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if chart exists
    const existingChart = await this.getChartById(chartId);
    if (!existingChart) {
      throw new Error('Chart not found');
    }

    // Execute chart update as atomic transaction
    const updatedChart = await db.transaction(async (tx) => {
      // Prepare update data
      const updateFields: Partial<typeof chart_definitions.$inferInsert> = {};

      if (updateData.chart_name !== undefined) updateFields.chart_name = updateData.chart_name;
      if (updateData.chart_description !== undefined) updateFields.chart_description = updateData.chart_description;
      if (updateData.chart_type !== undefined) updateFields.chart_type = updateData.chart_type;
      if (updateData.data_source !== undefined) updateFields.data_source = updateData.data_source;
      if (updateData.chart_config !== undefined) updateFields.chart_config = updateData.chart_config;
      if (updateData.chart_category_id !== undefined) updateFields.chart_category_id = updateData.chart_category_id;
      if (updateData.is_active !== undefined) updateFields.is_active = updateData.is_active;

      // Update the chart
      const [updatedChart] = await tx
        .update(chart_definitions)
        .set(updateFields)
        .where(eq(chart_definitions.chart_definition_id, chartId))
        .returning();

      return updatedChart;
    });

    if (!updatedChart) {
      throw new Error('Failed to update chart');
    }

    rbacChartsLogger.info('Chart updated successfully', {
      chartId: updatedChart.chart_definition_id,
      chartName: updatedChart.chart_name,
      updatedBy: this.userContext.user_id
    });

    // Return the updated chart with metadata
    return this.getChartById(chartId).then(chart => {
      if (!chart) {
        throw new Error('Failed to retrieve updated chart');
      }
      return chart;
    });
  }

  /**
   * Delete a chart with permission checking
   */
  async deleteChart(chartId: string): Promise<void> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if chart exists
    const existingChart = await this.getChartById(chartId);
    if (!existingChart) {
      throw new Error('Chart not found');
    }

    // Execute chart deletion and cleanup as atomic transaction
    await db.transaction(async (tx) => {
      // First, remove all dashboard associations
      await tx
        .delete(dashboard_charts)
        .where(eq(dashboard_charts.chart_definition_id, chartId));

      // Then delete the chart
      const [deletedChart] = await tx
        .delete(chart_definitions)
        .where(eq(chart_definitions.chart_definition_id, chartId))
        .returning();

      if (!deletedChart) {
        throw new Error('Failed to delete chart');
      }
    });

    rbacChartsLogger.info('Chart deleted successfully', {
      chartId,
      chartName: existingChart.chart_name,
      deletedBy: this.userContext.user_id
    });
  }
}

/**
 * Factory function to create RBAC Charts Service
 */
export function createRBACChartsService(userContext: UserContext): RBACChartsService {
  return new RBACChartsService(userContext);
}
