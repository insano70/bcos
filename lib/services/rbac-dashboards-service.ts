import { and, count, desc, eq, inArray, isNull, like, or, type SQL, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chart_categories,
  chart_definitions,
  dashboard_charts,
  dashboards,
  users,
} from '@/lib/db/schema';
import {
  calculateChanges,
  log,
  logTemplates,
  SLOW_THRESHOLDS,
  sanitizeFilters,
} from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * RBAC Dashboards Service
 *
 * Manages dashboard CRUD operations with comprehensive RBAC filtering and
 * multi-tenancy support. Provides full lifecycle management for dashboards
 * including organization scoping and default dashboard handling.
 *
 * ## Key Features
 * - Full CRUD operations with RBAC filtering
 * - Organization scoping (universal, org-specific, or user-owned)
 * - Default dashboard management
 * - Category and creator metadata
 * - Batch-optimized queries with chart counts
 * - Performance tracking with SLOW_THRESHOLDS
 *
 * ## RBAC Scopes
 * - `all`: Super admins and users with `dashboards:*:all` permissions
 * - `organization`: Users with `dashboards:*:organization` (filtered by accessible_organizations)
 * - `own`: Users with `dashboards:*:own` (only their created dashboards)
 * - `none`: No access (throws AuthorizationError)
 *
 * ## Organization Scoping
 * - `null`: Universal dashboard (visible to all organizations)
 * - `UUID`: Organization-specific dashboard (visible only to that org + users with access)
 * - Filtering logic: (universal OR user's accessible orgs) based on RBAC scope
 *
 * @example
 * // Create service instance
 * const dashboardService = createRBACDashboardsService(userContext);
 *
 * // List all accessible dashboards
 * const dashboards = await dashboardService.getDashboards({ is_active: true });
 *
 * // Create new dashboard
 * const newDashboard = await dashboardService.createDashboard({
 *   dashboard_name: 'Q1 Sales Dashboard',
 *   organization_id: 'org-123',
 *   is_published: true,
 * });
 *
 * // Update dashboard
 * const updated = await dashboardService.updateDashboard('dash-123', {
 *   dashboard_name: 'Q1 Sales Dashboard (Updated)',
 *   is_active: true,
 * });
 */

export interface CreateDashboardData {
  dashboard_name: string;
  dashboard_description?: string | undefined;
  dashboard_category_id?: number | undefined;
  /**
   * Organization ID for dashboard scoping
   * - undefined: defaults to user's current_organization_id (or null if none)
   * - null: creates universal dashboard (visible to all orgs)
   * - UUID: creates org-specific dashboard (visible only to that org)
   */
  organization_id?: string | null | undefined;
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
  /**
   * Organization ID for dashboard scoping
   * - undefined: don't update (keep existing value)
   * - null: set to universal dashboard (visible to all orgs)
   * - UUID: set to org-specific dashboard (visible only to that org)
   */
  organization_id?: string | null;
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
  /**
   * Filter by organization
   * - undefined: apply RBAC-based filtering (universal + user's orgs)
   * - null: only universal dashboards
   * - UUID: only dashboards for that specific org (+ universal)
   */
  organization_id?: string | null | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface DashboardWithCharts {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | undefined;
  layout_config: Record<string, unknown>;
  dashboard_category_id: number | undefined;
  organization_id: string | undefined;
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

export interface DashboardsServiceInterface {
  getDashboards(options?: DashboardQueryOptions): Promise<DashboardWithCharts[]>;
  getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null>;
  getDashboardCount(options?: DashboardQueryOptions): Promise<number>;
  createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts>;
  updateDashboard(dashboardId: string, data: UpdateDashboardData): Promise<DashboardWithCharts>;
  deleteDashboard(dashboardId: string): Promise<void>;
}

/**
 * Internal implementation of RBAC Dashboards Service
 */
class RBACDashboardsServiceImpl implements DashboardsServiceInterface {
  // Permission flags cached in constructor
  private readonly canReadAll: boolean;
  private readonly canReadOrganization: boolean;
  private readonly canReadOwn: boolean;
  private readonly canCreate: boolean;
  private readonly canManage: boolean;
  private readonly accessibleOrgIds: string[];

  constructor(private readonly userContext: UserContext) {
    // Cache permission checks
    this.canReadAll =
      userContext.is_super_admin ||
      userContext.all_permissions?.some((p) => p.name === 'dashboards:read:all') ||
      false;
    this.canReadOrganization =
      userContext.all_permissions?.some((p) => p.name === 'dashboards:read:organization') || false;
    this.canReadOwn =
      userContext.all_permissions?.some((p) => p.name === 'dashboards:read:own') || false;
    this.canCreate =
      userContext.all_permissions?.some((p) => p.name === 'dashboards:create:organization') ||
      false;
    this.canManage =
      userContext.all_permissions?.some((p) => p.name === 'dashboards:manage:all') || false;

    // Cache accessible organization IDs
    this.accessibleOrgIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Build WHERE conditions based on RBAC scope
   */
  private buildRBACWhereConditions(options: DashboardQueryOptions = {}): SQL[] {
    const conditions: SQL[] = [];

    // Apply RBAC-based organization filtering
    const scope = this.getRBACScope();
    switch (scope) {
      case 'own':
        // Own scope: user's dashboards only
        conditions.push(eq(dashboards.created_by, this.userContext.user_id));

        // Also apply org filter (universal OR user's orgs)
        if (this.accessibleOrgIds.length > 0) {
          const orgCondition = or(
            isNull(dashboards.organization_id), // Universal dashboards
            inArray(dashboards.organization_id, this.accessibleOrgIds)
          );
          if (orgCondition) {
            conditions.push(orgCondition);
          }
        } else {
          // No orgs - only universal dashboards
          conditions.push(isNull(dashboards.organization_id));
        }
        break;

      case 'organization':
        // Organization scope: universal OR user's accessible orgs
        if (this.accessibleOrgIds.length > 0) {
          const orgCondition = or(
            isNull(dashboards.organization_id), // Universal dashboards
            inArray(dashboards.organization_id, this.accessibleOrgIds)
          );
          if (orgCondition) {
            conditions.push(orgCondition);
          }
        } else {
          // No accessible orgs - only universal dashboards
          conditions.push(isNull(dashboards.organization_id));
        }
        break;

      case 'all':
        // Super admin - no organization filter (see everything)
        break;

      case 'none':
        // No access - return no results
        conditions.push(sql`1=0`);
        break;
    }

    // Apply additional filters
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
      const searchCondition = or(
        like(dashboards.dashboard_name, `%${options.search}%`),
        like(dashboards.dashboard_description, `%${options.search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    return conditions;
  }

  /**
   * Check if user can access specific organization
   */
  private canAccessOrganization(organizationId: string | null): boolean {
    if (organizationId === null) return true; // Universal dashboards
    if (this.canReadAll || this.canManage) return true;
    if (this.canReadOrganization || this.canCreate) {
      return this.accessibleOrgIds.includes(organizationId);
    }
    return false;
  }

  /**
   * Get RBAC scope for logging
   */
  private getRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll || this.canManage) return 'all';
    if (this.canReadOrganization || this.canCreate) return 'organization';
    if (this.canReadOwn) return 'own';
    return 'none';
  }

  /**
   * Get all dashboards with RBAC filtering and batch-optimized chart counts
   *
   * Performs single query with LEFT JOIN for chart count aggregation.
   * Organization scoping: NULL organization_id = universal (all orgs can see).
   *
   * @param options - Optional filters (category, active, published, search, limit, offset)
   * @returns Array of dashboards with chart counts and metadata
   * @throws {AuthorizationError} If user lacks required permissions
   * @example
   * const dashboards = await service.getDashboards({ is_active: true, limit: 50 });
   */
  async getDashboards(options: DashboardQueryOptions = {}): Promise<DashboardWithCharts[]> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
      throw new PermissionDeniedError(
        'Insufficient permissions to read dashboards',
        this.userContext.user_id
      );
    }

    // Build query conditions
    const conditions = this.buildRBACWhereConditions(options);

    // Execute query with timing
    const queryStart = Date.now();
    const dashboardList = await db
      .select({
        // Dashboard fields
        dashboard_id: dashboards.dashboard_id,
        dashboard_name: dashboards.dashboard_name,
        dashboard_description: dashboards.dashboard_description,
        layout_config: dashboards.layout_config,
        dashboard_category_id: dashboards.dashboard_category_id,
        organization_id: dashboards.organization_id,
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
        dashboards.organization_id,
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
    const queryDuration = Date.now() - queryStart;

    // Transform to DashboardWithCharts format
    const results: DashboardWithCharts[] = dashboardList.map((dashboard) => ({
      dashboard_id: dashboard.dashboard_id,
      dashboard_name: dashboard.dashboard_name,
      dashboard_description: dashboard.dashboard_description || undefined,
      layout_config: (dashboard.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: dashboard.dashboard_category_id || undefined,
      organization_id: dashboard.organization_id || undefined,
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
      charts: [], // Charts are loaded separately in getDashboardById
    }));

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
        rbacScope: this.getRBACScope(),
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
   * Performs 3 separate queries for optimal performance.
   *
   * @param dashboardId - Dashboard ID to retrieve
   * @returns Dashboard with full details or null if not found
   * @throws {AuthorizationError} If user lacks required permissions
   * @example
   * const dashboard = await service.getDashboardById('dash-123');
   */
  async getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
      throw new PermissionDeniedError(
        'Insufficient permissions to read dashboard',
        this.userContext.user_id
      );
    }

    // Get dashboard with creator and category info
    const queryStart = Date.now();
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
          rbacScope: this.getRBACScope(),
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

    // Get chart count
    const chartCountStart = Date.now();
    const [chartCount] = await db
      .select({ count: count() })
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, dashboardId));
    const chartCountDuration = Date.now() - chartCountStart;

    // Get chart details
    const chartsStart = Date.now();
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
    const chartsDuration = Date.now() - chartsStart;

    const dashboardWithCharts: DashboardWithCharts = {
      dashboard_id: dashboard.dashboards.dashboard_id,
      dashboard_name: dashboard.dashboards.dashboard_name,
      dashboard_description: dashboard.dashboards.dashboard_description || undefined,
      layout_config: (dashboard.dashboards.layout_config as Record<string, unknown>) || {},
      dashboard_category_id: dashboard.dashboards.dashboard_category_id || undefined,
      organization_id: dashboard.dashboards.organization_id || undefined,
      created_by: dashboard.dashboards.created_by,
      created_at: (dashboard.dashboards.created_at || new Date()).toISOString(),
      updated_at: (dashboard.dashboards.updated_at || new Date()).toISOString(),
      is_active: dashboard.dashboards.is_active ?? true,
      is_published: dashboard.dashboards.is_published ?? false,
      is_default: dashboard.dashboards.is_default ?? false,
      chart_count: Number(chartCount?.count) || 0,
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
        chartCountQuery: {
          duration: chartCountDuration,
          slow: chartCountDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartsQuery: {
          duration: chartsDuration,
          slow: chartsDuration > SLOW_THRESHOLDS.DB_QUERY,
        },
        chartCount: dashboardWithCharts.chart_count,
        rbacScope: this.getRBACScope(),
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
   *
   * @param options - Optional filters (category, active, published, search)
   * @returns Total count of accessible dashboards
   * @throws {AuthorizationError} If user lacks required permissions
   * @example
   * const total = await service.getDashboardCount({ is_active: true });
   */
  async getDashboardCount(options: DashboardQueryOptions = {}): Promise<number> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
      throw new PermissionDeniedError(
        'Insufficient permissions to count dashboards',
        this.userContext.user_id
      );
    }

    // Build query conditions
    const conditions = this.buildRBACWhereConditions(options);

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
        rbacScope: this.getRBACScope(),
        component: 'service',
      },
    });

    return total;
  }

  /**
   * Create a new dashboard with permission checking
   *
   * Creates dashboard with optional chart associations. Handles default dashboard
   * logic (clears existing default if this is set as default). Uses transaction
   * for chart associations.
   *
   * @param data - Dashboard creation data
   * @returns Created dashboard with full details
   * @throws {AuthorizationError} If user lacks required permissions
   * @throws {Error} If organization access validation fails
   * @example
   * const dashboard = await service.createDashboard({
   *   dashboard_name: 'Q1 Sales',
   *   organization_id: 'org-123',
   *   chart_ids: ['chart-1', 'chart-2'],
   * });
   */
  async createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canCreate && !this.canManage) {
      throw new PermissionDeniedError(
        'Insufficient permissions to create dashboard',
        this.userContext.user_id
      );
    }

    // Determine organization_id for dashboard
    let organizationId: string | null;
    if (data.organization_id === undefined) {
      // Default to user's current organization, or null if none
      organizationId = this.userContext.current_organization_id || null;
    } else {
      // Explicitly set (null for universal, or specific UUID)
      organizationId = data.organization_id;
    }

    // If setting specific organization, validate user has access
    if (organizationId && !this.canAccessOrganization(organizationId)) {
      throw new Error(`Cannot create dashboard for organization ${organizationId}: Access denied`);
    }

    // If setting this as default, clear any existing default dashboard
    if (data.is_default === true) {
      await db.update(dashboards).set({ is_default: false }).where(eq(dashboards.is_default, true));
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

    // Add charts to dashboard if provided
    if (data.chart_ids && data.chart_ids.length > 0) {
      const chartAssociations = data.chart_ids.map((chartId: string, index: number) => {
        const position = data.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 };
        return {
          dashboard_id: newDashboard.dashboard_id,
          chart_definition_id: chartId,
          position_config: position,
        };
      });

      await db.insert(dashboard_charts).values(chartAssociations);
    }

    // Fetch created dashboard with full details
    const createdDashboard = await this.getDashboardById(newDashboard.dashboard_id);
    if (!createdDashboard) {
      throw new Error('Failed to retrieve created dashboard');
    }

    const duration = Date.now() - startTime;

    // Log with logTemplates - SINGLE LOG STATEMENT (fixed excessive logging anti-pattern)
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
        rbacScope: this.getRBACScope(),
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
   * @param dashboardId - Dashboard ID to update
   * @param data - Dashboard update data
   * @returns Updated dashboard with full details
   * @throws {AuthorizationError} If user lacks required permissions
   * @throws {Error} If dashboard not found or organization access validation fails
   * @example
   * const updated = await service.updateDashboard('dash-123', {
   *   dashboard_name: 'Updated Name',
   *   is_published: true,
   * });
   */
  async updateDashboard(
    dashboardId: string,
    data: UpdateDashboardData
  ): Promise<DashboardWithCharts> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canCreate && !this.canManage) {
      throw new PermissionDeniedError(
        'Insufficient permissions to update dashboard',
        this.userContext.user_id
      );
    }

    // Check if dashboard exists
    const existing = await this.getDashboardById(dashboardId);
    if (!existing) {
      throw new Error('Dashboard not found');
    }

    // If changing organization_id, validate access
    if (data.organization_id !== undefined) {
      if (data.organization_id !== null) {
        // Changing to specific org - validate user has access
        if (!this.canAccessOrganization(data.organization_id)) {
          throw new Error(
            `Cannot assign dashboard to organization ${data.organization_id}: Access denied`
          );
        }
      }
      // null is allowed (making it universal)
    }

    // Calculate changes for audit trail
    const changes = calculateChanges(
      existing,
      data,
      [
        'dashboard_name',
        'dashboard_description',
        'dashboard_category_id',
        'organization_id',
        'is_active',
        'is_published',
        'is_default',
        'layout_config',
      ]
    );

    // Execute dashboard update and chart management as atomic transaction
    const updateStart = Date.now();
    await db.transaction(async (tx) => {
      // If setting this as default, clear any existing default dashboard
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

      // Update chart associations if provided
      if (data.chart_ids !== undefined) {
        // First, remove all current chart associations
        await tx.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

        // Then add the new chart associations if provided
        if (data.chart_ids.length > 0) {
          const chartAssociations = data.chart_ids.map((chartId: string, index: number) => {
            const position = data.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 };
            return {
              dashboard_id: dashboardId,
              chart_definition_id: chartId,
              position_config: position,
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
        rbacScope: this.getRBACScope(),
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
   * @throws {AuthorizationError} If user lacks required permissions
   * @throws {Error} If dashboard not found or deletion fails
   * @example
   * await service.deleteDashboard('dash-123');
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    const startTime = Date.now();

    // Check permissions
    if (!this.canCreate && !this.canManage) {
      throw new PermissionDeniedError(
        'Insufficient permissions to delete dashboard',
        this.userContext.user_id
      );
    }

    // Check if dashboard exists
    const existing = await this.getDashboardById(dashboardId);
    if (!existing) {
      throw new Error('Dashboard not found');
    }

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
        rbacScope: this.getRBACScope(),
        component: 'service',
      },
    });
    log.info(template.message, template.context);
  }
}

/**
 * Factory function to create RBAC Dashboards Service
 *
 * @param userContext - User context with permissions and organization access
 * @returns Dashboard service instance
 * @example
 * const service = createRBACDashboardsService(userContext);
 * const dashboards = await service.getDashboards();
 */
export const createRBACDashboardsService = (
  userContext: UserContext
): DashboardsServiceInterface => {
  return new RBACDashboardsServiceImpl(userContext);
};

// Re-export the class for backwards compatibility during migration
export class RBACDashboardsService extends RBACDashboardsServiceImpl {}
