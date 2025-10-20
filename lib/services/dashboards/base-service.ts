// 1. Drizzle ORM
import { eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';

// 2. Database
import { dashboards } from '@/lib/db/schema';

// 3. Base classes
import { BaseRBACService } from '@/lib/rbac/base-service';
import type { DashboardQueryOptions } from '@/lib/types/dashboards';
// 4. Types
import type { UserContext } from '@/lib/types/rbac';

/**
 * Base Dashboards RBAC Service
 *
 * Extends BaseRBACService with dashboards-specific permission patterns.
 * Provides shared permission checking, RBAC filtering, and helper methods
 * for all dashboard services.
 *
 * This base class eliminates duplicated code across:
 * - core-service.ts (CRUD operations)
 * - chart-associations.ts (chart linking)
 * - default-handler.ts (default dashboard logic)
 *
 * Helper methods moved to base class for reuse:
 * - buildBaseDashboardWhereConditions() - Query filtering with RBAC
 * - canAccessDashboardOrganization() - Organization access validation
 * - getDashboardRBACScope() - Current user's access scope for logging
 *
 * @internal - Use factory functions from specific services instead
 */
export abstract class BaseDashboardsService extends BaseRBACService {
  // Cached permission checks using base class methods
  protected readonly canReadAll: boolean;
  protected readonly canReadOrganization: boolean;
  protected readonly canReadOwn: boolean;
  protected readonly canCreate: boolean;
  protected readonly canManageAll: boolean;
  protected readonly canManageOrganization: boolean;
  protected readonly accessibleOrgIds: string[];

  constructor(userContext: UserContext) {
    super(userContext);

    // Use base class permission checker instead of manual checks
    this.canReadAll = this.checker.hasAnyPermission(['dashboards:read:all']);
    this.canReadOrganization = this.checker.hasAnyPermission(['dashboards:read:organization']);
    this.canReadOwn = this.checker.hasAnyPermission(['dashboards:read:own']);
    this.canCreate = this.checker.hasAnyPermission(['dashboards:create:organization']);
    this.canManageAll = this.checker.hasAnyPermission(['dashboards:manage:all']);
    this.canManageOrganization = this.checker.hasAnyPermission(['dashboards:create:organization']); // Using create as manage doesn't exist

    // Cache accessible organization IDs
    this.accessibleOrgIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Build base RBAC WHERE conditions for dashboard queries
   *
   * Filters at database level for performance.
   * Applies RBAC scoping based on user's permissions:
   * - :all scope: No filtering (sees all dashboards)
   * - :organization scope: Filters to user's orgs + universal (org_id = null)
   * - :own scope: Filters to dashboards created by user
   * - No permission: Returns impossible condition (no results)
   *
   * Shared utility used by all dashboard services.
   *
   * @param options - Optional query filters to combine with RBAC
   * @returns Array of SQL conditions for WHERE clause
   */
  protected buildBaseDashboardWhereConditions(options: DashboardQueryOptions = {}): SQL[] {
    const conditions: SQL[] = [];

    // Apply RBAC filtering
    if (this.canReadAll) {
      // Can read all dashboards - no additional filtering needed
    } else if (this.canReadOrganization) {
      // Can read organization dashboards + universal dashboards
      if (this.accessibleOrgIds.length > 0) {
        const rbacCondition = or(
          inArray(dashboards.organization_id, this.accessibleOrgIds),
          isNull(dashboards.organization_id)
        );
        if (rbacCondition) {
          conditions.push(rbacCondition);
        }
      } else {
        // No organizations accessible - only universal dashboards
        conditions.push(isNull(dashboards.organization_id));
      }
    } else if (this.canReadOwn) {
      // Can only read own dashboards
      conditions.push(eq(dashboards.created_by, this.userContext.user_id));
    } else {
      // No read permission - return impossible condition
      conditions.push(eq(dashboards.dashboard_id, 'impossible-id'));
    }

    // Apply optional filters from query options
    if (options.category_id) {
      conditions.push(eq(dashboards.dashboard_category_id, Number(options.category_id)));
    }

    if (options.is_active !== undefined) {
      conditions.push(eq(dashboards.is_active, options.is_active));
    }

    if (options.is_published !== undefined) {
      conditions.push(eq(dashboards.is_published, options.is_published));
    }

    if (options.search) {
      const searchCondition = or(
        ilike(dashboards.dashboard_name, `%${options.search}%`),
        ilike(dashboards.dashboard_description, `%${options.search}%`)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    // Organization filter (explicit filter overrides RBAC)
    if (options.organization_id !== undefined) {
      if (options.organization_id === null) {
        // Only universal dashboards
        conditions.push(isNull(dashboards.organization_id));
      } else {
        // Specific organization
        conditions.push(eq(dashboards.organization_id, options.organization_id));
      }
    }

    return conditions;
  }

  /**
   * Check if user can access dashboards for a specific organization
   *
   * Used during create/update to validate organization_id before inserting.
   * Ensures users cannot create dashboards for orgs they don't have access to.
   *
   * Rules:
   * - null (universal): Only :all or :manage:all can create universal dashboards
   * - specific org: Must be in user's accessible organizations
   *
   * @param organizationId - Organization ID to check (null = universal)
   * @returns True if user can access this organization
   */
  protected canAccessDashboardOrganization(organizationId: string | null): boolean {
    // Universal dashboards (org_id = null) require manage:all permission
    if (organizationId === null) {
      return this.canManageAll;
    }

    // Check if organization is in user's accessible organizations
    return this.accessibleOrgIds.includes(organizationId);
  }

  /**
   * Get user's current dashboard RBAC scope for logging
   *
   * Returns the highest scope the user has access to.
   * Used in logging to track what RBAC scope was applied to queries.
   *
   * @returns Current RBAC scope ('all' | 'organization' | 'own' | 'none')
   */
  protected getDashboardRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll || this.canManageAll) {
      return 'all';
    }
    if (this.canReadOrganization || this.canManageOrganization) {
      return 'organization';
    }
    if (this.canReadOwn) {
      return 'own';
    }
    return 'none';
  }

  /**
   * Validate that user has permission to modify a dashboard
   *
   * Checks both permission scope and organization access.
   * Used in update/delete operations before making changes.
   *
   * @param dashboard - Dashboard to validate access for
   * @throws PermissionDeniedError if user lacks permission
   * @throws OrganizationAccessError if user cannot access dashboard's organization
   */
  protected async validateDashboardAccess(dashboard: {
    dashboard_id: string;
    created_by: string;
    organization_id: string | null;
  }): Promise<void> {
    // Check manage permissions
    if (this.canManageAll) {
      // Can manage all dashboards
      return;
    }

    if (this.canManageOrganization) {
      // Can manage organization dashboards - check org access
      if (dashboard.organization_id === null) {
        throw this.createPermissionError('dashboards:manage:all', dashboard.dashboard_id);
      }
      if (!this.canAccessDashboardOrganization(dashboard.organization_id)) {
        throw this.createOrganizationAccessError(dashboard.organization_id);
      }
      return;
    }

    // Check if user owns this dashboard (for :own scope)
    if (dashboard.created_by !== this.userContext.user_id) {
      throw this.createPermissionError('dashboards:manage:own', dashboard.dashboard_id);
    }
  }

  /**
   * Create a standardized PermissionDeniedError
   */
  private createPermissionError(permission: string, resourceId?: string) {
    const PermissionDeniedError = class extends Error {
      constructor(permission: string, resourceId?: string) {
        super(`Permission denied: ${permission}${resourceId ? ` for ${resourceId}` : ''}`);
        this.name = 'PermissionDeniedError';
      }
    };
    return new PermissionDeniedError(permission, resourceId);
  }

  /**
   * Create a standardized OrganizationAccessError
   */
  private createOrganizationAccessError(organizationId: string) {
    const OrganizationAccessError = class extends Error {
      constructor(organizationId: string) {
        super(`Access denied to organization: ${organizationId}`);
        this.name = 'OrganizationAccessError';
      }
    };
    return new OrganizationAccessError(organizationId);
  }
}
