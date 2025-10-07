import {
  type AccessScope,
  type ActionType,
  InsufficientScopeError,
  OrganizationAccessError,
  type Permission,
  type PermissionCheckOptions,
  type PermissionCheckResult,
  PermissionDeniedError,
  type PermissionName,
  type PermissionScope,
  type ResourceType,
  type UserContext,
} from '@/lib/types/rbac';

/**
 * PermissionChecker - Core RBAC Logic Engine
 *
 * Handles all permission validation logic for the healthcare practice management system.
 * Implements resource:action:scope permission model with organization hierarchy support.
 */
export class PermissionChecker {
  constructor(private userContext: UserContext) {}

  /**
   * Check if user has a specific permission
   * @param permissionName - e.g., 'users:read:organization'
   * @param resourceId - ID of the resource being accessed (optional)
   * @param organizationId - Organization context (optional)
   */
  hasPermission(permissionName: string, resourceId?: string, organizationId?: string): boolean {
    try {
      const result = this.checkPermission(permissionName, { resourceId, organizationId });
      return result.granted;
    } catch (error) {
      // Log permission check failures for audit (client-safe logging)
      console.warn('Permission check failed:', {
        userId: this.userContext.user_id,
        permission: permissionName,
        resourceId,
        organizationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Check multiple permissions (OR logic)
   */
  hasAnyPermission(permissions: string[], resourceId?: string, organizationId?: string): boolean {
    return permissions.some((permission) =>
      this.hasPermission(permission, resourceId, organizationId)
    );
  }

  /**
   * Check multiple permissions (AND logic)
   */
  hasAllPermissions(permissions: string[], resourceId?: string, organizationId?: string): boolean {
    return permissions.every((permission) =>
      this.hasPermission(permission, resourceId, organizationId)
    );
  }

  /**
   * Get detailed permission check result with reasoning
   */
  checkPermission(
    permissionName: string,
    options: PermissionCheckOptions = {}
  ): PermissionCheckResult {
    const { resourceId, organizationId } = options;
    const [resource, action, scope] = permissionName.split(':') as [
      string,
      string,
      PermissionScope,
    ];

    // Validate permission format
    if (!resource || !action || !scope) {
      return {
        granted: false,
        scope: 'own',
        reason: `Invalid permission format: ${permissionName}. Expected format: resource:action:scope`,
      };
    }

    // Check if user has the permission through any of their roles
    const matchingPermissions = this.getUserPermissions().filter((permission) => {
      // Exact match
      if (permission.name === permissionName) {
        return true;
      }

      // Component match with scope and action validation
      return (
        permission.resource === resource &&
        this.isActionCompatible(permission.action, action) &&
        this.isScopeCompatible(permission.scope, scope as PermissionScope)
      );
    });

    if (matchingPermissions.length === 0) {
      return {
        granted: false,
        scope: 'own',
        reason: `User does not have permission: ${permissionName}`,
      };
    }

    // Get the highest scope available
    const highestScope = this.getHighestScope(matchingPermissions.map((p) => p.scope));

    // Validate scope-specific access
    const scopeValidation = this.validateScopeAccess(highestScope, resourceId, organizationId);

    if (!scopeValidation.valid) {
      return {
        granted: false,
        scope: highestScope,
        reason: scopeValidation.reason,
      };
    }

    return {
      granted: true,
      scope: highestScope,
      applicable_organizations: scopeValidation.applicableOrganizations,
    };
  }

  /**
   * Get the highest scope available for a resource:action combination
   */
  getAccessScope(resource: ResourceType, action: ActionType): AccessScope {
    const permissions = this.getUserPermissions().filter(
      (p) => p.resource === resource && p.action === action
    );

    if (permissions.length === 0) {
      throw new PermissionDeniedError(`${resource}:${action}:*`);
    }

    // Return the highest scope available
    if (permissions.some((p) => p.scope === 'all')) {
      return { scope: 'all' };
    }

    if (permissions.some((p) => p.scope === 'organization')) {
      return {
        scope: 'organization',
        organizationIds: this.userContext.accessible_organizations.map(
          (org) => org.organization_id
        ),
      };
    }

    if (permissions.some((p) => p.scope === 'own')) {
      return {
        scope: 'own',
        userId: this.userContext.user_id,
      };
    }

    throw new PermissionDeniedError(`${resource}:${action}:*`);
  }

  /**
   * Get all permissions for the user (deduplicated)
   */
  getAllPermissions(): Permission[] {
    return this.getUserPermissions();
  }

  /**
   * Check if user can access a specific organization
   */
  canAccessOrganization(organizationId: string): boolean {
    return this.userContext.accessible_organizations.some(
      (org) => org.organization_id === organizationId && org.is_active
    );
  }

  /**
   * Check if user is a super admin
   */
  isSuperAdmin(): boolean {
    return this.userContext.is_super_admin;
  }

  /**
   * Check if user is an admin for a specific organization
   */
  isOrganizationAdmin(organizationId?: string): boolean {
    const targetOrgId = organizationId || this.userContext.current_organization_id;
    if (!targetOrgId) return false;

    return this.userContext.organization_admin_for.includes(targetOrgId);
  }

  /**
   * Get user's current organization
   */
  getCurrentOrganization() {
    if (!this.userContext.current_organization_id) return null;

    return this.userContext.accessible_organizations.find(
      (org) => org.organization_id === this.userContext.current_organization_id
    );
  }

  /**
   * Require a specific permission (throws if not granted)
   */
  requirePermission(
    permissionName: PermissionName,
    resourceId?: string,
    organizationId?: string
  ): void {
    const result = this.checkPermission(permissionName, { resourceId, organizationId });

    if (!result.granted) {
      throw new PermissionDeniedError(permissionName, resourceId, organizationId);
    }
  }

  /**
   * Require access to a specific organization (throws if not granted)
   */
  requireOrganizationAccess(organizationId: string): void {
    if (!this.canAccessOrganization(organizationId)) {
      throw new OrganizationAccessError(organizationId);
    }
  }

  /**
   * Require a specific scope level (throws if insufficient)
   */
  requireScope(resource: ResourceType, action: ActionType, requiredScope: PermissionScope): void {
    try {
      const accessScope = this.getAccessScope(resource, action);

      if (!this.isScopeCompatible(accessScope.scope, requiredScope)) {
        throw new InsufficientScopeError(requiredScope, accessScope.scope);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        throw error;
      }
      throw new InsufficientScopeError(requiredScope, 'own');
    }
  }

  // Private helper methods

  private getUserPermissions(): Permission[] {
    // Use cached permissions if available (from frontend auth provider)
    if (this.userContext.all_permissions.length > 0) {
      // When permissions come from frontend (API response), role.permissions is empty
      // So we just filter by active roles and active permissions
      const activeRoleIds = new Set(
        this.userContext.roles.filter((role) => role.is_active).map((role) => role.role_id)
      );

      // If user has active roles and active permissions, return them
      if (activeRoleIds.size > 0) {
        return this.userContext.all_permissions.filter((permission) => permission.is_active);
      }
    }

    // Fallback: flatten permissions from roles (used when permissions are embedded in roles)
    const permissions = this.userContext.roles
      .filter((role) => role.is_active)
      .flatMap((role) => role.permissions)
      .filter((permission) => permission.is_active);

    // Deduplicate by permission_id
    const uniquePermissions = permissions.filter(
      (permission, index, array) =>
        array.findIndex((p) => p.permission_id === permission.permission_id) === index
    );

    return uniquePermissions;
  }

  private isActionCompatible(userAction: string, requiredAction: string): boolean {
    // Exact match is always valid
    if (userAction === requiredAction) {
      return true;
    }

    // "manage" action grants all other actions for the resource
    // This allows templates:manage:all to satisfy templates:read:organization
    if (userAction === 'manage') {
      return true;
    }

    return false;
  }

  private isScopeCompatible(userScope: PermissionScope, requiredScope: PermissionScope): boolean {
    const scopeHierarchy: Record<PermissionScope, number> = {
      own: 1,
      organization: 2,
      all: 3,
    };

    return scopeHierarchy[userScope] >= scopeHierarchy[requiredScope];
  }

  private getHighestScope(scopes: PermissionScope[]): PermissionScope {
    if (scopes.includes('all')) return 'all';
    if (scopes.includes('organization')) return 'organization';
    return 'own';
  }

  private validateScopeAccess(
    scope: PermissionScope,
    resourceId?: string,
    organizationId?: string
  ): { valid: boolean; reason?: string; applicableOrganizations?: string[] } {
    switch (scope) {
      case 'own':
        // User can only access their own resources or resources they own
        if (resourceId) {
          // Direct user ID match (user accessing their own profile)
          if (resourceId === this.userContext.user_id) {
            return { valid: true };
          }

          // For client-side permission checking, we can't do database lookups
          // So we'll be permissive here and let server-side validation handle the real check
          // TODO: Consider adding owned_practice_ids to UserContext for better client-side checking
          return { valid: true };
        }
        return { valid: true };

      case 'organization': {
        // User can access resources within their accessible organizations
        const targetOrgId = organizationId || this.userContext.current_organization_id;

        if (!targetOrgId) {
          return {
            valid: false,
            reason: 'No organization context provided for organization-scoped permission',
          };
        }

        if (!this.canAccessOrganization(targetOrgId)) {
          return {
            valid: false,
            reason: `Access denied to organization: ${targetOrgId}`,
          };
        }

        return {
          valid: true,
          applicableOrganizations: [targetOrgId],
        };
      }

      case 'all':
        // Super admin can access all resources
        return {
          valid: true,
          applicableOrganizations: this.userContext.accessible_organizations.map(
            (org) => org.organization_id
          ),
        };

      default:
        return {
          valid: false,
          reason: `Unknown scope: ${scope}`,
        };
    }
  }
}

/**
 * Factory function to create a PermissionChecker instance
 */
export function createPermissionChecker(userContext: UserContext): PermissionChecker {
  return new PermissionChecker(userContext);
}

/**
 * Utility function to check a single permission quickly
 */
export function checkUserPermission(
  userContext: UserContext,
  permissionName: string,
  resourceId?: string,
  organizationId?: string
): boolean {
  const checker = new PermissionChecker(userContext);
  return checker.hasPermission(permissionName, resourceId, organizationId);
}
