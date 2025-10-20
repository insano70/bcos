/**
 * Role Permission Cache Invalidation Service
 * Handles cache invalidation when roles/permissions are modified
 */

import { eq } from 'drizzle-orm';
import { revokeAllUserTokens } from '@/lib/auth/tokens';
import { rbacCache } from '@/lib/cache';
import { db, user_roles } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * Invalidate role permissions cache when role is modified
 * Now uses Redis for multi-instance consistency
 */
export async function invalidateRolePermissions(roleId: string, roleName?: string): Promise<void> {
  // Invalidate the specific role cache in Redis
  const wasInvalidated = await rbacCache.invalidateRolePermissions(roleId);

  log.info('Role permissions invalidated in Redis', {
    roleId,
    roleName,
    wasInvalidated,
    operation: 'invalidateRolePermissions',
  });
}

/**
 * Invalidate all role permissions cache (use sparingly)
 * Now uses Redis for multi-instance consistency
 */
export async function invalidateAllRolePermissions(): Promise<void> {
  await rbacCache.invalidateAllRolePermissions();

  log.warn('All role permissions cache invalidated in Redis', {
    operation: 'invalidateAllRolePermissions',
  });
}

/**
 * Get all users who have a specific role assigned
 * Used for bulk token revocation when role permissions change
 */
async function getUsersWithRole(roleId: string): Promise<Array<{ user_id: string }>> {
  const usersWithRole = await db
    .select({ user_id: user_roles.user_id })
    .from(user_roles)
    .where(eq(user_roles.role_id, roleId))
    .groupBy(user_roles.user_id); // Deduplicate if user has role in multiple orgs

  log.debug('Retrieved users with role', {
    roleId,
    userCount: usersWithRole.length,
  });

  return usersWithRole;
}

/**
 * Invalidate user tokens when their roles are modified
 * This forces users to get new JWTs with updated role information
 *
 * SECURITY: When role permissions change, all users with that role must
 * get fresh tokens reflecting the new permissions. This prevents privilege
 * escalation or unauthorized access with stale tokens.
 */
export async function invalidateUserTokensWithRole(
  roleId: string,
  reason: string = 'role_modified'
): Promise<number> {
  const startTime = Date.now();

  try {
    // Query all users who have this role
    const usersWithRole = await getUsersWithRole(roleId);

    if (usersWithRole.length === 0) {
      log.info('No users found with role - no tokens to revoke', {
        roleId,
        reason,
      });
      return 0;
    }

    // Revoke all tokens for each user
    let totalRevokedCount = 0;
    for (const user of usersWithRole) {
      try {
        const revokedCount = await revokeAllUserTokens(
          user.user_id,
          reason === 'role_modified' ? 'security' : 'admin_action'
        );
        totalRevokedCount += revokedCount;

        log.debug('Revoked tokens for user due to role change', {
          userId: user.user_id,
          roleId,
          revokedCount,
        });
      } catch (error) {
        log.error(
          'Failed to revoke tokens for user',
          error instanceof Error ? error : new Error(String(error)),
          {
            userId: user.user_id,
            roleId,
            reason,
          }
        );
        // Continue with other users even if one fails
      }
    }

    log.info('User tokens invalidated for role change', {
      roleId,
      reason,
      affectedUsers: usersWithRole.length,
      totalTokensRevoked: totalRevokedCount,
      duration: Date.now() - startTime,
    });

    return totalRevokedCount;
  } catch (error) {
    log.error(
      'Failed to invalidate user tokens for role',
      error instanceof Error ? error : new Error(String(error)),
      {
        roleId,
        reason,
        duration: Date.now() - startTime,
      }
    );
    throw error;
  }
}

/**
 * Handle role permission update with proper cache invalidation
 */
export async function updateRolePermissionsWithInvalidation(
  roleId: string,
  roleName: string,
  newPermissions: string[],
  updateFunction: () => Promise<void>
): Promise<void> {
  try {
    // 1. Update the database
    await updateFunction();

    // 2. Invalidate cache immediately
    await invalidateRolePermissions(roleId, roleName);

    // 3. Optional: Invalidate user tokens (forces fresh JWTs)
    await invalidateUserTokensWithRole(roleId, 'permissions_updated');

    log.info('Role permissions updated with cache invalidation', {
      roleId,
      roleName,
      permissionCount: newPermissions.length,
    });
  } catch (error) {
    log.error(
      'Failed to update role permissions',
      error instanceof Error ? error : new Error(String(error)),
      {
        roleId,
        roleName,
      }
    );
    throw error;
  }
}

/**
 * Get cache statistics for monitoring
 * Now uses Redis cache
 */
export async function getCacheStats() {
  // Redis cache stats would need to be implemented in rbacCache
  // For now, return basic info
  return {
    backend: 'redis',
    note: 'Redis cache statistics not yet implemented',
  };
}

/**
 * Warm up cache by pre-loading common roles
 * Now uses Redis cache
 */
export async function warmUpCache(commonRoleIds: string[]): Promise<void> {
  log.info('Warming up Redis role permission cache', {
    roleCount: commonRoleIds.length,
  });

  // TODO: Implement Redis cache warming by pre-loading common roles
  // This would query database for common roles and cache them to Redis

  log.debug('Cache warm-up completed', {
    roleCount: commonRoleIds.length,
    note: 'Redis cache warming to be implemented',
  });
}
