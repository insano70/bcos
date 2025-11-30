/**
 * Dashboard Chart Associations Service
 *
 * Handles all chart linking operations for dashboards.
 * Isolates chart management logic from core CRUD operations.
 *
 * Responsibilities:
 * - Add charts to dashboard with position configuration
 * - Replace all charts (used during update)
 * - Remove all charts (used during delete)
 *
 * Benefits:
 * - Separation of Concerns: Chart logic isolated from CRUD
 * - Reusability: Used by create, update, delete operations
 * - Transaction safety: Atomic chart replacement
 */

// 1. Drizzle ORM
import { eq } from 'drizzle-orm';

// 2. Database
import { db } from '@/lib/db';
import { dashboard_charts } from '@/lib/db/schema';
// 4. Logger
import { log } from '@/lib/logger';
// 5. Types
import type { UserContext } from '@/lib/types/rbac';
import type { InputChartPosition } from '@/lib/types/dashboards';
// 3. Base service
import { BaseDashboardsService } from './base-service';

/**
 * Dashboard Chart Associations Service
 *
 * Manages the many-to-many relationship between dashboards and charts.
 * Provides transactional operations for chart linking.
 *
 * @internal - Use factory function instead
 */
class DashboardChartAssociationsService extends BaseDashboardsService {
  /**
   * Add charts to a dashboard with position configuration
   *
   * Used during dashboard creation to link initial set of charts.
   * Each chart gets a position configuration for layout purposes.
   *
   * Default position (if not provided):
   * - x: 0 (left edge)
   * - y: index (stacked vertically)
   * - w: 6 (half width)
   * - h: 4 (standard height)
   *
   * @param dashboardId - Dashboard to add charts to
   * @param chartIds - Array of chart definition IDs
   * @param positions - Optional array of position configs (must match chartIds length)
   * @throws Error if positions array doesn't match chartIds length
   *
   * @example
   * ```typescript
   * await service.addChartsToDashboard(
   *   'dashboard-uuid',
   *   ['chart-1', 'chart-2'],
   *   [{ x: 0, y: 0, w: 12, h: 6 }, { x: 0, y: 6, w: 6, h: 4 }]
   * );
   * ```
   */
  async addChartsToDashboard(
    dashboardId: string,
    chartIds: string[],
    positions?: InputChartPosition[]
  ): Promise<void> {
    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    // Validate positions array length if provided
    if (positions && positions.length !== chartIds.length) {
      throw new Error(
        `Position array length (${positions.length}) must match chart IDs length (${chartIds.length})`
      );
    }

    // Skip if no charts to add
    if (chartIds.length === 0) {
      return;
    }

    const startTime = Date.now();

    // Build chart associations with position config
    const chartAssociations = chartIds.map((chartId, index) => {
      const position = positions?.[index] || {
        x: 0,
        y: index,
        w: 6,
        h: 4,
      };

      return {
        dashboard_id: dashboardId,
        chart_definition_id: chartId,
        position_config: position,
        added_at: new Date(),
      };
    });

    // Insert all associations in single query
    await db.insert(dashboard_charts).values(chartAssociations);

    const duration = Date.now() - startTime;

    log.info('charts added to dashboard', {
      operation: 'add_charts_to_dashboard',
      dashboardId,
      userId: this.userContext.user_id,
      chartCount: chartIds.length,
      duration,
      component: 'service',
    });
  }

  /**
   * Replace all charts for a dashboard (transactional)
   *
   * Used during dashboard updates when chart list changes.
   * Atomically removes all existing charts and adds new ones.
   *
   * Transaction ensures:
   * - Either both operations succeed, or neither does
   * - No intermediate state where dashboard has no charts
   *
   * @param dashboardId - Dashboard to update charts for
   * @param chartIds - New array of chart definition IDs
   * @param positions - Optional array of position configs
   *
   * @example
   * ```typescript
   * // Update dashboard to have different charts
   * await service.replaceChartsForDashboard(
   *   'dashboard-uuid',
   *   ['chart-3', 'chart-4'],
   *   [{ x: 0, y: 0, w: 12, h: 6 }, { x: 0, y: 6, w: 6, h: 4 }]
   * );
   * ```
   */
  async replaceChartsForDashboard(
    dashboardId: string,
    chartIds: string[],
    positions?: InputChartPosition[]
  ): Promise<void> {
    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    // Validate positions array length if provided
    if (positions && positions.length !== chartIds.length) {
      throw new Error(
        `Position array length (${positions.length}) must match chart IDs length (${chartIds.length})`
      );
    }

    const startTime = Date.now();

    // Execute in transaction for atomicity
    await db.transaction(async (tx) => {
      // 1. Remove all existing chart associations
      await tx.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

      // 2. Add new chart associations (if any)
      if (chartIds.length > 0) {
        const chartAssociations = chartIds.map((chartId, index) => {
          const position = positions?.[index] || {
            x: 0,
            y: index,
            w: 6,
            h: 4,
          };

          return {
            dashboard_id: dashboardId,
            chart_definition_id: chartId,
            position_config: position,
            added_at: new Date(),
          };
        });

        await tx.insert(dashboard_charts).values(chartAssociations);
      }
    });

    const duration = Date.now() - startTime;

    log.info('dashboard charts replaced', {
      operation: 'replace_dashboard_charts',
      dashboardId,
      userId: this.userContext.user_id,
      newChartCount: chartIds.length,
      duration,
      component: 'service',
    });
  }

  /**
   * Remove all charts from a dashboard
   *
   * Used during dashboard deletion to clean up chart associations.
   * Typically called within a larger transaction in core-service.deleteDashboard().
   *
   * @param dashboardId - Dashboard to remove charts from
   *
   * @example
   * ```typescript
   * // Clean up before deleting dashboard
   * await service.removeAllChartsFromDashboard('dashboard-uuid');
   * ```
   */
  async removeAllChartsFromDashboard(dashboardId: string): Promise<void> {
    // Permission check via base class
    this.requireAnyPermission(['dashboards:create:organization', 'dashboards:manage:all']);

    const startTime = Date.now();

    // Delete all chart associations
    await db.delete(dashboard_charts).where(eq(dashboard_charts.dashboard_id, dashboardId));

    const duration = Date.now() - startTime;

    log.info('all charts removed from dashboard', {
      operation: 'remove_all_charts_from_dashboard',
      dashboardId,
      userId: this.userContext.user_id,
      duration,
      component: 'service',
    });
  }

  /**
   * Get count of charts associated with a dashboard
   *
   * Utility method for validation and logging.
   *
   * @param dashboardId - Dashboard to count charts for
   * @returns Number of associated charts
   */
  async getChartCount(dashboardId: string): Promise<number> {
    // Read permission required
    this.requireAnyPermission([
      'dashboards:read:all',
      'dashboards:read:organization',
      'dashboards:read:own',
    ]);

    const result = await db
      .select()
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, dashboardId));

    return result.length;
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Dashboard Chart Associations Service
 *
 * Factory function to create a new chart associations service instance
 * with automatic RBAC enforcement.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Chart associations service instance
 *
 * @example
 * ```typescript
 * const service = createDashboardChartAssociationsService(userContext);
 *
 * // Add charts during creation
 * await service.addChartsToDashboard('dashboard-uuid', ['chart-1', 'chart-2']);
 *
 * // Replace charts during update
 * await service.replaceChartsForDashboard('dashboard-uuid', ['chart-3']);
 *
 * // Clean up during deletion
 * await service.removeAllChartsFromDashboard('dashboard-uuid');
 * ```
 */
export function createDashboardChartAssociationsService(userContext: UserContext) {
  return new DashboardChartAssociationsService(userContext);
}
