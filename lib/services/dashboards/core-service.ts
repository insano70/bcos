/**
 * Dashboard Core Service
 *
 * Handles core CRUD operations for dashboards with full RBAC enforcement.
 * Delegates to specialized services for chart associations and default handling.
 *
 * Responsibilities:
 * - Read: getDashboards, getDashboardById, getDashboardCount
 * - Create: createDashboard
 * - Update: updateDashboard
 * - Delete: deleteDashboard
 *
 * Architecture:
 * - Extends BaseDashboardsService for shared RBAC helpers
 * - Uses mappers.ts for result transformation
 * - Delegates to chart-associations.ts for chart management
 * - Delegates to default-handler.ts for default dashboard logic
 * - Uses query-builder.ts for reusable queries
 */

// 1. Drizzle ORM
import { and, count, desc, eq } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { dashboard_charts, dashboards } from '@/lib/db/schema';
// 6. Logger
import {
  calculateChanges,
  log,
  logTemplates,
  SLOW_THRESHOLDS,
  sanitizeFilters,
} from '@/lib/logger';
import type {
  CreateDashboardData,
  DashboardQueryOptions,
  DashboardWithCharts,
  UpdateDashboardData,
} from '@/lib/types/dashboards';
// 7. Types
import type { UserContext } from '@/lib/types/rbac';
// 3. Base service
import { BaseDashboardsService } from './base-service';
// 4. Sub-services
import { createDashboardChartAssociationsService } from './chart-associations';
import { createDashboardDefaultHandlerService } from './default-handler';
import { mapDashboardList, mapDashboardResult } from './mappers';
// 5. Query builder and mappers
import { getDashboardChartDetails, getDashboardQueryBuilder } from './query-builder';

/**
 * Default query limit for unbounded list operations
 */
const DEFAULT_QUERY_LIMIT = 1000000;

/**
 * Dashboard Core Service
 *
 * Main CRUD service for dashboards.
 * Uses composition pattern - delegates to specialized services.
 *
 * @internal - Use factory function instead
 */
class DashboardCoreService extends BaseDashboardsService {
  private chartService: ReturnType<typeof createDashboardChartAssociationsService>;
  private defaultHandler: ReturnType<typeof createDashboardDefaultHandlerService>;

  constructor(userContext: UserContext) {
    super(userContext);
    this.chartService = createDashboardChartAssociationsService(userContext);
    this.defaultHandler = createDashboardDefaultHandlerService(userContext);
  }

  /**
   * Get all dashboards with RBAC filtering and batch-optimized chart counts
   *
   * Performs single query with LEFT JOIN for chart count aggregation.
   * Organization scoping: NULL organization_id = universal (all orgs can see).
   *
   * RBAC filtering applied via base class helper buildBaseDashboardWhereConditions().
   *
   * @param options - Optional filters (category, active, published, search, limit, offset)
   * @returns Array of dashboards with chart counts and metadata
   * @throws PermissionDeniedError if user lacks required permissions
   *
   * @example
   * ```typescript
   * const dashboards = await service.getDashboards({ is_active: true, limit: 50 });
   * ```
   */
  async getDashboards(options: DashboardQueryOptions = {}): Promise<DashboardWithCharts[]> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    // Build RBAC conditions using base class helper
    const conditions = this.buildBaseDashboardWhereConditions(options);

    // Execute query with timing
    const queryStart = Date.now();
    const dashboardList = await getDashboardQueryBuilder()
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dashboards.created_at))
      .limit(options.limit ?? DEFAULT_QUERY_LIMIT)
      .offset(options.offset ?? 0);
    const queryDuration = Date.now() - queryStart;

    // Map results using shared mapper
    const results = mapDashboardList(dashboardList);

    const duration = Date.now() - startTime;

    // Log with logTemplates
    const template = logTemplates.crud.list('dashboards', {
      userId: this.userContext.user_id,
      ...(this.userContext.current_organization_id && {
        organizationId: this.userContext.current_organization_id,
      }),
      filters: sanitizeFilters(options as Record<string, unknown>),
      results: {
        returned: results.length,
        total: results.length,
        page: options.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : 1,
      },
      duration,
      metadata: {
        query: {
          duration: queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);

    return results;
  }

  /**
   * Get a specific dashboard by ID with permission checking
   *
   * Loads full dashboard details including category, creator, and associated charts.
   * Performs 2 separate queries for optimal performance:
   * 1. Dashboard with category/creator (via query builder)
   * 2. Chart details (via getDashboardChartDetails)
   *
   * @param dashboardId - Dashboard ID to retrieve
   * @returns Dashboard with full details or null if not found
   * @throws PermissionDeniedError if user lacks required permissions
   *
   * @example
   * ```typescript
   * const dashboard = await service.getDashboardById('dash-123');
   * ```
   */
  async getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    // Get dashboard with creator and category info using query builder
    const queryStart = Date.now();
    const dashboardResult = await getDashboardQueryBuilder()
      .where(eq(dashboards.dashboard_id, dashboardId))
      .limit(1);
    const queryDuration = Date.now() - queryStart;

    if (dashboardResult.length === 0) {
      const duration = Date.now() - startTime;
      const template = logTemplates.crud.read('dashboard', {
        resourceId: dashboardId,
        userId: this.userContext.user_id,
        found: false,
        duration,
        metadata: {
          query: {
            duration: queryDuration,
            slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
          },
          rbacScope: this.getDashboardRBACScope(),
          component: 'service',
        },
      });
      log.info(template.message, template.context);
      return null;
    }

    const dashboard = dashboardResult[0];
    if (!dashboard) {
      log.warn('Dashboard result had length > 0 but first item was null', { dashboardId });
      return null;
    }

    // Get chart details using query builder helper
    const chartsStart = Date.now();
    const chartDetails = await getDashboardChartDetails(dashboardId);
    const chartsDuration = Date.now() - chartsStart;

    // Map using shared mapper
    const dashboardWithCharts = mapDashboardResult(dashboard, chartDetails);

    const duration = Date.now() - startTime;

    // Log with logTemplates
    const template = logTemplates.crud.read('dashboard', {
      resourceId: dashboardId,
      resourceName: dashboardWithCharts.dashboard_name,
      userId: this.userContext.user_id,
      found: true,
      duration,
      metadata: {
        query: {
          duration: queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartsQuery: {
          duration: chartsDuration,
          slow: chartsDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartCount: dashboardWithCharts.chart_count,
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);

    return dashboardWithCharts;
  }

  /**
   * Get dashboard count for pagination
   *
   * Counts dashboards based on RBAC filtering and optional filters.
   * Uses same RBAC logic as getDashboards for consistency.
   *
   * @param options - Optional filters (category, active, published, search)
   * @returns Total count of accessible dashboards
   * @throws PermissionDeniedError if user lacks required permissions
   *
   * @example
   * ```typescript
   * const total = await service.getDashboardCount({ is_active: true });
   * ```
   */
  async getDashboardCount(options: DashboardQueryOptions = {}): Promise<number> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    // Build RBAC conditions using base class helper
    const conditions = this.buildBaseDashboardWhereConditions(options);

    // Execute count query
    const queryStart = Date.now();
    const [result] = await db
      .select({ count: count() })
      .from(dashboards)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const queryDuration = Date.now() - queryStart;

    const total = Number(result?.count) || 0;
    const duration = Date.now() - startTime;

    // Log count operation
    log.info('dashboards counted', {
      operation: 'count_dashboards',
      userId: this.userContext.user_id,
      ...(this.userContext.current_organization_id && {
        organizationId: this.userContext.current_organization_id,
      }),
      filters: sanitizeFilters(options as Record<string, unknown>),
      count: total,
      duration,
      metadata: {
        query: {
          duration: queryDuration,
          slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });

    return total;
  }

  /**
   * Create a new dashboard with permission checking
   *
   * Creates dashboard with optional chart associations. Handles default dashboard
   * logic (clears existing default if this is set as default).
   *
   * Organization logic:
   * - undefined: defaults to user's current_organization_id (or null if none)
   * - null: creates universal dashboard (visible to all orgs)
   * - UUID: creates org-specific dashboard (requires org access)
   *
   * @param data - Dashboard creation data
   * @returns Created dashboard with full details
   * @throws PermissionDeniedError if user lacks required permissions
   * @throws Error if organization access validation fails
   *
   * @example
   * ```typescript
   * const dashboard = await service.createDashboard({
   *   dashboard_name: 'Q1 Sales',
   *   organization_id: 'org-123',
   *   chart_ids: ['chart-1', 'chart-2'],
   * });
   * ```
   */
  async createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    // Determine organization_id for dashboard
    let organizationId: string | null;
    if (data.organization_id === undefined) {
      // Default to user's current organization, or null if none
      organizationId = this.userContext.current_organization_id || null;
    } else {
      // Explicitly set (null for universal, or specific UUID)
      organizationId = data.organization_id;
    }

    // Validate organization access using base class helper
    if (organizationId && !this.canAccessDashboardOrganization(organizationId)) {
      throw new Error(`Cannot create dashboard for organization ${organizationId}: Access denied`);
    }

    // If setting this as default, clear existing default
    if (data.is_default === true) {
      await this.defaultHandler.clearExistingDefault();
    }

    // Create new dashboard
    const insertStart = Date.now();
    const [newDashboard] = await db
      .insert(dashboards)
      .values({
        dashboard_name: data.dashboard_name,
        dashboard_description: data.dashboard_description,
        layout_config: data.layout_config || {},
        dashboard_category_id: data.dashboard_category_id,
        organization_id: organizationId,
        created_by: this.userContext.user_id,
        is_active: data.is_active ?? true,
        is_published: data.is_published ?? false,
        is_default: data.is_default ?? false,
      })
      .returning();
    const insertDuration = Date.now() - insertStart;

    if (!newDashboard) {
      throw new Error('Failed to create dashboard');
    }

    // Add charts to dashboard if provided (delegate to chart service)
    if (data.chart_ids && data.chart_ids.length > 0) {
      await this.chartService.addChartsToDashboard(
        newDashboard.dashboard_id,
        data.chart_ids,
        data.chart_positions
      );
    }

    // Fetch created dashboard with full details
    const createdDashboard = await this.getDashboardById(newDashboard.dashboard_id);
    if (!createdDashboard) {
      throw new Error('Failed to retrieve created dashboard');
    }

    const duration = Date.now() - startTime;

    // Log with logTemplates - SINGLE LOG STATEMENT
    const template = logTemplates.crud.create('dashboard', {
      resourceId: newDashboard.dashboard_id,
      resourceName: data.dashboard_name,
      userId: this.userContext.user_id,
      ...(organizationId && { organizationId }),
      duration,
      metadata: {
        insertQuery: {
          duration: insertDuration,
          slow: insertDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartCount: data.chart_ids?.length || 0,
        categoryId: data.dashboard_category_id,
        isPublished: data.is_published ?? false,
        isDefault: data.is_default ?? false,
        organizationScope: organizationId ? 'organization-specific' : 'universal',
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);

    return createdDashboard;
  }

  /**
   * Update a dashboard with permission checking
   *
   * Updates dashboard and optionally chart associations. Uses transaction for
   * chart updates. Supports changing organization scope and default status.
   *
   * Change tracking:
   * - Uses calculateChanges() for audit trail
   * - Logs all field changes
   *
   * @param dashboardId - Dashboard ID to update
   * @param data - Dashboard update data
   * @returns Updated dashboard with full details
   * @throws PermissionDeniedError if user lacks required permissions
   * @throws Error if dashboard not found or organization access validation fails
   *
   * @example
   * ```typescript
   * const updated = await service.updateDashboard('dash-123', {
   *   dashboard_name: 'Updated Name',
   *   is_published: true,
   * });
   * ```
   */
  async updateDashboard(
    dashboardId: string,
    data: UpdateDashboardData
  ): Promise<DashboardWithCharts> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    // Check if dashboard exists
    const existing = await this.getDashboardById(dashboardId);
    if (!existing) {
      throw new Error('Dashboard not found');
    }

    // Validate dashboard access using base class
    await this.validateDashboardAccess({
      dashboard_id: dashboardId,
      created_by: existing.created_by,
      organization_id: existing.organization_id || null,
    });

    // If changing organization_id, validate access
    if (data.organization_id !== undefined) {
      if (data.organization_id !== null) {
        // Changing to specific org - validate user has access
        if (!this.canAccessDashboardOrganization(data.organization_id)) {
          throw new Error(
            `Cannot assign dashboard to organization ${data.organization_id}: Access denied`
          );
        }
      }
      // null is allowed (making it universal)
    }

    // Calculate changes for audit trail
    const changes = calculateChanges(existing, data, [
      'dashboard_name',
      'dashboard_description',
      'dashboard_category_id',
      'organization_id',
      'is_active',
      'is_published',
      'is_default',
      'layout_config',
    ]);

    // Execute dashboard update and chart management as atomic transaction
    const updateStart = Date.now();
    await db.transaction(async (tx) => {
      // If setting this as default, clear existing default
      if (data.is_default === true) {
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
        organization_id: string | null;
        is_active: boolean;
        is_published: boolean;
        is_default: boolean;
        updated_at: Date;
      }> = {
        ...data,
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

      // Update chart associations if provided (within transaction context)
      if (data.chart_ids !== undefined) {
        // Replace charts inline (we're already in a transaction)
        await tx.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

        if (data.chart_ids.length > 0) {
          const chartAssociations = data.chart_ids.map((chartId: string, index: number) => {
            const position = data.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 };
            return {
              dashboard_id: dashboardId,
              chart_definition_id: chartId,
              position_config: position,
              added_at: new Date(),
            };
          });

          await tx.insert(dashboard_charts).values(chartAssociations);
        }
      }
    });
    const updateDuration = Date.now() - updateStart;

    // Fetch updated dashboard with full details
    const updatedDashboard = await this.getDashboardById(dashboardId);
    if (!updatedDashboard) {
      throw new Error('Failed to retrieve updated dashboard');
    }

    const duration = Date.now() - startTime;

    // Log with logTemplates including calculateChanges
    const template = logTemplates.crud.update('dashboard', {
      resourceId: dashboardId,
      resourceName: existing.dashboard_name,
      userId: this.userContext.user_id,
      changes,
      duration,
      metadata: {
        updateTransaction: {
          duration: updateDuration,
          slow: updateDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        fieldsChanged: Object.keys(changes).length,
        chartAssociationsUpdated: data.chart_ids !== undefined,
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);

    return updatedDashboard;
  }

  /**
   * Delete a dashboard with permission checking
   *
   * Permanently deletes dashboard and all chart associations. Uses transaction
   * for atomic deletion.
   *
   * @param dashboardId - Dashboard ID to delete
   * @throws PermissionDeniedError if user lacks required permissions
   * @throws Error if dashboard not found or deletion fails
   *
   * @example
   * ```typescript
   * await service.deleteDashboard('dash-123');
   * ```
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    const startTime = Date.now();

    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    // Check if dashboard exists
    const existing = await this.getDashboardById(dashboardId);
    if (!existing) {
      throw new Error('Dashboard not found');
    }

    // Validate dashboard access using base class
    await this.validateDashboardAccess({
      dashboard_id: dashboardId,
      created_by: existing.created_by,
      organization_id: existing.organization_id || null,
    });

    // Execute dashboard deletion and chart cleanup as atomic transaction
    const deleteStart = Date.now();
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
    const deleteDuration = Date.now() - deleteStart;

    const duration = Date.now() - startTime;

    // Log with logTemplates
    const template = logTemplates.crud.delete('dashboard', {
      resourceId: dashboardId,
      resourceName: existing.dashboard_name,
      userId: this.userContext.user_id,
      soft: false, // Hard delete
      duration,
      metadata: {
        deleteTransaction: {
          duration: deleteDuration,
          slow: deleteDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartCount: existing.chart_count,
        rbacScope: this.getDashboardRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Dashboard Core Service
 *
 * Factory function to create a new dashboard core service instance
 * with automatic RBAC enforcement.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Dashboard core service instance
 *
 * @example
 * ```typescript
 * const service = createDashboardCoreService(userContext);
 *
 * // List dashboards
 * const dashboards = await service.getDashboards({ is_active: true });
 *
 * // Get single dashboard
 * const dashboard = await service.getDashboardById('dash-123');
 *
 * // Create dashboard
 * const newDashboard = await service.createDashboard({
 *   dashboard_name: 'Q1 Sales Dashboard',
 *   organization_id: 'org-123',
 *   chart_ids: ['chart-1', 'chart-2'],
 * });
 *
 * // Update dashboard
 * const updated = await service.updateDashboard('dash-123', {
 *   dashboard_name: 'Updated Name',
 * });
 *
 * // Delete dashboard
 * await service.deleteDashboard('dash-123');
 * ```
 */
export function createDashboardCoreService(userContext: UserContext) {
  return new DashboardCoreService(userContext);
}
