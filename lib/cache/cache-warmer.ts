/**
 * Cache Warming Service
 * Pre-loads common roles and permissions on application startup
 */

import { db } from '@/lib/db';
import { roles, permissions, role_permissions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { rolePermissionCache } from './role-permission-cache';
import { logger } from '@/lib/logger';
import type { Permission } from '@/lib/types/rbac';

/**
 * Warm up the role permission cache with all active roles
 */
export async function warmUpRolePermissionCache(): Promise<void> {
  try {
    logger.info('Starting role permission cache warm-up...');
    
    // Get all active roles with their permissions
    const rolePermissionsData = await db
      .select({
        role_id: roles.role_id,
        role_name: roles.name,
        permission_id: permissions.permission_id,
        permission_name: permissions.name,
        description: permissions.description,
        resource: permissions.resource,
        action: permissions.action,
        scope: permissions.scope,
        is_active: permissions.is_active,
        created_at: permissions.created_at,
        updated_at: permissions.updated_at
      })
      .from(roles)
      .innerJoin(role_permissions, eq(roles.role_id, role_permissions.role_id))
      .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
      .where(
        and(
          eq(roles.is_active, true),
          eq(permissions.is_active, true)
        )
      );

    // Group permissions by role
    const rolePermissionsMap = new Map<string, { name: string; permissions: Permission[] }>();
    
    for (const row of rolePermissionsData) {
      if (!rolePermissionsMap.has(row.role_id)) {
        rolePermissionsMap.set(row.role_id, {
          name: row.role_name,
          permissions: []
        });
      }
      
      const roleData = rolePermissionsMap.get(row.role_id);
      if (roleData) {
        roleData.permissions.push({
        permission_id: row.permission_id,
        name: row.permission_name,
        description: row.description || undefined,
        resource: row.resource,
        action: row.action,
        scope: row.scope as 'own' | 'organization' | 'all',
        is_active: row.is_active ?? true,
        created_at: row.created_at ?? new Date(),
        updated_at: row.updated_at ?? new Date()
        });
      }
    }
    
    // Populate cache
    let cachedRoles = 0;
    const entries = Array.from(rolePermissionsMap.entries());
    for (const [roleId, roleData] of entries) {
      rolePermissionCache.set(roleId, roleData.name, roleData.permissions);
      cachedRoles++;
    }
    
    logger.info('Role permission cache warm-up completed', {
      cachedRoles,
      totalPermissions: rolePermissionsData.length,
      cacheSize: rolePermissionCache.getStats().size
    });
    
  } catch (error) {
    logger.error('Failed to warm up role permission cache', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

/**
 * Initialize cache on application startup
 */
export async function initializeCache(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    await warmUpRolePermissionCache();
  }
}
