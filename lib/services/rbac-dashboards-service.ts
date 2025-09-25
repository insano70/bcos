import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createAppLogger } from '@/lib/logger/factory';
import { dashboards, dashboard_charts, chart_definitions, chart_categories, users } from '@/lib/db/schema';
import { eq, and, inArray, isNull, like, or, count, desc } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * Enhanced Dashboards Service with RBAC
 * Provides dashboard management with automatic permission checking and data filtering
 */

// Universal logger for RBAC dashboard service operations
const rbacDashboardsLogger = createAppLogger('rbac-dashboards-service', {
  component: 'business-logic',
  feature: 'dashboard-management',
  businessIntelligence: true
})

export interface CreateDashboardData {
  dashboard_name: string;
  dashboard_description?: string | undefined;
  dashboard_category_id?: number | undefined;
  chart_ids?: string[] | undefined;
  layout_config?: Record<string, unknown> | undefined;
  is_active?: boolean | undefined;
  is_published?: boolean | undefined;
}

export interface UpdateDashboardData {
  dashboard_name?: string;
  dashboard_description?: string;
  dashboard_category_id?: number;
  chart_ids?: string[];
  layout_config?: Record<string, unknown>;
  is_active?: boolean;
  is_published?: boolean;
}

export interface DashboardQueryOptions {
  category_id?: string | undefined;
  is_active?: boolean | undefined;
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
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  is_published: boolean;
  chart_count: number;
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
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all'
    ]);

    // Build query conditions
    const conditions = [];

    if (options.is_active !== undefined) {
      conditions.push(eq(dashboards.is_active, options.is_active));
    }

    if (options.category_id) {
      conditions.push(eq(dashboards.dashboard_category_id, parseInt(options.category_id)));
    }

    if (options.search) {
      conditions.push(
        or(
          like(dashboards.dashboard_name, `%${options.search}%`),
          like(dashboards.dashboard_description, `%${options.search}%`)
        )
      );
    }

    // Fetch dashboards with creator and category info
    const dashboardList = await db
      .select()
      .from(dashboards)
      .leftJoin(chart_categories, eq(dashboards.dashboard_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dashboards.created_at))
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    // Get chart count for each dashboard
    const dashboardsWithChartCount = await Promise.all(
      dashboardList.map(async (dashboard) => {
        const [chartCount] = await db
          .select({ count: count() })
          .from(dashboard_charts)
          .where(eq(dashboard_charts.dashboard_id, dashboard.dashboards.dashboard_id));

        return {
          dashboard_id: dashboard.dashboards.dashboard_id,
          dashboard_name: dashboard.dashboards.dashboard_name,
          dashboard_description: dashboard.dashboards.dashboard_description || undefined,
          layout_config: dashboard.dashboards.layout_config as Record<string, unknown> || {},
          dashboard_category_id: dashboard.dashboards.dashboard_category_id || undefined,
          created_by: dashboard.dashboards.created_by,
          created_at: dashboard.dashboards.created_at || new Date(),
          updated_at: dashboard.dashboards.updated_at || new Date(),
          is_active: dashboard.dashboards.is_active,
          is_published: dashboard.dashboards.is_published,
          chart_count: chartCount?.count || 0,
          category: dashboard.chart_categories ? {
            chart_category_id: dashboard.chart_categories.chart_category_id,
            category_name: dashboard.chart_categories.category_name,
            category_description: dashboard.chart_categories.category_description || undefined
          } : undefined,
          creator: dashboard.users ? {
            user_id: dashboard.users.user_id,
            first_name: dashboard.users.first_name,
            last_name: dashboard.users.last_name,
            email: dashboard.users.email
          } : undefined
        } as DashboardWithCharts;
      })
    );

    return dashboardsWithChartCount;
  }

  /**
   * Get a specific dashboard by ID with permission checking
   */
  async getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null> {
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all'
    ]);

    // Get dashboard with creator and category info
    const dashboardResult = await db
      .select()
      .from(dashboards)
      .leftJoin(chart_categories, eq(dashboards.dashboard_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(eq(dashboards.dashboard_id, dashboardId))
      .limit(1);

    if (dashboardResult.length === 0) {
      return null;
    }

    const dashboard = dashboardResult[0]!; // Safe after length check

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
        position_config: dashboard_charts.position_config
      })
      .from(dashboard_charts)
      .innerJoin(chart_definitions, eq(dashboard_charts.chart_definition_id, chart_definitions.chart_definition_id))
      .where(eq(dashboard_charts.dashboard_id, dashboardId))
      .orderBy(dashboard_charts.added_at);

    const dashboardWithCharts: DashboardWithCharts = {
      dashboard_id: dashboard.dashboards.dashboard_id,
      dashboard_name: dashboard.dashboards.dashboard_name,
      dashboard_description: dashboard.dashboards.dashboard_description || undefined,
      layout_config: dashboard.dashboards.layout_config as Record<string, unknown> || {},
      dashboard_category_id: dashboard.dashboards.dashboard_category_id || undefined,
      created_by: dashboard.dashboards.created_by,
      created_at: dashboard.dashboards.created_at || new Date(),
      updated_at: dashboard.dashboards.updated_at || new Date(),
      is_active: dashboard.dashboards.is_active ?? true,
      is_published: dashboard.dashboards.is_published ?? false,
      chart_count: chartCount?.count || 0,
      category: dashboard.chart_categories ? {
        chart_category_id: dashboard.chart_categories.chart_category_id,
        category_name: dashboard.chart_categories.category_name,
        category_description: dashboard.chart_categories.category_description || undefined
      } : undefined,
      creator: dashboard.users ? {
        user_id: dashboard.users.user_id,
        first_name: dashboard.users.first_name,
        last_name: dashboard.users.last_name,
        email: dashboard.users.email
      } : undefined,
      charts: chartDetails.map(chart => ({
        chart_definition_id: chart.chart_definition_id,
        chart_name: chart.chart_name,
        chart_description: chart.chart_description || undefined,
        chart_type: chart.chart_type,
        position_config: chart.position_config as Record<string, unknown> || undefined
      }))
    };

    return dashboardWithCharts;
  }

  /**
   * Get dashboard count for pagination
   */
  async getDashboardCount(options: DashboardQueryOptions = {}): Promise<number> {
    this.requireAnyPermission([
      'analytics:read:organization',
      'analytics:read:all'
    ]);

    // Build query conditions
    const conditions = [];

    if (options.is_active !== undefined) {
      conditions.push(eq(dashboards.is_active, options.is_active));
    }

    if (options.category_id) {
      conditions.push(eq(dashboards.dashboard_category_id, parseInt(options.category_id)));
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
    if (true) {
      rbacDashboardsLogger.info('Dashboard creation initiated', {
        requestingUserId: this.userContext.user_id,
        dashboardName: dashboardData.dashboard_name,
        operation: 'create_dashboard',
        securityLevel: 'medium'
      });
    }

    this.requirePermission('analytics:read:all', undefined);

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
        is_published: dashboardData.is_published ?? false
      })
      .returning();

    if (!newDashboard) {
      throw new Error('Failed to create dashboard');
    }

    // Add charts to dashboard if provided
    if (dashboardData.chart_ids && dashboardData.chart_ids.length > 0) {
      const chartAssociations = dashboardData.chart_ids.map((chartId: string, index: number) => ({
        dashboard_id: newDashboard.dashboard_id,
        chart_definition_id: chartId,
        position_config: { x: 0, y: index, w: 6, h: 4 } // Default layout
      }));

      await db
        .insert(dashboard_charts)
        .values(chartAssociations);
    }

    // Return dashboard with full details
    const createdDashboard = await this.getDashboardById(newDashboard.dashboard_id);
    if (!createdDashboard) {
      throw new Error('Failed to retrieve created dashboard');
    }

    // Enhanced dashboard creation completion logging
    if (true) {
      const duration = Date.now() - startTime;

      // Business intelligence for dashboard creation
      rbacDashboardsLogger.info('Dashboard creation analytics', {
        operation: 'dashboard_created',
        newDashboardId: newDashboard.dashboard_id,
        dashboardName: dashboardData.dashboard_name,
        createdByUserId: this.userContext.user_id,
        chartCount: dashboardData.chart_ids?.length || 0,
        categoryId: dashboardData.dashboard_category_id,
        isPublished: dashboardData.is_published ?? false,
        duration
      });

      // Security event for dashboard creation
      rbacDashboardsLogger.security('dashboard_created', 'low', {
        action: 'dashboard_creation_success',
        userId: this.userContext.user_id,
        newDashboardId: newDashboard.dashboard_id,
        dashboardName: dashboardData.dashboard_name,
        chartCount: dashboardData.chart_ids?.length || 0,
        complianceValidated: true
      });

      // Performance monitoring
      rbacDashboardsLogger.timing('Dashboard creation completed', startTime, {
        chartAssociationsIncluded: (dashboardData.chart_ids?.length || 0) > 0,
        databaseOperations: dashboardData.chart_ids?.length ? 2 : 1 // dashboard insert + chart associations
      });
    }

    return createdDashboard;
  }

  /**
   * Update a dashboard with permission checking
   */
  async updateDashboard(dashboardId: string, updateData: UpdateDashboardData): Promise<DashboardWithCharts> {
    this.requirePermission('analytics:read:all', undefined);

    // Check if dashboard exists
    const existingDashboard = await this.getDashboardById(dashboardId);
    if (!existingDashboard) {
      throw new Error('Dashboard not found');
    }

    // Execute dashboard update and chart management as atomic transaction
    const updatedDashboard = await db.transaction(async (tx) => {
      // Prepare update data
      const updateFields: Partial<{
        dashboard_name: string;
        dashboard_description: string;
        layout_config: Record<string, unknown>;
        dashboard_category_id: number;
        is_active: boolean;
        is_published: boolean;
        updated_at: Date;
      }> = {
        ...updateData,
        updated_at: new Date()
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
        await tx
          .delete(dashboard_charts)
          .where(eq(dashboard_charts.dashboard_id, dashboardId));

        // Then add the new chart associations if provided
        if (updateData.chart_ids.length > 0) {
          const chartAssociations = updateData.chart_ids.map((chartId: string, index: number) => ({
            dashboard_id: dashboardId,
            chart_definition_id: chartId,
            position_config: { x: 0, y: index, w: 6, h: 4 } // Default layout
          }));

          await tx.insert(dashboard_charts).values(chartAssociations);
        }
      }

      return dashboard;
    });

    // Return updated dashboard with full details
    const dashboardWithCharts = await this.getDashboardById(dashboardId);
    if (!dashboardWithCharts) {
      throw new Error('Failed to retrieve updated dashboard');
    }

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
      await tx
        .delete(dashboard_charts)
        .where(eq(dashboard_charts.dashboard_id, dashboardId));

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
  async addChartToDashboard(dashboardId: string, chartId: string, positionConfig?: Record<string, unknown>): Promise<void> {
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
      .where(and(
        eq(dashboard_charts.dashboard_id, dashboardId),
        eq(dashboard_charts.chart_definition_id, chartId)
      ))
      .limit(1);

    if (existingAssociation) {
      throw new Error('Chart is already associated with this dashboard');
    }

    // Add chart association
    await db
      .insert(dashboard_charts)
      .values({
        dashboard_id: dashboardId,
        chart_definition_id: chartId,
        position_config: positionConfig || { x: 0, y: 0, w: 6, h: 4 }
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
      .where(and(
        eq(dashboard_charts.dashboard_id, dashboardId),
        eq(dashboard_charts.chart_definition_id, chartId)
      ))
      .returning();

    if (!deletedAssociation) {
      throw new Error('Chart association not found');
    }
  }

  /**
   * Update chart position in dashboard
   */
  async updateChartPosition(dashboardId: string, chartId: string, positionConfig: Record<string, unknown>): Promise<void> {
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
        position_config: positionConfig
      })
      .where(and(
        eq(dashboard_charts.dashboard_id, dashboardId),
        eq(dashboard_charts.chart_definition_id, chartId)
      ))
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
