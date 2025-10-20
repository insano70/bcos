/**
 * Dashboard Default Handler Service
 *
 * Handles "is_default" dashboard business logic.
 * Ensures only one dashboard can be marked as default at a time.
 *
 * Responsibilities:
 * - Clear existing default dashboard before setting a new one
 * - Get the current default dashboard
 * - Validate default dashboard constraints
 *
 * Benefits:
 * - Encapsulation: Default dashboard logic in one place
 * - Logging: Dedicated tracking for default operations
 * - Testability: Isolated business rule
 */

// 1. Drizzle ORM
import { and, desc, eq } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { dashboards } from '@/lib/db/schema';
// 5. Logger
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
// 6. Types
import type { UserContext } from '@/lib/types/rbac';
// 3. Base service
import { BaseDashboardsService } from './base-service';
import { mapDashboardResult } from './mappers';
// 4. Query builder and mappers
import { getDashboardChartDetails, getDashboardQueryBuilder } from './query-builder';

/**
 * Dashboard Default Handler Service
 *
 * Manages the single "default dashboard" constraint.
 * Only one dashboard can be marked as default at a time.
 *
 * @internal - Use factory function instead
 */
class DashboardDefaultHandlerService extends BaseDashboardsService {
  /**
   * Clear existing default dashboard before setting a new one
   *
   * Called before create/update when is_default = true.
   * Ensures only one dashboard is marked as default.
   *
   * **Business Rule**: System-wide constraint - only ONE default dashboard allowed.
   *
   * @example
   * ```typescript
   * // Before creating new default dashboard
   * if (data.is_default === true) {
   *   await defaultHandler.clearExistingDefault();
   * }
   * await db.insert(dashboards).values({ ...data, is_default: true });
   * ```
   */
  async clearExistingDefault(): Promise<void> {
    // Permission check - only users who can create/manage can set default
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    const startTime = Date.now();

    // Update all dashboards to is_default = false
    const result = await db
      .update(dashboards)
      .set({ is_default: false, updated_at: new Date() })
      .where(eq(dashboards.is_default, true))
      .returning({ dashboard_id: dashboards.dashboard_id });

    const duration = Date.now() - startTime;

    // Only log if we actually cleared a default
    if (result.length > 0 && result[0]) {
      log.info('existing default dashboard cleared', {
        operation: 'clear_default_dashboard',
        userId: this.userContext.user_id,
        previousDefaultId: result[0].dashboard_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'service',
      });
    }
  }

  /**
   * Get the current default dashboard
   *
   * Returns the dashboard marked as is_default = true.
   * Used by frontend to load initial dashboard on app startup.
   *
   * **Note**: RBAC is NOT applied here - default dashboard is system-wide.
   * However, user still needs read permission to access this endpoint.
   *
   * @returns Default dashboard with full details, or null if none set
   *
   * @example
   * ```typescript
   * const service = createDashboardDefaultHandlerService(userContext);
   * const defaultDashboard = await service.getDefaultDashboard();
   *
   * if (defaultDashboard) {
   *   console.log(`Default: ${defaultDashboard.dashboard_name}`);
   * }
   * ```
   */
  async getDefaultDashboard(): Promise<DashboardWithCharts | null> {
    const startTime = Date.now();

    // Permission check - user needs read permission
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    // Query for default dashboard (no RBAC filtering - system-wide default)
    const queryStart = Date.now();
    const result = await getDashboardQueryBuilder()
      .where(eq(dashboards.is_default, true))
      .orderBy(desc(dashboards.updated_at)) // In case multiple (shouldn't happen)
      .limit(1);
    const queryDuration = Date.now() - queryStart;

    // No default dashboard set
    if (result.length === 0 || !result[0]) {
      log.info('no default dashboard found', {
        operation: 'get_default_dashboard',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });
      return null;
    }

    // Load chart details
    const chartDetails = await getDashboardChartDetails(result[0].dashboard_id);

    // Map to DashboardWithCharts
    const dashboard = mapDashboardResult(result[0], chartDetails);

    const duration = Date.now() - startTime;

    log.info('default dashboard retrieved', {
      operation: 'get_default_dashboard',
      dashboardId: dashboard.dashboard_id,
      userId: this.userContext.user_id,
      chartCount: dashboard.chart_count,
      duration,
      query: {
        duration: queryDuration,
        slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY,
      },
      component: 'service',
    });

    return dashboard;
  }

  /**
   * Check if a default dashboard exists
   *
   * Lightweight check without loading full dashboard details.
   * Used for validation during create/update operations.
   *
   * @returns True if a default dashboard exists
   */
  async hasDefaultDashboard(): Promise<boolean> {
    // Permission check
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    const result = await db
      .select({ dashboard_id: dashboards.dashboard_id })
      .from(dashboards)
      .where(eq(dashboards.is_default, true))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Set a dashboard as default (atomic operation)
   *
   * Atomically clears existing default and sets new one.
   * Used during update operations when is_default changes from false to true.
   *
   * @param dashboardId - Dashboard to set as default
   *
   * @example
   * ```typescript
   * await defaultHandler.setAsDefault('dashboard-uuid');
   * ```
   */
  async setAsDefault(dashboardId: string): Promise<void> {
    // Permission check
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    const startTime = Date.now();

    // Execute in transaction for atomicity
    await db.transaction(async (tx) => {
      // 1. Clear existing default
      await tx
        .update(dashboards)
        .set({ is_default: false, updated_at: new Date() })
        .where(eq(dashboards.is_default, true));

      // 2. Set new default
      await tx
        .update(dashboards)
        .set({ is_default: true, updated_at: new Date() })
        .where(eq(dashboards.dashboard_id, dashboardId));
    });

    const duration = Date.now() - startTime;

    log.info('dashboard set as default', {
      operation: 'set_dashboard_as_default',
      dashboardId,
      userId: this.userContext.user_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'service',
    });
  }

  /**
   * Remove default status from a dashboard
   *
   * Used when is_default changes from true to false during update.
   *
   * @param dashboardId - Dashboard to remove default status from
   */
  async removeDefaultStatus(dashboardId: string): Promise<void> {
    // Permission check
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    const startTime = Date.now();

    await db
      .update(dashboards)
      .set({ is_default: false, updated_at: new Date() })
      .where(and(eq(dashboards.dashboard_id, dashboardId), eq(dashboards.is_default, true)));

    const duration = Date.now() - startTime;

    log.info('default status removed from dashboard', {
      operation: 'remove_default_status',
      dashboardId,
      userId: this.userContext.user_id,
      duration,
      component: 'service',
    });
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Dashboard Default Handler Service
 *
 * Factory function to create a new default handler service instance
 * with automatic RBAC enforcement.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Default handler service instance
 *
 * @example
 * ```typescript
 * const service = createDashboardDefaultHandlerService(userContext);
 *
 * // Get current default
 * const defaultDashboard = await service.getDefaultDashboard();
 *
 * // Before creating new default
 * if (data.is_default === true) {
 *   await service.clearExistingDefault();
 * }
 *
 * // Set existing dashboard as default
 * await service.setAsDefault('dashboard-uuid');
 * ```
 */
export function createDashboardDefaultHandlerService(userContext: UserContext) {
  return new DashboardDefaultHandlerService(userContext);
}
