import { useMemo } from 'react';
import { useAuth } from '@/components/auth/custom-auth-provider';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import type { 
  UserContext,
  PermissionName,
  ResourceType,
  ActionType,
  AccessScope,
  Permission,
  Organization,
  UsePermissionsReturn
} from '@/lib/types/rbac';

/**
 * React Hook for RBAC Permission Checking
 * Integrates with existing authentication system to provide permission-based UI control
 */

/**
 * Main permissions hook - provides all RBAC functionality for React components
 */
export function usePermissions(): UsePermissionsReturn {
  const { user, isAuthenticated } = useAuth();
  
  // For now, we'll create a basic UserContext from the existing auth user
  // TODO: This will be enhanced when we integrate full RBAC user context
  const userContext = useMemo((): UserContext | null => {
    if (!user || !isAuthenticated) {
      return null;
    }

    // Create a minimal UserContext for initial integration
    // This will be replaced with full RBAC context in the next task
    return {
      user_id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      is_active: true,
      email_verified: user.emailVerified,
      
      // Minimal RBAC data (will be enhanced)
      roles: [],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      
      // Current context
      current_organization_id: undefined,
      
      // Computed properties (will be populated properly later)
      all_permissions: [],
      is_super_admin: user.role === 'admin', // Temporary mapping
      organization_admin_for: []
    };
  }, [user, isAuthenticated]);

  const checker = useMemo(() => {
    return userContext ? new PermissionChecker(userContext) : null;
  }, [userContext]);

  const hasPermission = (
    permission: PermissionName,
    resourceId?: string,
    organizationId?: string
  ): boolean => {
    if (!checker || !userContext) return false;
    
    try {
      return checker.hasPermission(permission, resourceId, organizationId);
    } catch (error) {
      console.warn('Permission check failed:', error);
      return false;
    }
  };

  const hasAnyPermission = (
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ): boolean => {
    if (!checker || !userContext) return false;
    
    try {
      return checker.hasAnyPermission(permissions, resourceId, organizationId);
    } catch (error) {
      console.warn('Permission check failed:', error);
      return false;
    }
  };

  const hasAllPermissions = (
    permissions: PermissionName[],
    resourceId?: string,
    organizationId?: string
  ): boolean => {
    if (!checker || !userContext) return false;
    
    try {
      return checker.hasAllPermissions(permissions, resourceId, organizationId);
    } catch (error) {
      console.warn('Permission check failed:', error);
      return false;
    }
  };

  const canAccessResource = (resource: ResourceType, action: ActionType): boolean => {
    if (!checker) return false;
    
    try {
      checker.getAccessScope(resource, action);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const getAccessScope = (resource: ResourceType, action: ActionType): AccessScope | null => {
    if (!checker) return null;
    
    try {
      return checker.getAccessScope(resource, action);
    } catch (_error) {
      return null;
    }
  };

  const getAllPermissions = (): Permission[] => {
    if (!checker) return [];
    return checker.getAllPermissions();
  };

  const isSuperAdmin = (): boolean => {
    if (!checker) return false;
    return checker.isSuperAdmin();
  };

  const isOrganizationAdmin = (organizationId?: string): boolean => {
    if (!checker) return false;
    return checker.isOrganizationAdmin(organizationId);
  };

  const getCurrentOrganization = (): Organization | null => {
    if (!checker) return null;
    return checker.getCurrentOrganization() || null;
  };

  const accessibleOrganizations = useMemo(() => {
    return userContext?.accessible_organizations || [];
  }, [userContext]);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessResource,
    getAccessScope,
    getAllPermissions,
    isAuthenticated,
    isSuperAdmin: isSuperAdmin(),
    isOrganizationAdmin,
    currentOrganization: getCurrentOrganization(),
    accessibleOrganizations
  };
}

/**
 * Specialized hooks for common permission patterns
 */

/**
 * Hook for user management permissions
 */
export function useUserPermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadUsers: permissions.hasAnyPermission([
      'users:read:own',
      'users:read:organization', 
      'users:read:all'
    ]),
    canCreateUsers: permissions.hasPermission('users:create:organization'),
    canUpdateUsers: permissions.hasAnyPermission([
      'users:update:own',
      'users:update:organization'
    ]),
    canDeleteUsers: permissions.hasPermission('users:delete:organization'),
    canManageUsers: permissions.hasAnyPermission([
      'users:create:organization',
      'users:update:organization',
      'users:delete:organization'
    ]),
    canReadOwnProfile: permissions.hasPermission('users:read:own'),
    canUpdateOwnProfile: permissions.hasPermission('users:update:own')
  };
}

/**
 * Hook for practice/organization management permissions
 */
export function usePracticePermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadPractices: permissions.hasAnyPermission([
      'practices:read:own',
      'practices:read:all'
    ]),
    canUpdatePractices: permissions.hasPermission('practices:update:own'),
    canManagePracticeStaff: permissions.hasPermission('practices:staff:manage:own'),
    canCreatePractices: permissions.hasPermission('practices:create:all'),
    canManageAllPractices: permissions.hasPermission('practices:manage:all'),
    canDeletePractices: permissions.hasPermission('practices:manage:all')
  };
}

/**
 * Hook for analytics permissions
 */
export function useAnalyticsPermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadAnalytics: permissions.hasAnyPermission([
      'analytics:read:organization',
      'analytics:read:all'
    ]),
    canExportAnalytics: permissions.hasPermission('analytics:export:organization'),
    canReadAllAnalytics: permissions.hasPermission('analytics:read:all')
  };
}

/**
 * Hook for role management permissions
 */
export function useRolePermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadRoles: permissions.hasPermission('roles:read:organization'),
    canCreateRoles: permissions.hasPermission('roles:create:organization'),
    canUpdateRoles: permissions.hasPermission('roles:update:organization'),
    canDeleteRoles: permissions.hasPermission('roles:delete:organization'),
    canManageRoles: permissions.hasAnyPermission([
      'roles:create:organization',
      'roles:update:organization',
      'roles:delete:organization'
    ]),
    canManageAllRoles: permissions.hasPermission('roles:manage:all')
  };
}

/**
 * Hook for settings permissions
 */
export function useSettingsPermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadSettings: permissions.hasAnyPermission([
      'settings:read:organization',
      'settings:read:all'
    ]),
    canUpdateSettings: permissions.hasAnyPermission([
      'settings:update:organization',
      'settings:update:all'
    ]),
    canReadAllSettings: permissions.hasPermission('settings:read:all'),
    canUpdateAllSettings: permissions.hasPermission('settings:update:all')
  };
}

/**
 * Hook for template permissions
 */
export function useTemplatePermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadTemplates: permissions.hasPermission('templates:read:organization'),
    canManageTemplates: permissions.hasPermission('templates:manage:all')
  };
}

/**
 * Hook for API access permissions
 */
export function useApiPermissions() {
  const permissions = usePermissions();
  
  return {
    ...permissions,
    canReadAPI: permissions.hasPermission('api:read:organization'),
    canWriteAPI: permissions.hasPermission('api:write:organization'),
    hasApiAccess: permissions.hasAnyPermission([
      'api:read:organization',
      'api:write:organization'
    ])
  };
}

/**
 * Hook to check permissions for a specific resource
 */
export function useResourcePermissions(
  resourceType: ResourceType,
  resourceId?: string,
  organizationId?: string
) {
  const permissions = usePermissions();
  
  return useMemo(() => ({
    canRead: permissions.hasAnyPermission([
      `${resourceType}:read:own`,
      `${resourceType}:read:organization`,
      `${resourceType}:read:all`
    ] as PermissionName[], resourceId, organizationId),
    
    canUpdate: permissions.hasAnyPermission([
      `${resourceType}:update:own`,
      `${resourceType}:update:organization`
    ] as PermissionName[], resourceId, organizationId),
    
    canDelete: permissions.hasPermission(
      `${resourceType}:delete:organization` as PermissionName,
      resourceId,
      organizationId
    ),
    
    canCreate: permissions.hasPermission(
      `${resourceType}:create:organization` as PermissionName,
      resourceId,
      organizationId
    ),
    
    hasAnyAccess: permissions.hasAnyPermission([
      `${resourceType}:read:own`,
      `${resourceType}:read:organization`,
      `${resourceType}:read:all`,
      `${resourceType}:update:own`,
      `${resourceType}:update:organization`
    ] as PermissionName[], resourceId, organizationId)
  }), [permissions, resourceType, resourceId, organizationId]);
}

/**
 * Hook for organization-specific permissions
 */
export function useOrganizationPermissions(organizationId?: string) {
  const permissions = usePermissions();
  
  return useMemo(() => {
    const targetOrgId = organizationId || permissions.currentOrganization?.organization_id;
    
    return {
      organizationId: targetOrgId,
      canAccess: targetOrgId ? permissions.hasPermission('practices:read:own', undefined, targetOrgId) : false,
      canManage: targetOrgId ? permissions.hasPermission('practices:update:own', undefined, targetOrgId) : false,
      canManageStaff: targetOrgId ? permissions.hasPermission('practices:staff:manage:own', undefined, targetOrgId) : false,
      canViewAnalytics: targetOrgId ? permissions.hasPermission('analytics:read:organization', undefined, targetOrgId) : false,
      canExportData: targetOrgId ? permissions.hasPermission('analytics:export:organization', undefined, targetOrgId) : false,
      isAdmin: targetOrgId ? permissions.isOrganizationAdmin(targetOrgId) : false
    };
  }, [permissions, organizationId]);
}

/**
 * Hook to get user's permission summary
 */
export function usePermissionSummary() {
  const permissions = usePermissions();
  
  return useMemo(() => {
    const allPermissions = permissions.getAllPermissions();
    
    return {
      totalPermissions: allPermissions.length,
      permissionsByResource: allPermissions.reduce((acc, permission) => {
        const resource = permission.resource;
        if (!acc[resource]) {
          acc[resource] = [];
        }
        acc[resource].push(permission);
        return acc;
      }, {} as Record<string, Permission[]>),
      
      scopes: {
        hasOwnScope: allPermissions.some(p => p.scope === 'own'),
        hasOrgScope: allPermissions.some(p => p.scope === 'organization'),
        hasAllScope: allPermissions.some(p => p.scope === 'all')
      },
      
      adminStatus: {
        isSuperAdmin: permissions.isSuperAdmin,
        isOrgAdmin: permissions.accessibleOrganizations.some(org => 
          permissions.isOrganizationAdmin(org.organization_id)
        ),
        adminForOrgs: permissions.accessibleOrganizations.filter(org =>
          permissions.isOrganizationAdmin(org.organization_id)
        )
      }
    };
  }, [permissions]);
}
