/**
 * Dashboards Service (Composite Facade)
 *
 * Main service that delegates to specialized sub-services.
 * Maintains backward compatibility with original monolithic service.
 *
 * Architecture:
 * - Delegates all CRUD to core-service.ts
 * - Provides clean public API
 * - 100% backward compatible with original rbac-dashboards-service.ts
 *
 * Benefits:
 * - Better separation of concerns
 * - Zero permission checking duplication
 * - Single Responsibility Principle
 * - Maintains same public interface (backward compatible)
 *
 * Replaces monolithic rbac-dashboards-service.ts (878 lines) by
 * delegating to specialized services:
 * - core-service.ts: CRUD operations (~670 lines)
 * - chart-associations.ts: Chart linking (~250 lines)
 * - default-handler.ts: Default dashboard logic (~230 lines)
 * - base-service.ts: Shared RBAC helpers (~230 lines)
 * - mappers.ts: Result transformation (~180 lines)
 * - query-builder.ts: Reusable queries (144 lines - already existed)
 */

import type {
  CreateDashboardData,
  DashboardQueryOptions,
  DashboardWithCharts,
  UpdateDashboardData,
} from '@/lib/types/dashboards';
// 1. Types
import type { UserContext } from '@/lib/types/rbac';

// 2. Internal services
import { createDashboardCoreService } from './core-service';

/**
 * Dashboards Service Interface
 * Complete interface for dashboard operations
 */
export interface DashboardsServiceInterface {
  getDashboards(options?: DashboardQueryOptions): Promise<DashboardWithCharts[]>;
  getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null>;
  getDashboardCount(options?: DashboardQueryOptions): Promise<number>;
  createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts>;
  updateDashboard(dashboardId: string, data: UpdateDashboardData): Promise<DashboardWithCharts>;
  deleteDashboard(dashboardId: string): Promise<void>;
}

/**
 * Dashboards Service (Composite)
 *
 * Main service that delegates to specialized sub-services.
 * Maintains backward compatibility while providing cleaner architecture.
 *
 * @internal - Use factory function instead
 */
class DashboardsService implements DashboardsServiceInterface {
  private coreService: ReturnType<typeof createDashboardCoreService>;

  constructor(userContext: UserContext) {
    this.coreService = createDashboardCoreService(userContext);
  }

  // ============================================================
  // CORE CRUD - Delegate to core-service
  // ============================================================

  /**
   * Get all dashboards with RBAC filtering
   *
   * @param options - Optional filters (category, active, published, search, limit, offset)
   * @returns Array of dashboards with chart counts and metadata
   */
  async getDashboards(options?: DashboardQueryOptions): Promise<DashboardWithCharts[]> {
    return this.coreService.getDashboards(options);
  }

  /**
   * Get a specific dashboard by ID
   *
   * @param dashboardId - Dashboard ID to retrieve
   * @returns Dashboard with full details or null if not found
   */
  async getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null> {
    return this.coreService.getDashboardById(dashboardId);
  }

  /**
   * Get dashboard count for pagination
   *
   * @param options - Optional filters (category, active, published, search)
   * @returns Total count of accessible dashboards
   */
  async getDashboardCount(options?: DashboardQueryOptions): Promise<number> {
    return this.coreService.getDashboardCount(options);
  }

  /**
   * Create a new dashboard
   *
   * @param data - Dashboard creation data
   * @returns Created dashboard with full details
   */
  async createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts> {
    return this.coreService.createDashboard(data);
  }

  /**
   * Update a dashboard
   *
   * @param dashboardId - Dashboard ID to update
   * @param data - Dashboard update data
   * @returns Updated dashboard with full details
   */
  async updateDashboard(
    dashboardId: string,
    data: UpdateDashboardData
  ): Promise<DashboardWithCharts> {
    return this.coreService.updateDashboard(dashboardId, data);
  }

  /**
   * Delete a dashboard
   *
   * @param dashboardId - Dashboard ID to delete
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    return this.coreService.deleteDashboard(dashboardId);
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create RBAC Dashboards Service
 *
 * Factory function to create a new dashboards service instance
 * with automatic RBAC enforcement.
 *
 * This facade maintains backward compatibility with the original
 * monolithic service while delegating to specialized sub-services.
 *
 * @param userContext - User context with RBAC permissions
 * @returns Service interface
 *
 * @example
 * ```typescript
 * const service = createRBACDashboardsService(userContext);
 *
 * // Get all dashboards
 * const dashboards = await service.getDashboards({ is_active: true });
 *
 * // Get single dashboard
 * const dashboard = await service.getDashboardById('dash-123');
 *
 * // Count dashboards
 * const total = await service.getDashboardCount({ is_active: true });
 *
 * // Create dashboard
 * const newDashboard = await service.createDashboard({
 *   dashboard_name: 'Q1 Sales Dashboard',
 *   organization_id: 'org-123',
 *   chart_ids: ['chart-1', 'chart-2'],
 *   is_published: true,
 * });
 *
 * // Update dashboard
 * const updated = await service.updateDashboard('dash-123', {
 *   dashboard_name: 'Updated Name',
 *   is_active: true,
 * });
 *
 * // Delete dashboard
 * await service.deleteDashboard('dash-123');
 * ```
 *
 * **Permissions Required**:
 * - Read: dashboards:read:all OR dashboards:read:organization OR dashboards:read:own
 * - Create: dashboards:create:organization OR dashboards:manage:all
 * - Update: dashboards:manage:organization OR dashboards:manage:all
 * - Delete: dashboards:manage:organization OR dashboards:manage:all
 *
 * **RBAC Scopes**:
 * - `:all` - Super admins, can see all dashboards
 * - `:organization` - Can see universal dashboards + dashboards from accessible orgs
 * - `:own` - Can only see dashboards they created
 *
 * **Organization Scoping**:
 * - `null` - Universal dashboard (visible to all organizations)
 * - `UUID` - Organization-specific (visible only to that org + users with access)
 */
export function createRBACDashboardsService(userContext: UserContext): DashboardsServiceInterface {
  return new DashboardsService(userContext);
}
