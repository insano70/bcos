/**
 * RBAC Cache Service
 *
 * Handles caching for role-based access control data:
 * - User contexts (user + roles + permissions)
 * - Role permissions
 *
 * KEY NAMING CONVENTION:
 *   rbac:user:{userId}
 *   rbac:user:{userId}:context
 *   rbac:role:{roleId}:permissions
 *
 * TTL STRATEGY:
 * - User context: 5 minutes (needs to reflect permission changes reasonably quickly)
 * - Role permissions: 24 hours (rarely changes, heavily read)
 */

import type { Permission, UserContext } from '@/lib/types/rbac';
import { CacheService } from './base';
import { log } from '@/lib/logger';

/**
 * Cached role permissions structure
 */
export interface CachedRolePermissions {
  role_id: string;
  name: string;
  permissions: Permission[];
  cached_at: number;
  version: number;
}

/**
 * RBAC cache service
 */
class RbacCacheService extends CacheService {
  protected namespace = 'rbac';
  protected defaultTTL = 300; // 5 minutes

  // TTL constants
  private readonly USER_CONTEXT_TTL = 300; // 5 minutes
  private readonly ROLE_PERMISSIONS_TTL = 86400; // 24 hours

  /**
   * Get user context from cache
   *
   * @param userId - User ID
   * @returns UserContext or null if not cached
   */
  async getUserContext(userId: string): Promise<UserContext | null> {
    // Key: rbac:user:{userId}:context
    const key = this.buildKey('user', userId, 'context');
    return await this.get<UserContext>(key);
  }

  /**
   * Cache user context
   *
   * @param userId - User ID
   * @param context - User context to cache
   * @returns true if successful
   */
  async setUserContext(userId: string, context: UserContext): Promise<boolean> {
    // Key: rbac:user:{userId}:context
    const key = this.buildKey('user', userId, 'context');
    return await this.set(key, context, { ttl: this.USER_CONTEXT_TTL });
  }

  /**
   * Get role permissions from cache
   *
   * @param roleId - Role ID
   * @returns CachedRolePermissions or null if not cached
   */
  async getRolePermissions(roleId: string): Promise<CachedRolePermissions | null> {
    // Key: rbac:role:{roleId}:permissions
    const key = this.buildKey('role', roleId, 'permissions');
    return await this.get<CachedRolePermissions>(key);
  }

  /**
   * Cache role permissions
   *
   * @param roleId - Role ID
   * @param roleName - Role name
   * @param permissions - Array of permissions
   * @param version - Cache version (default: 1)
   * @returns true if successful
   */
  async setRolePermissions(
    roleId: string,
    roleName: string,
    permissions: Permission[],
    version: number = 1
  ): Promise<boolean> {
    // Key: rbac:role:{roleId}:permissions
    const key = this.buildKey('role', roleId, 'permissions');

    const cached: CachedRolePermissions = {
      role_id: roleId,
      name: roleName,
      permissions,
      cached_at: Date.now(),
      version,
    };

    return await this.set(key, cached, { ttl: this.ROLE_PERMISSIONS_TTL });
  }

  /**
   * Invalidate RBAC cache
   *
   * @param userId - User ID to invalidate (optional)
   * @param roleId - Role ID to invalidate (optional)
   *
   * If both provided: invalidates specific user and role
   * If only userId: invalidates user context
   * If only roleId: invalidates role permissions
   * If neither: does nothing
   */
  async invalidate(userId?: string, roleId?: string): Promise<void> {
    const keysToDelete: string[] = [];

    if (userId) {
      // Invalidate user context
      keysToDelete.push(this.buildKey('user', userId, 'context'));
    }

    if (roleId) {
      // Invalidate role permissions
      keysToDelete.push(this.buildKey('role', roleId, 'permissions'));
    }

    if (keysToDelete.length > 0) {
      await this.delMany(keysToDelete);

      log.debug('RBAC cache invalidated', {
        component: 'rbac-cache',
        userId,
        roleId,
        keysInvalidated: keysToDelete.length,
      });
    }
  }

  /**
   * Invalidate user context only
   *
   * @param userId - User ID
   */
  async invalidateUserContext(userId: string): Promise<void> {
    await this.invalidate(userId, undefined);
  }

  /**
   * Invalidate role permissions only
   *
   * @param roleId - Role ID
   * @returns true if successfully invalidated
   */
  async invalidateRolePermissions(roleId: string): Promise<boolean> {
    await this.invalidate(undefined, roleId);
    return true;
  }

  /**
   * Invalidate all caches for users with a specific role
   *
   * @param roleId - Role ID
   */
  async invalidateUsersWithRole(roleId: string): Promise<void> {
    // Invalidate the role permissions
    await this.invalidateRolePermissions(roleId);

    // Note: We can't easily find all users with this role without querying the database
    // For now, we just invalidate the role permissions and rely on the 5-minute TTL
    // for user contexts to eventually pick up the changes
    //
    // If immediate invalidation is needed, the caller should invalidate specific
    // user contexts after querying which users have this role

    log.debug('Role permissions invalidated', {
      component: 'rbac-cache',
      roleId,
      note: 'User contexts will refresh within 5 minutes',
    });
  }

  /**
   * Invalidate all role permissions (use sparingly)
   * Flushes entire rbac namespace
   */
  async invalidateAllRolePermissions(): Promise<void> {
    // Use pattern matching to delete all role permission keys
    const pattern = this.buildKey('role', '*', 'permissions');
    await this.delPattern(pattern);

    log.warn('All role permissions invalidated', {
      component: 'rbac-cache',
      pattern,
      operation: 'invalidateAllRolePermissions',
    });
  }
}

// Export singleton instance
export const rbacCache = new RbacCacheService();
