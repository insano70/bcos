// 1. Drizzle ORM
import { eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';

// 2. Database
import { organizations } from '@/lib/db';

// 3. Base classes
import { BaseRBACService } from '@/lib/rbac/base-service';

// 4. Types
import type { PermissionName, UserContext } from '@/lib/types/rbac';

/**
 * Base Organizations RBAC Service
 *
 * Extends BaseRBACService with organizations-specific permission patterns.
 * Provides shared permission checking and RBAC filtering for all organization services.
 *
 * This base class eliminates duplicated permission checking code across:
 * - core-service.ts (CRUD operations)
 * - hierarchy-service.ts (tree operations)
 * - members-service.ts (user associations)
 *
 * @internal - Use factory functions from specific services instead
 */
export abstract class BaseOrganizationsService extends BaseRBACService {
  // Cached permission checks using base class methods
  protected readonly canReadAll: boolean;
  protected readonly canReadOrganization: boolean;
  protected readonly canReadOwn: boolean;
  protected readonly canCreate: boolean;
  protected readonly canUpdate: boolean;
  protected readonly canManage: boolean;
  protected readonly canDelete: boolean;
  protected readonly accessibleOrgIds: string[];

  constructor(userContext: UserContext) {
    super(userContext);

    // Use base class permission checker instead of manual checks
    this.canReadAll = this.hasAnyPermission(['organizations:read:all']);
    this.canReadOrganization = this.hasAnyPermission(['organizations:read:organization']);
    this.canReadOwn = this.hasAnyPermission(['organizations:read:own']);
    this.canCreate = this.hasAnyPermission(['organizations:create:all']);
    this.canUpdate = this.hasAnyPermission([
      'organizations:update:own',
      'organizations:update:organization',
      'organizations:manage:all',
    ]);
    this.canManage = this.hasAnyPermission(['organizations:manage:all']);
    this.canDelete = this.hasAnyPermission(['organizations:manage:all']);
    this.accessibleOrgIds = this.getAccessibleOrganizationIds();
  }

  /**
   * Build RBAC WHERE conditions based on user permissions
   *
   * Filters at database level for performance.
   * Shared utility used by all organization services.
   *
   * @returns Array of SQL conditions for WHERE clause
   */
  protected buildRBACWhereConditions(): SQL<unknown>[] {
    const conditions: SQL<unknown>[] = [
      eq(organizations.is_active, true),
      isNull(organizations.deleted_at),
    ];

    if (!this.canReadAll) {
      if (this.canReadOrganization && this.accessibleOrgIds.length > 0) {
        // User can see their accessible organizations
        conditions.push(inArray(organizations.organization_id, this.accessibleOrgIds));
      } else if (this.canReadOwn) {
        // User can only see organizations they belong to
        const userOrgIds = this.userContext.organizations?.map((org) => org.organization_id) || [];
        if (userOrgIds.length > 0) {
          conditions.push(inArray(organizations.organization_id, userOrgIds));
        } else {
          conditions.push(sql`FALSE`); // No accessible organizations
        }
      } else {
        conditions.push(sql`FALSE`); // No permission
      }
    }

    return conditions;
  }

  /**
   * Check if user has access to specific organization
   *
   * @param organizationId - Organization ID to check
   * @returns True if user can access organization
   */
  protected canAccessOrganization(organizationId: string): boolean {
    if (this.userContext.is_super_admin) return true;
    return this.accessibleOrgIds.includes(organizationId);
  }

  /**
   * Get RBAC scope for logging
   *
   * @returns Scope level for audit trail
   */
  protected getRBACScope(): 'all' | 'organization' | 'own' | 'none' {
    if (this.canReadAll) return 'all';
    if (this.canReadOrganization) return 'organization';
    if (this.canReadOwn) return 'own';
    return 'none';
  }

  /**
   * Helper for permission checking delegation to base class
   *
   * @param permissions - Permissions to check
   * @returns True if user has any of the permissions
   */
  private hasAnyPermission(permissions: PermissionName[]): boolean {
    return (
      this.userContext.is_super_admin ||
      this.checker.hasAnyPermission(permissions, undefined, undefined)
    );
  }
}
