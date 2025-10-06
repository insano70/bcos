import { and, count, desc, eq, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chart_categories,
  chart_definitions,
  dashboard_charts,
  dashboards,
  users,
} from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Enhanced Dashboards Service with RBAC
 * Provides dashboard management with automatic permission checking and data filtering
 */

// Universal logger for RBAC dashboard service operations
export interface CreateDashboardData {
  dashboard_name: string;
  dashboard_description?: string | undefined;
  dashboard_category_id?: number | undefined;
  chart_ids?: string[] | undefined;
  chart_positions?: Record<string, unknown>[] | undefined;
  layout_config?: Record<string, unknown> | undefined;
  is_active?: boolean | undefined;
  is_published?: boolean | undefined;
  is_default?: boolean | undefined;
}

export interface UpdateDashboardData {
  dashboard_name?: string;
  dashboard_description?: string;
  dashboard_category_id?: number;
  chart_ids?: string[];
  chart_positions?: Record<string, unknown>[];
  layout_config?: Record<string, unknown>;
  is_active?: boolean;
  is_published?: boolean;
  is_default?: boolean;
}

export interface DashboardQueryOptions {
  category_id?: string | undefined;
  is_active?: boolean | undefined;
  is_published?: boolean | undefined;
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface DashboardWithCharts {
  // Export for frontend use
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | undefined;
  layout_config: Record<string, unknown>;
  dashboard_category_id: number | undefined;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published: boolean;
  is_default: boolean;
  chart_count: number;
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
  charts: {
    chart_definition_id: string;
    chart_name: string;
    chart_description: string | undefined;
    chart_type: string;
    position_config: Record<string, unknown> | undefined;
  }[];
}

export class RBACDashboardsService extends BaseRBACService {
  /**
   * Get dashboards with automatic permission-based filtering
   */
  async getDashboards(options: DashboardQueryOptions = {}): Promise<DashboardWithCharts[]> {
    this.requireAnyPermission(['analytics:read:organization', 'analytics:read:all']);

    // Build query conditions
    const conditions = [];

    if (options.is_active !== undefined) {
      conditions.push(eq(dashboards.is_active, options.is_active));
    }

    if (options.is_published !== undefined) {
      conditions.push(eq(dashboards.is_published, options.is_published));
    }

    if (options.category_id) {
      const categoryId = parseInt(options.category_id, 10);
      if (!Number.isNaN(categoryId) && categoryId > 0) {
        conditions.push(eq(dashboards.dashboard_category_id, categoryId));
      }
    }

    if (options.search) {
      conditions.push(
        or(
          like(dashboards.dashboard_name, `%${options.search}%`),
          like(dashboards.dashboard_description, `%${options.search}%`)
        )
      );
    }

    // Fetch dashboards with creator, category info, and chart counts in single query
    const dashboardList = await db
      .select({
        // Dashboard fields
        dashboard_id: dashboards.dashboard_id,
        dashboard_name: dashboards.dashboard_name,
        dashboard_description: dashboards.dashboard_description,
        layout_config: dashboards.layout_config,
        dashboard_category_id: dashboards.dashboard_category_id,
        created_by: dashboards.created_by,
        created_at: dashboards.created_at,
        updated_at: dashboards.updated_at,
        is_active: dashboards.is_active,
        is_published: dashboards.is_published,
        is_default: dashboards.is_default,
        // Category fields
        chart_category_id: chart_categories.chart_category_id,
        category_name: chart_categories.category_name,
        category_description: chart_categories.category_description,
        // Creator fields
        user_id: users.user_id,
        first_name: users.first_name,
        last_name: users.last_name,
        email: users.email,
        // Chart count (aggregated)
        chart_count: count(dashboard_charts.chart_definition_id),
      })
      .from(dashboards)
      .leftJoin(
        chart_categories,
        eq(dashboards.dashboard_category_id, chart_categories.chart_category_id)
      )
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .leftJoin(dashboard_charts, eq(dashboards.dashboard_id, dashboard_charts.dashboard_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        dashboards.dashboard_id,
        dashboards.dashboard_name,
        dashboards.dashboard_description,
        dashboards.layout_config,
        dashboards.dashboard_category_id,
        dashboards.created_by,
        dashboards.created_at,
        dashboards.updated_at,
        dashboards.is_active,
        dashboards.is_published,
        dashboards.is_default,
        chart_categories.chart_category_id,
        chart_categories.category_name,
        chart_categories.category_description,
        users.user_id,
        users.first_name,
        users.last_name,
        users.email
      )
      .orderBy(desc(dashboards.created_at))
      .limit(options.limit ?? 1000000)
      .offset(options.offset ?? 0);

    // Transform to DashboardWithCharts format
    const dashboardsWithChartCount: DashboardWithCharts[] = dashboardList.map((dashboard) => ({
      dashboard_id: dashboard.dashboard_id,
      dashboard_name: dashboard.dashboard_name,
      dashboard_description: dashboard.dashboard_description || undefined,
      layout_config: (dashboard.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: dashboard.dashboard_category_id || undefined,
      created_by: dashboard.created_by,
      created_at: (dashboard.created_at || new Date()).toISOString(),
      updated_at: (dashboard.updated_at || new Date()).toISOString(),
      is_active: dashboard.is_active ?? true,
      is_published: dashboard.is_published ?? false,
      is_default: dashboard.is_default ?? false,
      chart_count: Number(dashboard.chart_count) || 0,
      category: dashboard.chart_category_id
        ? {
            chart_category_id: dashboard.chart_category_id,
            category_name: dashboard.category_name || '',
            category_description: dashboard.category_description || undefined,
          }
        : undefined,
      creator: dashboard.user_id
        ? {
            user_id: dashboard.user_id,
            first_name: dashboard.first_name || '',
            last_name: dashboard.last_name || '',
            email: dashboard.email || '',
          }
        : undefined,
      charts: [], // Charts are loaded separately in getDashboardById for individual dashboards
    }));

    return dashboardsWithChartCount;
  }

  /**
   * Get a specific dashboard by ID with permission checking
   */
  async getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null> {
    this.requireAnyPermission(['analytics:read:organization', 'analytics:read:all']);

    // Get dashboard with creator and category info
    const dashboardResult = await db
      .select()
      .from(dashboards)
      .leftJoin(
        chart_categories,
        eq(dashboards.dashboard_category_id, chart_categories.chart_category_id)
      )
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(eq(dashboards.dashboard_id, dashboardId))
      .limit(1);

    if (dashboardResult.length === 0) {
      return null;
    }

    const dashboard = dashboardResult[0];
    if (!dashboard) {
      // Extra safety: should not happen after length check, but handle gracefully
      log.warn('Dashboard result had length > 0 but first item was null', {
        dashboardId,
      });
      return null;
    }

    // Get chart count
    const [chartCount] = await db
      .select({ count: count() })
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, dashboardId));

    // Get chart details
    const chartDetails = await db
      .select({
        chart_definition_id: chart_definitions.chart_definition_id,
        chart_name: chart_definitions.chart_name,
        chart_description: chart_definitions.chart_description,
        chart_type: chart_definitions.chart_type,
        position_config: dashboard_charts.position_config,
      })
      .from(dashboard_charts)
      .innerJoin(
        chart_definitions,
        eq(dashboard_charts.chart_definition_id, chart_definitions.chart_definition_id)
      )
      .where(eq(dashboard_charts.dashboard_id, dashboardId))
      .orderBy(dashboard_charts.added_at);

    const dashboardWithCharts: DashboardWithCharts = {
      dashboard_id: dashboard.dashboards.dashboard_id,
      dashboard_name: dashboard.dashboards.dashboard_name,
      dashboard_description: dashboard.dashboards.dashboard_description || undefined,
      layout_config: (dashboard.dashboards.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: dashboard.dashboards.dashboard_category_id || undefined,
      created_by: dashboard.dashboards.created_by,
      created_at: (dashboard.dashboards.created_at || new Date()).toISOString(),
      updated_at: (dashboard.dashboards.updated_at || new Date()).toISOString(),
      is_active: dashboard.dashboards.is_active ?? true,
      is_published: dashboard.dashboards.is_published ?? false,
      is_default: dashboard.dashboards.is_default ?? false,
      chart_count: chartCount?.count || 0,
      category: dashboard.chart_categories
        ? {
            chart_category_id: dashboard.chart_categories.chart_category_id,
            category_name: dashboard.chart_categories.category_name,
            category_description: dashboard.chart_categories.category_description || undefined,
          }
        : undefined,
      creator: dashboard.users
        ? {
            user_id: dashboard.users.user_id,
            first_name: dashboard.users.first_name,
            last_name: dashboard.users.last_name,
            email: dashboard.users.email,
          }
        : undefined,
      charts: chartDetails.map((chart) => ({
        chart_definition_id: chart.chart_definition_id,
        chart_name: chart.chart_name,
        chart_description: chart.chart_description || undefined,
        chart_type: chart.chart_type,
        position_config: (chart.position_config as Record<string, unknown>) || undefined,
      })),
    };

    return dashboardWithCharts;
  }

  /**
   * Get dashboard count for pagination
   */
  async getDashboardCount(options: DashboardQueryOptions = {}): Promise<number> {
    this.requireAnyPermission(['analytics:read:organization', 'analytics:read:all']);

    // Build query conditions
    const conditions = [];

    if (options.is_active !== undefined) {
      conditions.push(eq(dashboards.is_active, options.is_active));
    }

    if (options.is_published !== undefined) {
      conditions.push(eq(dashboards.is_published, options.is_published));
    }

    if (options.category_id) {
      const categoryId = parseInt(options.category_id, 10);
      if (!Number.isNaN(categoryId) && categoryId > 0) {
        conditions.push(eq(dashboards.dashboard_category_id, categoryId));
      }
    }

    if (options.search) {
      conditions.push(
        or(
          like(dashboards.dashboard_name, `%${options.search}%`),
          like(dashboards.dashboard_description, `%${options.search}%`)
        )
      );
    }

    const [result] = await db
      .select({ count: count() })
      .from(dashboards)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result?.count || 0;
  }

  /**
   * Create a new dashboard with permission checking
   */
  async createDashboard(dashboardData: CreateDashboardData): Promise<DashboardWithCharts> {
    const startTime = Date.now();

    // Enhanced dashboard creation logging
    log.info('Dashboard creation initiated', {
      requestingUserId: this.userContext.user_id,
      dashboardName: dashboardData.dashboard_name,
      operation: 'create_dashboard',
      securityLevel: 'medium',
    });

    this.requirePermission('analytics:read:all', undefined);

    // If setting this as default, clear any existing default dashboard
    if (dashboardData.is_default === true) {
      await db
        .update(dashboards)
        .set({ is_default: false })
        .where(eq(dashboards.is_default, true));
    }

    // Create new dashboard
    const [newDashboard] = await db
      .insert(dashboards)
      .values({
        dashboard_name: dashboardData.dashboard_name,
        dashboard_description: dashboardData.dashboard_description,
        layout_config: dashboardData.layout_config || {},
        dashboard_category_id: dashboardData.dashboard_category_id,
        created_by: this.userContext.user_id,
        is_active: dashboardData.is_active ?? true,
        is_published: dashboardData.is_published ?? false,
        is_default: dashboardData.is_default ?? false,
      })
      .returning();

    if (!newDashboard) {
      throw new Error('Failed to create dashboard');
    }

    // Add charts to dashboard if provided
    if (dashboardData.chart_ids && dashboardData.chart_ids.length > 0) {
      const chartAssociations = dashboardData.chart_ids.map((chartId: string, index: number) => {
        // Use provided positions or fall back to defaults
        const position = dashboardData.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 };

        return {
          dashboard_id: newDashboard.dashboard_id,
          chart_definition_id: chartId,
          position_config: position,
        };
      });

      await db.insert(dashboard_charts).values(chartAssociations);
    }

    // Return dashboard with full details (more efficient single query)
    const createdDashboards = await db
      .select()
      .from(dashboards)
      .leftJoin(
        chart_categories,
        eq(dashboards.dashboard_category_id, chart_categories.chart_category_id)
      )
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(eq(dashboards.dashboard_id, newDashboard.dashboard_id))
      .limit(1);

    if (createdDashboards.length === 0) {
      throw new Error('Failed to retrieve created dashboard');
    }

    const createdDashboardData = createdDashboards[0];
    if (!createdDashboardData) {
      // Extra safety: should not happen after length check
      log.error('Created dashboard result had length > 0 but first item was null');
      throw new Error('Failed to retrieve created dashboard data');
    }

    // Get chart details for the created dashboard
    const chartDetails = await db
      .select({
        chart_definition_id: chart_definitions.chart_definition_id,
        chart_name: chart_definitions.chart_name,
        chart_description: chart_definitions.chart_description,
        chart_type: chart_definitions.chart_type,
        position_config: dashboard_charts.position_config,
      })
      .from(dashboard_charts)
      .innerJoin(
        chart_definitions,
        eq(dashboard_charts.chart_definition_id, chart_definitions.chart_definition_id)
      )
      .where(eq(dashboard_charts.dashboard_id, newDashboard.dashboard_id))
      .orderBy(dashboard_charts.added_at);

    // Get chart count
    const [chartCount] = await db
      .select({ count: count() })
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, newDashboard.dashboard_id));

    const createdDashboard: DashboardWithCharts = {
      dashboard_id: createdDashboardData.dashboards.dashboard_id,
      dashboard_name: createdDashboardData.dashboards.dashboard_name,
      dashboard_description: createdDashboardData.dashboards.dashboard_description || undefined,
      layout_config:
        (createdDashboardData.dashboards.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: createdDashboardData.dashboards.dashboard_category_id || undefined,
      created_by: createdDashboardData.dashboards.created_by,
      created_at:
        createdDashboardData.dashboards.created_at?.toISOString() || new Date().toISOString(),
      updated_at:
        createdDashboardData.dashboards.updated_at?.toISOString() || new Date().toISOString(),
      is_active: createdDashboardData.dashboards.is_active ?? true,
      is_published: createdDashboardData.dashboards.is_published ?? false,
      is_default: createdDashboardData.dashboards.is_default ?? false,
      chart_count: chartCount?.count || 0,
      category: createdDashboardData.chart_categories
        ? {
            chart_category_id: createdDashboardData.chart_categories.chart_category_id,
            category_name: createdDashboardData.chart_categories.category_name,
            category_description:
              createdDashboardData.chart_categories.category_description || undefined,
          }
        : undefined,
      creator: createdDashboardData.users
        ? {
            user_id: createdDashboardData.users.user_id,
            first_name: createdDashboardData.users.first_name,
            last_name: createdDashboardData.users.last_name,
            email: createdDashboardData.users.email,
          }
        : undefined,
      charts: chartDetails.map((chart) => ({
        chart_definition_id: chart.chart_definition_id,
        chart_name: chart.chart_name,
        chart_description: chart.chart_description || undefined,
        chart_type: chart.chart_type,
        position_config: (chart.position_config as Record<string, unknown>) || undefined,
      })),
    };

    // Enhanced dashboard creation completion logging
    const duration = Date.now() - startTime;

    // Business intelligence for dashboard creation
    log.info('Dashboard creation analytics', {
      operation: 'dashboard_created',
      newDashboardId: newDashboard.dashboard_id,
      dashboardName: dashboardData.dashboard_name,
      createdByUserId: this.userContext.user_id,
      chartCount: dashboardData.chart_ids?.length || 0,
      categoryId: dashboardData.dashboard_category_id,
      isPublished: dashboardData.is_published ?? false,
      duration,
    });

    // Security event for dashboard creation
    log.security('dashboard_created', 'low', {
      action: 'dashboard_creation_success',
      userId: this.userContext.user_id,
      newDashboardId: newDashboard.dashboard_id,
      dashboardName: dashboardData.dashboard_name,
      chartCount: dashboardData.chart_ids?.length || 0,
      complianceValidated: true,
    });

    // Performance monitoring
    log.timing('Dashboard creation completed', startTime, {
      chartAssociationsIncluded: (dashboardData.chart_ids?.length || 0) > 0,
      databaseOperations: dashboardData.chart_ids?.length ? 2 : 1, // dashboard insert + chart associations
    });

    return createdDashboard;
  }

  /**
   * Update a dashboard with permission checking
   */
  async updateDashboard(
    dashboardId: string,
    updateData: UpdateDashboardData
  ): Promise<DashboardWithCharts> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Execute dashboard update and chart management as atomic transaction
    const _updatedDashboard = await db.transaction(async (tx) => {
      // If setting this as default, clear any existing default dashboard
      if (updateData.is_default === true) {
        await tx
          .update(dashboards)
          .set({ is_default: false })
          .where(eq(dashboards.is_default, true));
      }

      // Prepare update data
      const updateFields: Partial<{
        dashboard_name: string;
        dashboard_description: string;
        layout_config: Record<string, unknown>;
        dashboard_category_id: number;
        is_active: boolean;
        is_published: boolean;
        is_default: boolean;
        updated_at: Date;
      }> = {
        ...updateData,
        updated_at: new Date(),
      };

      // Update dashboard
      const [dashboard] = await tx
        .update(dashboards)
        .set(updateFields)
        .where(eq(dashboards.dashboard_id, dashboardId))
        .returning();

      if (!dashboard) {
        throw new Error('Failed to update dashboard');
      }

      // Update chart associations if provided
      if (updateData.chart_ids !== undefined) {
        // First, remove all current chart associations
        await tx.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

        // Then add the new chart associations if provided
        if (updateData.chart_ids.length > 0) {
          const chartAssociations = updateData.chart_ids.map((chartId: string, index: number) => {
            // Use provided positions or fall back to defaults
            const position = updateData.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 };

            return {
              dashboard_id: dashboardId,
              chart_definition_id: chartId,
              position_config: position,
            };
          });

          await tx.insert(dashboard_charts).values(chartAssociations);
        }
      }

      return dashboard;
    });

    // Return updated dashboard with full details (more efficient single query)
    const updatedDashboards = await db
      .select()
      .from(dashboards)
      .leftJoin(
        chart_categories,
        eq(dashboards.dashboard_category_id, chart_categories.chart_category_id)
      )
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(eq(dashboards.dashboard_id, dashboardId))
      .limit(1);

    if (updatedDashboards.length === 0) {
      throw new Error('Failed to retrieve updated dashboard');
    }

    const updatedDashboardData = updatedDashboards[0];
    if (!updatedDashboardData) {
      // Extra safety: should not happen after length check
      log.error('Updated dashboard result had length > 0 but first item was null');
      throw new Error('Failed to retrieve updated dashboard data');
    }

    // Get chart details for the updated dashboard
    const chartDetails = await db
      .select({
        chart_definition_id: chart_definitions.chart_definition_id,
        chart_name: chart_definitions.chart_name,
        chart_description: chart_definitions.chart_description,
        chart_type: chart_definitions.chart_type,
        position_config: dashboard_charts.position_config,
      })
      .from(dashboard_charts)
      .innerJoin(
        chart_definitions,
        eq(dashboard_charts.chart_definition_id, chart_definitions.chart_definition_id)
      )
      .where(eq(dashboard_charts.dashboard_id, dashboardId))
      .orderBy(dashboard_charts.added_at);

    // Get chart count
    const [chartCount] = await db
      .select({ count: count() })
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, dashboardId));

    const dashboardWithCharts: DashboardWithCharts = {
      dashboard_id: updatedDashboardData.dashboards.dashboard_id,
      dashboard_name: updatedDashboardData.dashboards.dashboard_name,
      dashboard_description: updatedDashboardData.dashboards.dashboard_description || undefined,
      layout_config:
        (updatedDashboardData.dashboards.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: updatedDashboardData.dashboards.dashboard_category_id || undefined,
      created_by: updatedDashboardData.dashboards.created_by,
      created_at:
        updatedDashboardData.dashboards.created_at?.toISOString() || new Date().toISOString(),
      updated_at:
        updatedDashboardData.dashboards.updated_at?.toISOString() || new Date().toISOString(),
      is_active: updatedDashboardData.dashboards.is_active ?? true,
      is_published: updatedDashboardData.dashboards.is_published ?? false,
      is_default: updatedDashboardData.dashboards.is_default ?? false,
      chart_count: chartCount?.count || 0,
      category: updatedDashboardData.chart_categories
        ? {
            chart_category_id: updatedDashboardData.chart_categories.chart_category_id,
            category_name: updatedDashboardData.chart_categories.category_name,
            category_description:
              updatedDashboardData.chart_categories.category_description || undefined,
          }
        : undefined,
      creator: updatedDashboardData.users
        ? {
            user_id: updatedDashboardData.users.user_id,
            first_name: updatedDashboardData.users.first_name,
            last_name: updatedDashboardData.users.last_name,
            email: updatedDashboardData.users.email,
          }
        : undefined,
      charts: chartDetails.map((chart) => ({
        chart_definition_id: chart.chart_definition_id,
        chart_name: chart.chart_name,
        chart_description: chart.chart_description || undefined,
        chart_type: chart.chart_type,
        position_config: (chart.position_config as Record<string, unknown>) || undefined,
      })),
    };

    return dashboardWithCharts;
  }

  /**
   * Delete a dashboard with permission checking
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Execute dashboard deletion and chart cleanup as atomic transaction
    await db.transaction(async (tx) => {
      // First, remove all chart associations
      await tx.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

      // Then delete the dashboard
      const [deletedDashboard] = await tx
        .delete(dashboards)
        .where(eq(dashboards.dashboard_id, dashboardId))
        .returning();

      if (!deletedDashboard) {
        throw new Error('Failed to delete dashboard');
      }
    });
  }

  /**
   * Add a chart to a dashboard
   */
  async addChartToDashboard(
    dashboardId: string,
    chartId: string,
    positionConfig?: Record<string, unknown>
  ): Promise<void> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Check if chart association already exists
    const [existingAssociation] = await db
      .select()
      .from(dashboard_charts)
      .where(
        and(
          eq(dashboard_charts.dashboard_id, dashboardId),
          eq(dashboard_charts.chart_definition_id, chartId)
        )
      )
      .limit(1);

    if (existingAssociation) {
      throw new Error('Chart is already associated with this dashboard');
    }

    // Add chart association
    await db.insert(dashboard_charts).values({
      dashboard_id: dashboardId,
      chart_definition_id: chartId,
      position_config: positionConfig || { x: 0, y: 0, w: 6, h: 4 },
    });
  }

  /**
   * Remove a chart from a dashboard
   */
  async removeChartFromDashboard(dashboardId: string, chartId: string): Promise<void> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Remove chart association
    const [deletedAssociation] = await db
      .delete(dashboard_charts)
      .where(
        and(
          eq(dashboard_charts.dashboard_id, dashboardId),
          eq(dashboard_charts.chart_definition_id, chartId)
        )
      )
      .returning();

    if (!deletedAssociation) {
      throw new Error('Chart association not found');
    }
  }

  /**
   * Update chart position in dashboard
   */
  async updateChartPosition(
    dashboardId: string,
    chartId: string,
    positionConfig: Record<string, unknown>
  ): Promise<void> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Update chart position
    const [updatedAssociation] = await db
      .update(dashboard_charts)
      .set({
        position_config: positionConfig,
      })
      .where(
        and(
          eq(dashboard_charts.dashboard_id, dashboardId),
          eq(dashboard_charts.chart_definition_id, chartId)
        )
      )
      .returning();

    if (!updatedAssociation) {
      throw new Error('Chart association not found');
    }
  }
}

/**
 * Factory function to create RBAC Dashboards Service
 */
export function createRBACDashboardsService(userContext: UserContext): RBACDashboardsService {
  return new RBACDashboardsService(userContext);
}
