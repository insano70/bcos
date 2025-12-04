import { and, eq, inArray } from 'drizzle-orm';
import { db, type DbContext } from '@/lib/db';
import { roles, user_roles } from '@/lib/db/rbac-schema';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';

/**
 * User Roles Service
 *
 * Manages user role assignments with RBAC controls.
 *
 * **Core Operations**:
 * - Get user roles
 * - Assign roles to users
 * - Remove roles from users
 * - Batch fetch roles for multiple users
 *
 * **Security Features**:
 * - Permission validation for role assignments
 * - Organization-scoped role management
 * - Transaction support for atomic updates
 *
 * @example
 * ```typescript
 * const service = createUserRolesService(userContext);
 *
 * // Get roles for a user
 * const roles = await service.getUserRoles('user-123');
 *
 * // Assign roles to user
 * await service.assignRolesToUser('user-123', ['role-1', 'role-2']);
 *
 * // Batch fetch roles for multiple users
 * const rolesMap = await service.batchGetUserRoles(['user-1', 'user-2']);
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface UserRole {
  id: string;
  name: string;
}

/**
 * User Roles Service Interface
 */
export interface UserRolesServiceInterface {
  getUserRoles(userId: string): Promise<UserRole[]>;
  assignRolesToUser(userId: string, roleIds: string[], tx?: DbContext): Promise<void>;
  removeRolesFromUser(userId: string, roleIds: string[]): Promise<void>;
  batchGetUserRoles(userIds: string[]): Promise<Map<string, UserRole[]>>;
}

// ============================================================================
// Service Implementation
// ============================================================================

class UserRolesService implements UserRolesServiceInterface {
  private readonly isSuperAdmin: boolean;

  constructor(private readonly userContext: UserContext) {
    this.isSuperAdmin = userContext.is_super_admin || false;
  }

  /**
   * Require permission or throw error
   */
  private requirePermission(permission: string, resourceId?: string): void {
    const hasPermission = this.userContext.all_permissions?.some((p) => p.name === permission);
    if (!hasPermission && !this.isSuperAdmin) {
      throw new PermissionDeniedError(permission, resourceId || 'unknown');
    }
  }

  /**
   * Get roles for a specific user
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const startTime = Date.now();

    try {
      const queryStart = Date.now();
      const rolesQuery = await db
        .select({
          role_id: roles.role_id,
          role_name: roles.name,
        })
        .from(user_roles)
        .innerJoin(roles, eq(roles.role_id, user_roles.role_id))
        .where(
          and(
            eq(user_roles.user_id, userId),
            eq(user_roles.is_active, true),
            eq(roles.is_active, true)
          )
        );
      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      const userRoles = rolesQuery.map((role) => ({
        id: role.role_id,
        name: role.role_name,
      }));

      log.info('user roles retrieved', {
        operation: 'get_user_roles',
        userId: this.userContext.user_id,
        targetUserId: userId,
        duration,
        metadata: {
          roleCount: userRoles.length,
          query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          component: 'service',
        },
      });

      return userRoles;
    } catch (error) {
      log.error('get user roles failed', error, {
        operation: 'get_user_roles',
        userId: this.userContext.user_id,
        targetUserId: userId,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Batch fetch roles for multiple users
   * Optimized for N+1 prevention
   */
  async batchGetUserRoles(userIds: string[]): Promise<Map<string, UserRole[]>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const startTime = Date.now();

    try {
      const queryStart = Date.now();
      const rolesQuery = await db
        .select({
          user_id: user_roles.user_id,
          role_id: roles.role_id,
          role_name: roles.name,
        })
        .from(user_roles)
        .innerJoin(roles, eq(roles.role_id, user_roles.role_id))
        .where(
          and(
            inArray(user_roles.user_id, userIds),
            eq(user_roles.is_active, true),
            eq(roles.is_active, true)
          )
        );
      const queryDuration = Date.now() - queryStart;
      const duration = Date.now() - startTime;

      // Build map of userId -> roles[]
      const rolesMap = new Map<string, UserRole[]>();

      rolesQuery.forEach((roleRow) => {
        if (!rolesMap.has(roleRow.user_id)) {
          rolesMap.set(roleRow.user_id, []);
        }
        rolesMap.get(roleRow.user_id)?.push({
          id: roleRow.role_id,
          name: roleRow.role_name,
        });
      });

      log.info('batch user roles retrieved', {
        operation: 'batch_get_user_roles',
        userId: this.userContext.user_id,
        duration,
        metadata: {
          userCount: userIds.length,
          usersWithRoles: rolesMap.size,
          totalRoles: rolesQuery.length,
          query: { duration: queryDuration, slow: queryDuration > SLOW_THRESHOLDS.DB_QUERY },
          component: 'service',
        },
      });

      return rolesMap;
    } catch (error) {
      log.error('batch get user roles failed', error, {
        operation: 'batch_get_user_roles',
        userId: this.userContext.user_id,
        userCount: userIds.length,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Assign roles to a user
   * Replaces all existing roles with new set
   *
   * @param userId - The user ID to assign roles to
   * @param roleIds - Array of role IDs to assign
   * @param tx - Optional transaction context. If provided, operations run within
   *             the caller's transaction for atomicity. If not provided, creates
   *             its own transaction.
   */
  async assignRolesToUser(userId: string, roleIds: string[], tx?: DbContext): Promise<void> {
    const startTime = Date.now();

    try {
      this.requirePermission('users:update:organization', userId);

      // Helper function to perform the role assignment
      const performRoleAssignment = async (dbCtx: DbContext) => {
        // Deactivate all current roles for this user
        await dbCtx.update(user_roles).set({ is_active: false }).where(eq(user_roles.user_id, userId));

        // Add the new roles
        if (roleIds.length > 0) {
          const roleAssignments = roleIds.map((roleId) => ({
            user_id: userId,
            role_id: roleId,
            organization_id: this.userContext.current_organization_id,
            granted_by: this.userContext.user_id,
            is_active: true,
          }));

          await dbCtx.insert(user_roles).values(roleAssignments);
        }
      };

      // If transaction provided, use it; otherwise create our own
      if (tx) {
        await performRoleAssignment(tx);
      } else {
        await db.transaction(async (newTx) => {
          await performRoleAssignment(newTx);
        });
      }

      const duration = Date.now() - startTime;

      const template = logTemplates.crud.update('user_roles', {
        resourceId: userId,
        resourceName: `user-${userId}`,
        userId: this.userContext.user_id,
        changes: {
          role_ids: { from: 'previous', to: roleIds },
        },
        duration,
        metadata: {
          roleCount: roleIds.length,
          component: 'service',
        },
      });

      log.info(template.message, template.context);
    } catch (error) {
      log.error('assign roles to user failed', error, {
        operation: 'assign_roles_to_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        roleCount: roleIds.length,
        component: 'service',
      });
      throw error;
    }
  }

  /**
   * Remove specific roles from a user
   */
  async removeRolesFromUser(userId: string, roleIds: string[]): Promise<void> {
    const startTime = Date.now();

    try {
      this.requirePermission('users:update:organization', userId);

      if (roleIds.length === 0) {
        return;
      }

      await db
        .update(user_roles)
        .set({ is_active: false })
        .where(and(eq(user_roles.user_id, userId), inArray(user_roles.role_id, roleIds)));

      const duration = Date.now() - startTime;

      log.info('user roles removed', {
        operation: 'remove_roles_from_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        duration,
        metadata: {
          roleCount: roleIds.length,
          component: 'service',
        },
      });
    } catch (error) {
      log.error('remove roles from user failed', error, {
        operation: 'remove_roles_from_user',
        userId: this.userContext.user_id,
        targetUserId: userId,
        roleCount: roleIds.length,
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
 * Factory function to create User Roles Service
 */
export function createUserRolesService(userContext: UserContext): UserRolesServiceInterface {
  return new UserRolesService(userContext);
}
