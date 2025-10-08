import { count, eq, inArray } from 'drizzle-orm';
import { log } from '@/lib/logger';
import { db } from './index';
import { organizations, permissions, role_permissions, roles } from './schema';
import { getAllPermissions, getAllRoles, SAMPLE_ORGANIZATIONS } from './rbac-seed-data';

/**
 * RBAC Seed Data for Healthcare Practice Management System
 * Creates base permissions, roles, and sample organization structure
 *
 * IMPORTANT: This file now imports from rbac-seed-data.ts (single source of truth)
 * Do not define permissions/roles here - update rbac-seed-data.ts instead
 */

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
    // Get permissions and roles from centralized source
    const BASE_PERMISSIONS = getAllPermissions();
    const BASE_ROLES = getAllRoles();

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
          roleInfo.is_system_role ? eq(roles.name, roleInfo.name) : eq(roles.name, roleInfo.name)
        )
        .limit(1);

      let role: typeof existingRole[0] | undefined;
      if (existingRole.length > 0 && existingRole[0]) {
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
        [role] = await db.insert(roles).values(roleInfo).returning();
      }

      if (!role) continue;

      processedRoles.push(role);

      // Get ALL permission IDs if role is super_admin
      let permissionIds: Array<{ permission_id: string }>;
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
          .where(inArray(permissions.name, rolePermissions as readonly string[]));
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
