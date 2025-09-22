/**
 * Role Permission Cache Invalidation Service
 * Handles cache invalidation when roles/permissions are modified
 */

import { rolePermissionCache } from '@/lib/cache/role-permission-cache';
import { TokenManager } from '@/lib/auth/token-manager';
import { logger } from '@/lib/logger';

/**
 * Invalidate role permissions cache when role is modified
 */
export async function invalidateRolePermissions(roleId: string, roleName?: string): Promise<void> {
  // Invalidate the specific role cache
  const wasInvalidated = rolePermissionCache.invalidate(roleId);
  
  // Increment role version to invalidate JWTs
  const newVersion = rolePermissionCache.incrementRoleVersion(roleId);
  
  logger.info('Role permissions invalidated', {
    roleId,
    roleName,
    wasInvalidated,
    newVersion,
    operation: 'invalidateRolePermissions'
  });
}

/**
 * Invalidate all role permissions cache (use sparingly)
 */
export async function invalidateAllRolePermissions(): Promise<void> {
  rolePermissionCache.invalidateAll();
  
  logger.warn('All role permissions cache invalidated', {
    operation: 'invalidateAllRolePermissions'
  });
}

/**
 * Invalidate user tokens when their roles are modified
 * This forces users to get new JWTs with updated role information
 */
export async function invalidateUserTokensWithRole(roleId: string, reason: string = 'role_modified'): Promise<number> {
  // In a production system, you'd query for users with this role
  // and revoke their tokens. For now, we'll log the intent.
  
  logger.info('User tokens should be invalidated for role change', {
    roleId,
    reason,
    note: 'Implementation needed: query users with role and revoke their tokens'
  });
  
  // TODO: Implement actual token revocation
  // const usersWithRole = await getUsersWithRole(roleId);
  // let revokedCount = 0;
  // for (const user of usersWithRole) {
  //   const revoked = await TokenManager.revokeAllUserTokens(user.user_id, 'role_modified');
  //   revokedCount += revoked;
  // }
  // return revokedCount;
  
  return 0; // Placeholder
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
    
    logger.info('Role permissions updated with cache invalidation', {
      roleId,
      roleName,
      permissionCount: newPermissions.length
    });
    
  } catch (error) {
    logger.error('Failed to update role permissions', {
      roleId,
      roleName,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  return rolePermissionCache.getStats();
}

/**
 * Warm up cache by pre-loading common roles
 */
export async function warmUpCache(commonRoleIds: string[]): Promise<void> {
  const { getCachedUserContextSafe } = await import('./cached-user-context');
  
  logger.info('Warming up role permission cache', {
    roleCount: commonRoleIds.length
  });
  
  // This will populate the cache for common roles
  // In a real implementation, you'd load these roles directly
  // For now, we'll just log the intent
  
  logger.debug('Cache warm-up completed', {
    roleCount: commonRoleIds.length,
    note: 'Implementation can be enhanced to pre-load specific roles'
  });
}
