/**
 * Role Permission Cache Invalidation Service
 * Handles cache invalidation when roles/permissions are modified
 *
 * CACHE LAYERS:
 * - rbac:user:{userId}:context - Standard UserContext cache (5 min TTL)
 * - rbac:user:{userId}:fast-context - Fast UserContext cache (60 sec TTL)
 * - rbac:role:{roleId}:permissions - Role permissions cache (24 hr TTL)
 *
 * INVALIDATION TRIGGERS:
 * - User role assigned/removed -> invalidateUserContext(userId)
 * - User org membership changed -> invalidateUserContext(userId)
 * - Role permissions modified -> invalidateRolePermissions(roleId) + invalidateUsersContextWithRole(roleId)
 * - User deactivated -> invalidateUserContext(userId) + revoke tokens
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
 * Invalidate user context cache (both standard and fast cache)
 *
 * Should be called when:
 * - User roles are assigned/removed
 * - User organization membership changes
 * - User is deactivated
 *
 * @param userId - User ID to invalidate
 */
export async function invalidateUserContext(userId: string): Promise<void> {
  await rbacCache.invalidateAllUserContext(userId);

  log.info('User context cache invalidated', {
    userId,
    operation: 'invalidateUserContext',
  });
}

/**
 * Invalidate user context cache for all users with a specific role
 *
 * Should be called when role permissions are modified.
 * This ensures all affected users get fresh UserContext on next request.
 *
 * @param roleId - Role ID whose users should be invalidated
 */
export async function invalidateUsersContextWithRole(roleId: string): Promise<void> {
  const startTime = Date.now();

  try {
    const usersWithRole = await getUsersWithRole(roleId);

    if (usersWithRole.length === 0) {
      log.info('No users found with role - no contexts to invalidate', {
        roleId,
      });
      return;
    }

    // Invalidate context for each user in parallel
    await Promise.all(
      usersWithRole.map((user) => rbacCache.invalidateAllUserContext(user.user_id))
    );

    log.info('User contexts invalidated for role change', {
      roleId,
      affectedUsers: usersWithRole.length,
      duration: Date.now() - startTime,
      operation: 'invalidateUsersContextWithRole',
    });
  } catch (error) {
    log.error(
      'Failed to invalidate user contexts for role',
      error instanceof Error ? error : new Error(String(error)),
      {
        roleId,
        duration: Date.now() - startTime,
      }
    );
    throw error;
  }
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
 *
 * This function handles the full invalidation chain when role permissions change:
 * 1. Updates the database
 * 2. Invalidates role permission cache
 * 3. Invalidates user context caches for affected users
 * 4. Revokes tokens to force fresh JWTs
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

    // 2. Invalidate role permission cache immediately
    await invalidateRolePermissions(roleId, roleName);

    // 3. Invalidate user context caches for all users with this role
    // This ensures JWT version checks will trigger DB fallback
    await invalidateUsersContextWithRole(roleId);

    // 4. Revoke tokens to force fresh JWTs with updated permissions
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
export async function getCacheStats(): Promise<{ backend: string; note: string }> {
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

  // Note: Redis cache warms lazily on first access per role.
  // Pre-warming is not currently needed as cache hits are high after initial access.
  // If pre-warming becomes necessary, implement here by querying DB and calling
  // rbacCache.setRolePermissions() for each common role.

  log.debug('Cache warm-up check completed', {
    roleCount: commonRoleIds.length,
    strategy: 'lazy-load',
  });
}
