import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * User Permissions Service
 *
 * Provides permission-based helpers for user management.
 *
 * **Core Operations**:
 * - Check if current user can manage target user
 * - Get list of manageable users for current user
 * - Permission validation helpers
 *
 * **Security Features**:
 * - RBAC scope enforcement (own/organization/all)
 * - Organization-based access control
 * - Self-management permissions
 *
 * @example
 * ```typescript
 * const service = createUserPermissionsService(userContext);
 *
 * // Check if can manage user
 * const canManage = await service.canManageUser('user-123');
 *
 * // Get all manageable users
 * const users = await service.getManageableUsers(allUsers);
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface UserSummary {
  user_id: string;
  organizations: {
    organization_id: string;
  }[];
}

/**
 * User Permissions Service Interface
 */
export interface UserPermissionsServiceInterface {
  canManageUser(targetUserId: string, targetUserOrgs: { organization_id: string }[]): boolean;
  filterManageableUsers<T extends UserSummary>(users: T[]): T[];
}

// ============================================================================
// Service Implementation
// ============================================================================

class UserPermissionsService implements UserPermissionsServiceInterface {
  private readonly isSuperAdmin: boolean;
  private readonly canUpdateOwn: boolean;
  private readonly canUpdateOrganization: boolean;
  private readonly accessibleOrganizationIds: string[];

  constructor(private readonly userContext: UserContext) {
    const permissions = userContext.all_permissions || [];
    this.isSuperAdmin = userContext.is_super_admin || false;
    this.canUpdateOwn = permissions.some((p) => p.name === 'users:update:own');
    this.canUpdateOrganization = permissions.some((p) => p.name === 'users:update:organization');
    this.accessibleOrganizationIds =
      userContext.accessible_organizations?.map((org) => org.organization_id) || [];
  }

  /**
   * Check if user can access an organization
   */
  private canAccessOrganization(organizationId: string): boolean {
    if (this.isSuperAdmin) {
      return true;
    }
    return this.accessibleOrganizationIds.includes(organizationId);
  }

  /**
   * Check if current user can manage target user
   *
   * @param targetUserId - ID of user to check
   * @param targetUserOrgs - Organizations the target user belongs to
   * @returns true if current user can manage target user
   */
  canManageUser(targetUserId: string, targetUserOrgs: { organization_id: string }[]): boolean {
    const startTime = Date.now();

    try {
      // Super admin can manage anyone
      if (this.isSuperAdmin) {
        return true;
      }

      // Users can always manage themselves
      if (targetUserId === this.userContext.user_id) {
        return this.canUpdateOwn;
      }

      // Check organization-level management permissions
      if (!this.canUpdateOrganization) {
        return false;
      }

      // Verify shared organization
      const hasSharedOrg = targetUserOrgs.some((org) =>
        this.canAccessOrganization(org.organization_id)
      );

      const duration = Date.now() - startTime;

      log.debug('can manage user check', {
        operation: 'can_manage_user',
        userId: this.userContext.user_id,
        targetUserId,
        duration,
        metadata: {
          canManage: hasSharedOrg,
          isSelf: targetUserId === this.userContext.user_id,
          isSuperAdmin: this.isSuperAdmin,
          component: 'service',
        },
      });

      return hasSharedOrg;
    } catch (error) {
      log.error('can manage user check failed', error, {
        operation: 'can_manage_user',
        userId: this.userContext.user_id,
        targetUserId,
        component: 'service',
      });
      return false;
    }
  }

  /**
   * Filter users to only those current user can manage
   *
   * @param users - List of users to filter
   * @returns Filtered list of manageable users
   */
  filterManageableUsers<T extends UserSummary>(users: T[]): T[] {
    const startTime = Date.now();

    try {
      // Super admin can manage all users
      if (this.isSuperAdmin) {
        return users;
      }

      // Filter to only users that can be managed
      const manageableUsers = users.filter((user) =>
        this.canManageUser(user.user_id, user.organizations)
      );

      const duration = Date.now() - startTime;

      log.info('manageable users filtered', {
        operation: 'filter_manageable_users',
        userId: this.userContext.user_id,
        duration,
        metadata: {
          totalUsers: users.length,
          manageableUsers: manageableUsers.length,
          isSuperAdmin: this.isSuperAdmin,
          component: 'service',
        },
      });

      return manageableUsers;
    } catch (error) {
      log.error('filter manageable users failed', error, {
        operation: 'filter_manageable_users',
        userId: this.userContext.user_id,
        totalUsers: users.length,
        component: 'service',
      });
      throw error;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Factory function to create User Permissions Service
 */
export function createUserPermissionsService(
  userContext: UserContext
): UserPermissionsServiceInterface {
  return new UserPermissionsService(userContext);
}
