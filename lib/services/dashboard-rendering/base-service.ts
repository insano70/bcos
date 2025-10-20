/**
 * Base Dashboard Rendering Service
 *
 * Provides shared RBAC helpers and common functionality for
 * all dashboard rendering services.
 *
 * Extends BaseRBACService to inherit permission checking capabilities.
 */

import { BaseRBACService } from '@/lib/rbac/base-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Base service for dashboard rendering operations
 *
 * Provides:
 * - RBAC permission checking (via BaseRBACService)
 * - Common validation helpers
 * - Shared utilities
 */
export class BaseDashboardRenderingService extends BaseRBACService {
  constructor(protected userContext: UserContext) {
    super(userContext);
  }

  /**
   * Require user has analytics permissions
   * Used by services that need to verify analytics access
   */
  protected requireAnalyticsPermission(): void {
    this.requireAnyPermission([
      'analytics:read:all',
      'analytics:read:organization',
      'analytics:read:own',
    ]);
  }

  /**
   * Check if user has dashboard read permissions
   * @returns true if user can read dashboards
   */
  protected canReadDashboards(): boolean {
    return (
      this.checker.hasPermission('dashboards:read:all') ||
      this.checker.hasPermission('dashboards:read:organization') ||
      this.checker.hasPermission('dashboards:read:own')
    );
  }

  /**
   * Check if user has chart read permissions
   * @returns true if user can read charts
   */
  protected canReadCharts(): boolean {
    return (
      this.checker.hasPermission('charts:read:all') ||
      this.checker.hasPermission('charts:read:organization') ||
      this.checker.hasPermission('charts:read:own')
    );
  }
}
