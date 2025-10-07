import { count, eq, inArray } from 'drizzle-orm';
import { log } from '@/lib/logger';
import { db } from './index';
import { organizations, permissions, role_permissions, roles } from './schema';

// Create RBAC seed rbacLogger with enhanced context
/**
 * RBAC Seed Data for Healthcare Practice Management System
 * Creates base permissions, roles, and sample organization structure
 */

// Healthcare-specific permissions following resource:action:scope pattern
const BASE_PERMISSIONS = [
  // User Management Permissions
  {
    name: 'users:read:own',
    description: 'Read own user profile',
    resource: 'users',
    action: 'read',
    scope: 'own',
  },
  {
    name: 'users:update:own',
    description: 'Update own user profile',
    resource: 'users',
    action: 'update',
    scope: 'own',
  },
  {
    name: 'users:read:organization',
    description: 'Read users in organization',
    resource: 'users',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'users:create:organization',
    description: 'Create users in organization',
    resource: 'users',
    action: 'create',
    scope: 'organization',
  },
  {
    name: 'users:update:organization',
    description: 'Update users in organization',
    resource: 'users',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'users:delete:organization',
    description: 'Delete users in organization',
    resource: 'users',
    action: 'delete',
    scope: 'organization',
  },
  {
    name: 'users:read:all',
    description: 'Read all users (super admin)',
    resource: 'users',
    action: 'read',
    scope: 'all',
  },
  {
    name: 'users:manage:all',
    description: 'Full user management (super admin)',
    resource: 'users',
    action: 'manage',
    scope: 'all',
  },

  // Practice/Organization Management Permissions
  {
    name: 'practices:read:own',
    description: 'Read own practice information',
    resource: 'practices',
    action: 'read',
    scope: 'own',
  },
  {
    name: 'practices:update:own',
    description: 'Update own practice information',
    resource: 'practices',
    action: 'update',
    scope: 'own',
  },
  {
    name: 'practices:staff:manage:own',
    description: 'Manage practice staff',
    resource: 'practices',
    action: 'staff:manage',
    scope: 'own',
  },
  {
    name: 'practices:read:organization',
    description: 'Read organization practices',
    resource: 'practices',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'practices:create:organization',
    description: 'Create practices in organization',
    resource: 'practices',
    action: 'create',
    scope: 'organization',
  },
  {
    name: 'practices:update:organization',
    description: 'Update organization practices',
    resource: 'practices',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'practices:delete:organization',
    description: 'Delete organization practices',
    resource: 'practices',
    action: 'delete',
    scope: 'organization',
  },
  {
    name: 'practices:create:all',
    description: 'Create new practices (super admin)',
    resource: 'practices',
    action: 'create',
    scope: 'all',
  },
  {
    name: 'practices:read:all',
    description: 'Read all practices (super admin)',
    resource: 'practices',
    action: 'read',
    scope: 'all',
  },
  {
    name: 'practices:manage:all',
    description: 'Full practice management (super admin)',
    resource: 'practices',
    action: 'manage',
    scope: 'all',
  },

  // Work Items Management Permissions
  {
    name: 'work_items:read:own',
    description: 'Read own work items',
    resource: 'work_items',
    action: 'read',
    scope: 'own',
  },
  {
    name: 'work_items:create:own',
    description: 'Create own work items',
    resource: 'work_items',
    action: 'create',
    scope: 'own',
  },
  {
    name: 'work_items:update:own',
    description: 'Update own work items',
    resource: 'work_items',
    action: 'update',
    scope: 'own',
  },
  {
    name: 'work_items:delete:own',
    description: 'Delete own work items',
    resource: 'work_items',
    action: 'delete',
    scope: 'own',
  },
  {
    name: 'work_items:read:organization',
    description: 'Read work items in organization',
    resource: 'work_items',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'work_items:create:organization',
    description: 'Create work items in organization',
    resource: 'work_items',
    action: 'create',
    scope: 'organization',
  },
  {
    name: 'work_items:update:organization',
    description: 'Update work items in organization',
    resource: 'work_items',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'work_items:delete:organization',
    description: 'Delete work items in organization',
    resource: 'work_items',
    action: 'delete',
    scope: 'organization',
  },
  {
    name: 'work_items:read:all',
    description: 'Read all work items (super admin)',
    resource: 'work_items',
    action: 'read',
    scope: 'all',
  },
  {
    name: 'work_items:manage:all',
    description: 'Full work item management (super admin)',
    resource: 'work_items',
    action: 'manage',
    scope: 'all',
  },

  // Organization Management Permissions
  {
    name: 'organizations:read:own',
    description: 'Read own organization information',
    resource: 'organizations',
    action: 'read',
    scope: 'own',
  },
  {
    name: 'organizations:update:own',
    description: 'Update own organization information',
    resource: 'organizations',
    action: 'update',
    scope: 'own',
  },
  {
    name: 'organizations:read:organization',
    description: 'Read organization entities',
    resource: 'organizations',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'organizations:create:organization',
    description: 'Create organizations in organization',
    resource: 'organizations',
    action: 'create',
    scope: 'organization',
  },
  {
    name: 'organizations:update:organization',
    description: 'Update organization entities',
    resource: 'organizations',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'organizations:delete:organization',
    description: 'Delete organization entities',
    resource: 'organizations',
    action: 'delete',
    scope: 'organization',
  },
  {
    name: 'organizations:create:all',
    description: 'Create new organizations (super admin)',
    resource: 'organizations',
    action: 'create',
    scope: 'all',
  },
  {
    name: 'organizations:read:all',
    description: 'Read all organizations (super admin)',
    resource: 'organizations',
    action: 'read',
    scope: 'all',
  },
  {
    name: 'organizations:manage:all',
    description: 'Full organization management (super admin)',
    resource: 'organizations',
    action: 'manage',
    scope: 'all',
  },

  // Analytics & Reporting Permissions
  {
    name: 'analytics:read:organization',
    description: 'View organization analytics',
    resource: 'analytics',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'analytics:export:organization',
    description: 'Export organization reports',
    resource: 'analytics',
    action: 'export',
    scope: 'organization',
  },
  {
    name: 'analytics:read:all',
    description: 'View all analytics (super admin)',
    resource: 'analytics',
    action: 'read',
    scope: 'all',
  },

  // Role Management Permissions
  {
    name: 'roles:read:organization',
    description: 'Read roles in organization',
    resource: 'roles',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'roles:create:organization',
    description: 'Create roles in organization',
    resource: 'roles',
    action: 'create',
    scope: 'organization',
  },
  {
    name: 'roles:update:organization',
    description: 'Update roles in organization',
    resource: 'roles',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'roles:delete:organization',
    description: 'Delete roles in organization',
    resource: 'roles',
    action: 'delete',
    scope: 'organization',
  },
  {
    name: 'roles:manage:all',
    description: 'Full role management (super admin)',
    resource: 'roles',
    action: 'manage',
    scope: 'all',
  },

  // Settings & Configuration Permissions
  {
    name: 'settings:read:organization',
    description: 'Read organization settings',
    resource: 'settings',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'settings:update:organization',
    description: 'Update organization settings',
    resource: 'settings',
    action: 'update',
    scope: 'organization',
  },
  {
    name: 'settings:read:all',
    description: 'Read all system settings',
    resource: 'settings',
    action: 'read',
    scope: 'all',
  },
  {
    name: 'settings:update:all',
    description: 'Update all system settings',
    resource: 'settings',
    action: 'update',
    scope: 'all',
  },

  // Template Management Permissions
  {
    name: 'templates:read:organization',
    description: 'Read available templates',
    resource: 'templates',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'templates:manage:all',
    description: 'Full template management (super admin)',
    resource: 'templates',
    action: 'manage',
    scope: 'all',
  },

  // API Access Permissions
  {
    name: 'api:read:organization',
    description: 'Read API access for organization',
    resource: 'api',
    action: 'read',
    scope: 'organization',
  },
  {
    name: 'api:write:organization',
    description: 'Write API access for organization',
    resource: 'api',
    action: 'write',
    scope: 'organization',
  },
];

// Base roles - Only 2 roles: super_admin (all permissions) and user (basic permissions)
const BASE_ROLES = [
  {
    name: 'super_admin',
    description: 'Super administrator with full system access to all features',
    is_system_role: true,
    permissions: 'ALL', // Special marker - will get all permissions dynamically
  },
  {
    name: 'user',
    description: 'Standard user with basic read/write permissions',
    is_system_role: false,
    permissions: [
      'users:read:own',
      'users:update:own',
      'practices:read:own',
      'organizations:read:own',
      'templates:read:organization',
    ],
  },
];

// Sample organizations for demonstration
const SAMPLE_ORGANIZATIONS = [
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
];

/**
 * Seed the RBAC system with base permissions, roles, and sample data
 * Supports midstream updates - can be run multiple times safely
 */
export async function seedRBACData() {
  log.info('Starting RBAC seed process (supports updates)', {
    operation: 'seedRBAC',
    phase: 'start',
  });

  try {
    // 1. Upsert base permissions (insert or update)
    log.info('Upserting base permissions', {
      operation: 'seedRBAC',
      phase: 'permissions',
    });

    let permissionCount = 0;
    for (const permission of BASE_PERMISSIONS) {
      await db
        .insert(permissions)
        .values(permission)
        .onConflictDoUpdate({
          target: permissions.name,
          set: {
            description: permission.description,
            resource: permission.resource,
            action: permission.action,
            scope: permission.scope,
            updated_at: new Date(),
          },
        });
      permissionCount++;
    }

    log.info('Permissions upserted', {
      count: permissionCount,
      operation: 'seedRBAC',
    });

    // 2. Upsert sample organizations (if they don't exist)
    log.info('Upserting sample organizations', {
      operation: 'seedRBAC',
      phase: 'organizations',
    });

    let orgCount = 0;
    for (const org of SAMPLE_ORGANIZATIONS) {
      await db
        .insert(organizations)
        .values(org)
        .onConflictDoUpdate({
          target: organizations.slug,
          set: {
            name: org.name,
            is_active: org.is_active,
            updated_at: new Date(),
          },
        });
      orgCount++;
    }

    log.info('Organizations upserted', {
      count: orgCount,
      operation: 'seedRBAC',
    });

    // 3. Upsert base roles and sync their permissions
    log.info('Upserting base roles and syncing permissions', {
      operation: 'seedRBAC',
      phase: 'roles',
    });

    const processedRoles = [];

    for (const roleData of BASE_ROLES) {
      const { permissions: rolePermissions, ...roleInfo } = roleData;

      // Upsert role - check if exists first (system roles have NULL organization_id)
      const existingRole = await db
        .select()
        .from(roles)
        .where(
          // System roles have organization_id = NULL
          roleInfo.is_system_role
            ? eq(roles.name, roleInfo.name)
            : eq(roles.name, roleInfo.name)
        )
        .limit(1);

      let role;
      if (existingRole.length > 0) {
        // Update existing role
        [role] = await db
          .update(roles)
          .set({
            description: roleInfo.description,
            is_system_role: roleInfo.is_system_role,
            is_active: true,
            updated_at: new Date(),
          })
          .where(eq(roles.role_id, existingRole[0].role_id))
          .returning();
      } else {
        // Insert new role
        [role] = await db
          .insert(roles)
          .values(roleInfo)
          .returning();
      }

      if (!role) continue;

      processedRoles.push(role);

      // Get ALL permission IDs if role is super_admin
      let permissionIds;
      if (rolePermissions === 'ALL') {
        log.info('Granting ALL permissions to super_admin', {
          role: role.name,
          operation: 'seedRBAC',
        });
        permissionIds = await db
          .select({ permission_id: permissions.permission_id })
          .from(permissions)
          .where(eq(permissions.is_active, true));
      } else {
        // Get specific permission IDs for regular roles
        permissionIds = await db
          .select({ permission_id: permissions.permission_id })
          .from(permissions)
          .where(inArray(permissions.name, rolePermissions as string[]));
      }

      // Delete existing role-permission associations for this role
      await db.delete(role_permissions).where(eq(role_permissions.role_id, role.role_id));

      // Insert fresh role-permission associations
      if (permissionIds.length > 0) {
        await db.insert(role_permissions).values(
          permissionIds.map((p) => ({
            role_id: role.role_id,
            permission_id: p.permission_id,
          }))
        );

        log.info('Role permissions synced', {
          role: role.name,
          permissionCount: permissionIds.length,
          operation: 'seedRBAC',
        });
      }
    }

    log.info('Roles upserted with permissions', {
      count: processedRoles.length,
      operation: 'seedRBAC',
    });

    // 4. Summary
    log.info('RBAC seed completed successfully', {
      operation: 'seedRBAC',
      phase: 'completed',
    });
    log.info('RBAC seed summary', {
      operation: 'seedRBAC',
      phase: 'summary',
      permissions: permissionCount,
      roles: processedRoles.length,
      organizations: orgCount,
    });
    log.info('Available roles', {
      operation: 'seedRBAC',
      phase: 'roleList',
    });
    processedRoles.forEach((role) => {
      if (role) {
        log.info('Role available', {
          name: role.name,
          description: role.description,
          operation: 'seedRBAC',
        });
      }
    });

    return {
      permissions: permissionCount,
      roles: processedRoles.length,
      organizations: orgCount,
    };
  } catch (error) {
    log.error('RBAC seed failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'seedRBAC',
    });
    throw error;
  }
}

/**
 * Clear all RBAC data (for testing/development)
 */
export async function clearRBACData() {
  log.info('Clearing RBAC data', {
    operation: 'clearRBAC',
    phase: 'start',
  });

  try {
    // Delete in correct order due to foreign key constraints
    await db.delete(role_permissions);
    await db.delete(roles);
    await db.delete(permissions);
    await db.delete(organizations);

    log.info('RBAC data cleared successfully', {
      operation: 'clearRBAC',
      phase: 'completed',
    });
  } catch (error) {
    log.error('Failed to clear RBAC data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'clearRBAC',
    });
    throw error;
  }
}

/**
 * Check if RBAC data already exists
 */
export async function checkRBACDataExists(): Promise<boolean> {
  try {
    const [result] = await db.select({ count: count() }).from(permissions);

    return (result?.count ?? 0) > 0;
  } catch (error) {
    log.error('Error checking RBAC data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      operation: 'checkRBAC',
    });
    return false;
  }
}
