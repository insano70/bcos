/**
 * Committed Role Factory
 *
 * Creates roles and role assignments in committed transactions
 * that are visible to services using the global db connection.
 */

import type { InferSelectModel } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { permissions, role_permissions, roles, user_roles } from '@/lib/db/schema';
import {
  BaseFactory,
  type BaseFactoryOptions,
  defaultCleanupTracker,
  defaultIDGenerator,
} from '../base';

export type CommittedRole = InferSelectModel<typeof roles>;

export interface CreateRoleOptions extends BaseFactoryOptions {
  name?: string;
  description?: string;
  organizationId?: string | null;
  isSystemRole?: boolean;
  isActive?: boolean;
  permissionNames?: string[]; // Permission names to assign to this role
}

export class CommittedRoleFactory extends BaseFactory<CommittedRole, CreateRoleOptions> {
  protected readonly entityType = 'role' as const;

  protected async createInDatabase(options: CreateRoleOptions): Promise<CommittedRole> {
    const roleName = options.name || `test_role_${Date.now()}`;

    const roleData = {
      name: roleName,
      description: options.description || `Test role: ${roleName}`,
      organization_id: options.organizationId ?? null,
      is_system_role: options.isSystemRole ?? false,
      is_active: options.isActive ?? true,
    };

    const [role] = await this.db.insert(roles).values(roleData).returning();

    if (!role) {
      throw new Error('Failed to create test role');
    }

    // Assign permissions if provided
    if (options.permissionNames && options.permissionNames.length > 0) {
      // Find permission IDs
      const permissionRecords = await this.db
        .select()
        .from(permissions)
        .where(inArray(permissions.name, options.permissionNames));

      if (permissionRecords.length > 0) {
        const rolePermissionValues = permissionRecords.map((perm) => ({
          role_id: role.role_id,
          permission_id: perm.permission_id,
        }));

        await this.db.insert(role_permissions).values(rolePermissionValues);
      }
    }

    return role;
  }

  protected async cleanupFromDatabase(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    // Delete role_permissions first (cascade should handle this but being explicit)
    await this.db.delete(role_permissions).where(inArray(role_permissions.role_id, ids));

    // Delete user_roles
    await this.db.delete(user_roles).where(inArray(user_roles.role_id, ids));

    // Delete roles
    await this.db.delete(roles).where(inArray(roles.role_id, ids));
  }
}

/**
 * Singleton instance
 */
export const committedRoleFactory = new CommittedRoleFactory(
  defaultIDGenerator,
  defaultCleanupTracker
);

/**
 * Convenience function to create a role
 */
export async function createCommittedRole(options: CreateRoleOptions = {}): Promise<CommittedRole> {
  const result = await committedRoleFactory.create(options);
  return result.data;
}

/**
 * Convenience function to assign a role to a user
 */
export async function assignCommittedRoleToUser(
  userId: string,
  roleId: string,
  organizationId?: string
): Promise<void> {
  const { db } = await import('@/lib/db');

  await db.insert(user_roles).values({
    user_id: userId,
    role_id: roleId,
    organization_id: organizationId ?? null,
  });
}
