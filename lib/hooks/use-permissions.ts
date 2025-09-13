import { useMemo, useState, useEffect } from 'react';
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
 * Now uses real RBAC data from the backend instead of mock data
 */
export function usePermissions(): UsePermissionsReturn {
  const { user: authUser, isAuthenticated } = useAuth();
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch real RBAC user context from the backend
  useEffect(() => {
    if (!isAuthenticated || !authUser) {
      setUserContext(null);
      return;
    }

    const fetchUserContext = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch user context: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data?.user) {
          const apiUser = data.data.user;

          // Convert API response to UserContext format
          const context: UserContext = {
            user_id: apiUser.id,
            email: apiUser.email,
            first_name: apiUser.firstName,
            last_name: apiUser.lastName,
            is_active: true,
            email_verified: apiUser.emailVerified,

            // RBAC data from API
            roles: apiUser.roles.map((role: any) => ({
              role_id: role.id,
              name: role.name,
              description: role.description || '',
              organization_id: undefined, // Will be populated from user_roles if needed
              is_system_role: role.isSystemRole,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: undefined,
              permissions: [] // Will be populated from permissions array
            })),

            organizations: apiUser.organizations.map((org: any) => ({
              organization_id: org.id,
              name: org.name,
              slug: org.slug,
              parent_organization_id: undefined,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: undefined
            })),

            accessible_organizations: apiUser.accessibleOrganizations.map((org: any) => ({
              organization_id: org.id,
              name: org.name,
              slug: org.slug,
              parent_organization_id: undefined,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: undefined
            })),

            user_roles: [], // Could be populated if API provides this
            user_organizations: [], // Could be populated if API provides this

            // Current context
            current_organization_id: apiUser.currentOrganizationId,

            // Computed properties from API
            all_permissions: apiUser.permissions.map((perm: any) => ({
              permission_id: perm.id,
              name: perm.name,
              description: undefined,
              resource: perm.resource,
              action: perm.action,
              scope: perm.scope,
              is_active: true,
              created_at: new Date(),
              updated_at: new Date()
            })),

            is_super_admin: apiUser.isSuperAdmin,
            organization_admin_for: apiUser.organizationAdminFor || []
          };

          setUserContext(context);
        } else {
          throw new Error('Invalid API response format');
        }
      } catch (err) {
        console.error('Failed to fetch user context:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Fallback to minimal context if API fails
        setUserContext({
          user_id: authUser.id,
          email: authUser.email,
          first_name: authUser.firstName,
          last_name: authUser.lastName,
          is_active: true,
          email_verified: authUser.emailVerified,
          roles: [],
          organizations: [],
          accessible_organizations: [],
          user_roles: [],
          user_organizations: [],
          current_organization_id: undefined,
          all_permissions: [],
          is_super_admin: false,
          organization_admin_for: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserContext();
  }, [isAuthenticated, authUser]);

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
    isSuperAdmin: userContext?.is_super_admin || false,
    isOrganizationAdmin,
    currentOrganization: getCurrentOrganization(),
    accessibleOrganizations
  };
}

/**
 * Specialized hooks for common permission patterns
 */

/**
 * Hook for user management permissions - now uses real RBAC data
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
 * Hook for practice/organization management permissions - now uses real RBAC data
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
 * Hook for analytics permissions - now uses real RBAC data
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
 * Hook for role management permissions - now uses real RBAC data
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
 * Hook for settings permissions - now uses real RBAC data
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
 * Hook for template permissions - now uses real RBAC data
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
 * Hook for API access permissions - now uses real RBAC data
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
 * Hook to check permissions for a specific resource - now uses real RBAC data
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
 * Hook for organization-specific permissions - now uses real RBAC data
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
 * Hook to get user's permission summary - now uses real RBAC data
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
