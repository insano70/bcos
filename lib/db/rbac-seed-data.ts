/**
 * RBAC Seed Data - Single Source of Truth
 *
 * This file is the authoritative source for all RBAC permissions, roles, and sample data.
 * All seeding scripts MUST import from this file to ensure consistency.
 *
 * DO NOT define permissions elsewhere - update this file and regenerate as needed.
 */

export interface PermissionDefinition {
  description: string;
  resource: string;
  action: string;
  scope: 'own' | 'organization' | 'all';
}

export interface RoleDefinition {
  name: string;
  description: string;
  is_system_role: boolean;
  permissions: 'ALL' | readonly string[];
}

export interface OrganizationDefinition {
  name: string;
  slug: string;
  parent_organization_id: string | null;
  is_active: boolean;
}

/**
 * All RBAC Resources in the System
 */
export const RBAC_RESOURCES = [
  'users',
  'practices',
  'organizations',
  'work-items',
  'analytics',
  'data-sources',
  'dashboards',
  'charts',
  'roles',
  'settings',
  'templates',
  'api',
] as const;

/**
 * Complete Permission Registry
 * Format: resource:action:scope
 */
export const RBAC_PERMISSIONS: Record<string, PermissionDefinition> = {
  // ============================================================================
  // USER MANAGEMENT PERMISSIONS
  // ============================================================================
  'users:read:own': {
    description: 'Read own user profile',
    resource: 'users',
    action: 'read',
    scope: 'own',
  },
  'users:update:own': {
    description: 'Update own user profile',
    resource: 'users',
    action: 'update',
    scope: 'own',
  },
  'users:read:organization': {
    description: 'Read users in organization',
    resource: 'users',
    action: 'read',
    scope: 'organization',
  },
  'users:create:organization': {
    description: 'Create users in organization',
    resource: 'users',
    action: 'create',
    scope: 'organization',
  },
  'users:update:organization': {
    description: 'Update users in organization',
    resource: 'users',
    action: 'update',
    scope: 'organization',
  },
  'users:delete:organization': {
    description: 'Delete users in organization',
    resource: 'users',
    action: 'delete',
    scope: 'organization',
  },
  'users:read:all': {
    description: 'Read all users (super admin)',
    resource: 'users',
    action: 'read',
    scope: 'all',
  },
  'users:update:all': {
    description: 'Update all users (super admin)',
    resource: 'users',
    action: 'update',
    scope: 'all',
  },
  'users:manage:all': {
    description: 'Full user management (super admin)',
    resource: 'users',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // PRACTICE MANAGEMENT PERMISSIONS
  // ============================================================================
  'practices:read:own': {
    description: 'Read own practice information',
    resource: 'practices',
    action: 'read',
    scope: 'own',
  },
  'practices:update:own': {
    description: 'Update own practice information',
    resource: 'practices',
    action: 'update',
    scope: 'own',
  },
  'practices:staff:manage:own': {
    description: 'Manage practice staff',
    resource: 'practices',
    action: 'staff:manage',
    scope: 'own',
  },
  'practices:staff:read:own': {
    description: 'Read practice staff information',
    resource: 'practices',
    action: 'staff:read',
    scope: 'own',
  },
  'practices:read:organization': {
    description: 'Read organization practices',
    resource: 'practices',
    action: 'read',
    scope: 'organization',
  },
  'practices:create:organization': {
    description: 'Create practices in organization',
    resource: 'practices',
    action: 'create',
    scope: 'organization',
  },
  'practices:update:organization': {
    description: 'Update organization practices',
    resource: 'practices',
    action: 'update',
    scope: 'organization',
  },
  'practices:delete:organization': {
    description: 'Delete organization practices',
    resource: 'practices',
    action: 'delete',
    scope: 'organization',
  },
  'practices:create:all': {
    description: 'Create new practices (super admin)',
    resource: 'practices',
    action: 'create',
    scope: 'all',
  },
  'practices:read:all': {
    description: 'Read all practices (super admin)',
    resource: 'practices',
    action: 'read',
    scope: 'all',
  },
  'practices:manage:all': {
    description: 'Full practice management (super admin)',
    resource: 'practices',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // ORGANIZATION MANAGEMENT PERMISSIONS
  // ============================================================================
  'organizations:read:own': {
    description: 'Read own organization information',
    resource: 'organizations',
    action: 'read',
    scope: 'own',
  },
  'organizations:update:own': {
    description: 'Update own organization information',
    resource: 'organizations',
    action: 'update',
    scope: 'own',
  },
  'organizations:read:organization': {
    description: 'Read organization entities',
    resource: 'organizations',
    action: 'read',
    scope: 'organization',
  },
  'organizations:create:organization': {
    description: 'Create organizations in organization',
    resource: 'organizations',
    action: 'create',
    scope: 'organization',
  },
  'organizations:update:organization': {
    description: 'Update organization entities',
    resource: 'organizations',
    action: 'update',
    scope: 'organization',
  },
  'organizations:delete:organization': {
    description: 'Delete organization entities',
    resource: 'organizations',
    action: 'delete',
    scope: 'organization',
  },
  'organizations:create:all': {
    description: 'Create new organizations (super admin)',
    resource: 'organizations',
    action: 'create',
    scope: 'all',
  },
  'organizations:read:all': {
    description: 'Read all organizations (super admin)',
    resource: 'organizations',
    action: 'read',
    scope: 'all',
  },
  'organizations:manage:all': {
    description: 'Full organization management (super admin)',
    resource: 'organizations',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // WORK ITEMS MANAGEMENT PERMISSIONS
  // ============================================================================
  'work-items:read:own': {
    description: 'Read own work items',
    resource: 'work-items',
    action: 'read',
    scope: 'own',
  },
  'work-items:create:own': {
    description: 'Create own work items',
    resource: 'work-items',
    action: 'create',
    scope: 'own',
  },
  'work-items:update:own': {
    description: 'Update own work items',
    resource: 'work-items',
    action: 'update',
    scope: 'own',
  },
  'work-items:delete:own': {
    description: 'Delete own work items',
    resource: 'work-items',
    action: 'delete',
    scope: 'own',
  },
  'work-items:read:organization': {
    description: 'Read work items in organization',
    resource: 'work-items',
    action: 'read',
    scope: 'organization',
  },
  'work-items:create:organization': {
    description: 'Create work items in organization',
    resource: 'work-items',
    action: 'create',
    scope: 'organization',
  },
  'work-items:update:organization': {
    description: 'Update work items in organization',
    resource: 'work-items',
    action: 'update',
    scope: 'organization',
  },
  'work-items:delete:organization': {
    description: 'Delete work items in organization',
    resource: 'work-items',
    action: 'delete',
    scope: 'organization',
  },
  'work-items:manage:organization': {
    description: 'Manage work item types, statuses, and fields in organization',
    resource: 'work-items',
    action: 'manage',
    scope: 'organization',
  },
  'work-items:read:all': {
    description: 'Read all work items (super admin)',
    resource: 'work-items',
    action: 'read',
    scope: 'all',
  },
  'work-items:update:all': {
    description: 'Update all work items (super admin)',
    resource: 'work-items',
    action: 'update',
    scope: 'all',
  },
  'work-items:delete:all': {
    description: 'Delete all work items (super admin)',
    resource: 'work-items',
    action: 'delete',
    scope: 'all',
  },
  'work-items:manage:all': {
    description: 'Full work item management (super admin)',
    resource: 'work-items',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // ANALYTICS & REPORTING PERMISSIONS
  // ============================================================================
  'analytics:read:organization': {
    description: 'View organization analytics',
    resource: 'analytics',
    action: 'read',
    scope: 'organization',
  },
  'analytics:export:organization': {
    description: 'Export organization reports',
    resource: 'analytics',
    action: 'export',
    scope: 'organization',
  },
  'analytics:read:all': {
    description: 'View all analytics (super admin)',
    resource: 'analytics',
    action: 'read',
    scope: 'all',
  },

  // ============================================================================
  // DATA SOURCE MANAGEMENT PERMISSIONS
  // ============================================================================
  'data-sources:read:organization': {
    description: 'Read data sources in organization',
    resource: 'data-sources',
    action: 'read',
    scope: 'organization',
  },
  'data-sources:read:all': {
    description: 'Read all data sources (super admin)',
    resource: 'data-sources',
    action: 'read',
    scope: 'all',
  },
  'data-sources:create:organization': {
    description: 'Create data sources in organization',
    resource: 'data-sources',
    action: 'create',
    scope: 'organization',
  },
  'data-sources:create:all': {
    description: 'Create data sources anywhere (super admin)',
    resource: 'data-sources',
    action: 'create',
    scope: 'all',
  },
  'data-sources:update:organization': {
    description: 'Update data sources in organization',
    resource: 'data-sources',
    action: 'update',
    scope: 'organization',
  },
  'data-sources:update:all': {
    description: 'Update all data sources (super admin)',
    resource: 'data-sources',
    action: 'update',
    scope: 'all',
  },
  'data-sources:delete:organization': {
    description: 'Delete data sources in organization',
    resource: 'data-sources',
    action: 'delete',
    scope: 'organization',
  },
  'data-sources:delete:all': {
    description: 'Delete all data sources (super admin)',
    resource: 'data-sources',
    action: 'delete',
    scope: 'all',
  },
  'data-sources:manage:all': {
    description: 'Full data source management (super admin)',
    resource: 'data-sources',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // DASHBOARD MANAGEMENT PERMISSIONS
  // ============================================================================
  'dashboards:read:own': {
    description: 'Read own dashboards',
    resource: 'dashboards',
    action: 'read',
    scope: 'own',
  },
  'dashboards:create:own': {
    description: 'Create own dashboards',
    resource: 'dashboards',
    action: 'create',
    scope: 'own',
  },
  'dashboards:update:own': {
    description: 'Update own dashboards',
    resource: 'dashboards',
    action: 'update',
    scope: 'own',
  },
  'dashboards:delete:own': {
    description: 'Delete own dashboards',
    resource: 'dashboards',
    action: 'delete',
    scope: 'own',
  },
  'dashboards:read:organization': {
    description: 'Read organization dashboards',
    resource: 'dashboards',
    action: 'read',
    scope: 'organization',
  },
  'dashboards:create:organization': {
    description: 'Create dashboards in organization',
    resource: 'dashboards',
    action: 'create',
    scope: 'organization',
  },
  'dashboards:update:organization': {
    description: 'Update organization dashboards',
    resource: 'dashboards',
    action: 'update',
    scope: 'organization',
  },
  'dashboards:delete:organization': {
    description: 'Delete organization dashboards',
    resource: 'dashboards',
    action: 'delete',
    scope: 'organization',
  },
  'dashboards:read:all': {
    description: 'Read all dashboards (super admin)',
    resource: 'dashboards',
    action: 'read',
    scope: 'all',
  },
  'dashboards:manage:all': {
    description: 'Full dashboard management (super admin)',
    resource: 'dashboards',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // CHART MANAGEMENT PERMISSIONS
  // ============================================================================
  'charts:read:own': {
    description: 'Read own charts',
    resource: 'charts',
    action: 'read',
    scope: 'own',
  },
  'charts:create:own': {
    description: 'Create own charts',
    resource: 'charts',
    action: 'create',
    scope: 'own',
  },
  'charts:update:own': {
    description: 'Update own charts',
    resource: 'charts',
    action: 'update',
    scope: 'own',
  },
  'charts:delete:own': {
    description: 'Delete own charts',
    resource: 'charts',
    action: 'delete',
    scope: 'own',
  },
  'charts:read:organization': {
    description: 'Read organization charts',
    resource: 'charts',
    action: 'read',
    scope: 'organization',
  },
  'charts:create:organization': {
    description: 'Create charts in organization',
    resource: 'charts',
    action: 'create',
    scope: 'organization',
  },
  'charts:update:organization': {
    description: 'Update organization charts',
    resource: 'charts',
    action: 'update',
    scope: 'organization',
  },
  'charts:delete:organization': {
    description: 'Delete organization charts',
    resource: 'charts',
    action: 'delete',
    scope: 'organization',
  },
  'charts:read:all': {
    description: 'Read all charts (super admin)',
    resource: 'charts',
    action: 'read',
    scope: 'all',
  },
  'charts:manage:all': {
    description: 'Full chart management (super admin)',
    resource: 'charts',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // ROLE MANAGEMENT PERMISSIONS
  // ============================================================================
  'roles:read:own': {
    description: 'Read own roles',
    resource: 'roles',
    action: 'read',
    scope: 'own',
  },
  'roles:read:organization': {
    description: 'Read roles in organization',
    resource: 'roles',
    action: 'read',
    scope: 'organization',
  },
  'roles:create:organization': {
    description: 'Create roles in organization',
    resource: 'roles',
    action: 'create',
    scope: 'organization',
  },
  'roles:update:organization': {
    description: 'Update roles in organization',
    resource: 'roles',
    action: 'update',
    scope: 'organization',
  },
  'roles:delete:organization': {
    description: 'Delete roles in organization',
    resource: 'roles',
    action: 'delete',
    scope: 'organization',
  },
  'roles:read:all': {
    description: 'Read all roles (admin level)',
    resource: 'roles',
    action: 'read',
    scope: 'all',
  },
  'roles:manage:all': {
    description: 'Full role management (super admin)',
    resource: 'roles',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // SETTINGS & CONFIGURATION PERMISSIONS
  // ============================================================================
  'settings:read:organization': {
    description: 'Read organization settings',
    resource: 'settings',
    action: 'read',
    scope: 'organization',
  },
  'settings:update:organization': {
    description: 'Update organization settings',
    resource: 'settings',
    action: 'update',
    scope: 'organization',
  },
  'settings:read:all': {
    description: 'Read all system settings',
    resource: 'settings',
    action: 'read',
    scope: 'all',
  },
  'settings:update:all': {
    description: 'Update all system settings',
    resource: 'settings',
    action: 'update',
    scope: 'all',
  },

  // ============================================================================
  // TEMPLATE MANAGEMENT PERMISSIONS
  // ============================================================================
  'templates:read:organization': {
    description: 'Read available templates',
    resource: 'templates',
    action: 'read',
    scope: 'organization',
  },
  'templates:manage:all': {
    description: 'Full template management (super admin)',
    resource: 'templates',
    action: 'manage',
    scope: 'all',
  },

  // ============================================================================
  // API ACCESS PERMISSIONS
  // ============================================================================
  'api:read:organization': {
    description: 'Read API access for organization',
    resource: 'api',
    action: 'read',
    scope: 'organization',
  },
  'api:write:organization': {
    description: 'Write API access for organization',
    resource: 'api',
    action: 'write',
    scope: 'organization',
  },

  // ============================================================================
  // DATA EXPLORER PERMISSIONS
  // ============================================================================
  'data-explorer:query:organization': {
    description: 'Generate SQL queries for organization data',
    resource: 'data-explorer',
    action: 'query',
    scope: 'organization',
  },
  'data-explorer:query:all': {
    description: 'Generate SQL queries for all data (super admin)',
    resource: 'data-explorer',
    action: 'query',
    scope: 'all',
  },
  'data-explorer:execute:own': {
    description: 'Execute queries filtered by own provider_uid',
    resource: 'data-explorer',
    action: 'execute',
    scope: 'own',
  },
  'data-explorer:execute:organization': {
    description: 'Execute queries filtered by organization practice_uids',
    resource: 'data-explorer',
    action: 'execute',
    scope: 'organization',
  },
  'data-explorer:execute:all': {
    description: 'Execute queries without filtering (super admin)',
    resource: 'data-explorer',
    action: 'execute',
    scope: 'all',
  },
  'data-explorer:metadata:read:organization': {
    description: 'View table/column metadata',
    resource: 'data-explorer',
    action: 'metadata:read',
    scope: 'organization',
  },
  'data-explorer:metadata:read:all': {
    description: 'View all metadata',
    resource: 'data-explorer',
    action: 'metadata:read',
    scope: 'all',
  },
  'data-explorer:metadata:manage:all': {
    description: 'Create/update/delete metadata (admin only)',
    resource: 'data-explorer',
    action: 'metadata:manage',
    scope: 'all',
  },
  'data-explorer:history:read:own': {
    description: 'View own query history',
    resource: 'data-explorer',
    action: 'history:read',
    scope: 'own',
  },
  'data-explorer:history:read:organization': {
    description: 'View organization query history',
    resource: 'data-explorer',
    action: 'history:read',
    scope: 'organization',
  },
  'data-explorer:history:read:all': {
    description: 'View all query history',
    resource: 'data-explorer',
    action: 'history:read',
    scope: 'all',
  },
  'data-explorer:templates:read:organization': {
    description: 'View query templates',
    resource: 'data-explorer',
    action: 'templates:read',
    scope: 'organization',
  },
  'data-explorer:templates:read:all': {
    description: 'View all templates',
    resource: 'data-explorer',
    action: 'templates:read',
    scope: 'all',
  },
  'data-explorer:templates:create:organization': {
    description: 'Create query templates',
    resource: 'data-explorer',
    action: 'templates:create',
    scope: 'organization',
  },
  'data-explorer:templates:manage:own': {
    description: 'Manage own templates',
    resource: 'data-explorer',
    action: 'templates:manage',
    scope: 'own',
  },
  'data-explorer:templates:manage:all': {
    description: 'Manage all templates',
    resource: 'data-explorer',
    action: 'templates:manage',
    scope: 'all',
  },
  'data-explorer:discovery:run:all': {
    description: 'Run schema auto-discovery (admin only)',
    resource: 'data-explorer',
    action: 'discovery:run',
    scope: 'all',
  },
} as const;

/**
 * Official System Roles
 * System roles for different user types and access levels
 */
export const RBAC_ROLES: Record<string, RoleDefinition> = {
  super_admin: {
    name: 'super_admin',
    description: 'Super administrator with full system access to all features',
    is_system_role: true,
    permissions: 'ALL', // Special marker - will get all permissions dynamically
  },
  user: {
    name: 'user',
    description: 'Standard user with basic read/write permissions',
    is_system_role: true,
    permissions: [
      // Own scope - basic self-management
      'users:read:own',
      'users:update:own',
      'practices:read:own',
      'organizations:read:own',

      // Work items - full CRUD on own, read organization
      'work-items:read:own',
      'work-items:create:own',
      'work-items:update:own',
      'work-items:delete:own',
      'work-items:read:organization',
      'work-items:create:organization',

      // Organization scope - read access to shared resources
      'templates:read:organization',
      'dashboards:read:organization',
      'charts:read:organization',
      'analytics:read:organization',
    ],
  },
  organization_analytics_user: {
    name: 'organization_analytics_user',
    description: 'Organization analytics user with read-only access to dashboards and data sources',
    is_system_role: true,
    permissions: [
      // Own scope - basic self-management
      'users:read:own',
      'users:update:own',
      'organizations:read:own',

      // Analytics access - organization scope read-only
      'organizations:read:organization',
      'data-sources:read:organization',
      'analytics:read:organization',
      'charts:read:organization',
      'dashboards:read:organization',
    ],
  },
} as const;

/**
 * Sample Organizations for Development/Demo
 */
export const SAMPLE_ORGANIZATIONS: readonly OrganizationDefinition[] = [
  {
    name: 'Platform Administration',
    slug: 'platform-admin',
    parent_organization_id: null,
    is_active: true,
  },
  {
    name: 'Rheumatology Associates',
    slug: 'rheumatology-associates',
    parent_organization_id: null,
    is_active: true,
  },
  {
    name: 'Joint Care Specialists',
    slug: 'joint-care-specialists',
    parent_organization_id: null,
    is_active: true,
  },
] as const;

/**
 * Helper function to get all permissions as array
 */
export function getAllPermissions(): Array<{ name: string } & PermissionDefinition> {
  return Object.entries(RBAC_PERMISSIONS).map(([name, def]) => ({
    name,
    ...def,
  }));
}

/**
 * Helper function to get all roles as array
 */
export function getAllRoles(): RoleDefinition[] {
  return Object.values(RBAC_ROLES);
}

/**
 * Helper function to get permissions for a specific role
 */
export function getRolePermissions(roleName: string): readonly string[] | 'ALL' {
  const role = RBAC_ROLES[roleName];
  if (!role) {
    throw new Error(`Role "${roleName}" not found in RBAC_ROLES`);
  }
  return role.permissions;
}

/**
 * Validation: Ensure all permission names follow the pattern resource:action:scope
 */
export function validatePermissionNames(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const pattern = /^[a-z_-]+:[a-z:]+:(own|organization|all)$/;

  for (const [name, def] of Object.entries(RBAC_PERMISSIONS)) {
    if (!pattern.test(name)) {
      errors.push(`Invalid permission name format: ${name}`);
    }

    const expectedName = `${def.resource}:${def.action}:${def.scope}`;
    if (name !== expectedName) {
      errors.push(`Permission name mismatch: "${name}" should be "${expectedName}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get permission count statistics
 */
export function getPermissionStats(): {
  total: number;
  byResource: Record<string, number>;
  byScope: Record<string, number>;
  byAction: Record<string, number>;
} {
  const permissions = getAllPermissions();
  const byResource: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  const byAction: Record<string, number> = {};

  for (const perm of permissions) {
    byResource[perm.resource] = (byResource[perm.resource] || 0) + 1;
    byScope[perm.scope] = (byScope[perm.scope] || 0) + 1;
    byAction[perm.action] = (byAction[perm.action] || 0) + 1;
  }

  return {
    total: permissions.length,
    byResource,
    byScope,
    byAction,
  };
}
