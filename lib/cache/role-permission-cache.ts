/**
 * In-Memory Role-Permission Cache
 * Caches role-permission mappings to eliminate database queries
 */

import { logger } from '@/lib/logger';
import type { Permission } from '@/lib/types/rbac';

interface CachedRolePermissions {
  role_id: string;
  name: string;
  permissions: Permission[];
  cached_at: number;
  version: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  lastCleared: number;
}

class RolePermissionCache {
  private cache = new Map<string, CachedRolePermissions>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    lastCleared: Date.now(),
  };

  // Cache TTL: 24 hours (in milliseconds)
  private readonly TTL = 24 * 60 * 60 * 1000;

  // Role version tracking for cache invalidation
  private roleVersions = new Map<string, number>();

  /**
   * Get role permissions from cache or return null if not cached/expired
   */
  get(roleId: string): CachedRolePermissions | null {
    const cached = this.cache.get(roleId);

    if (!cached) {
      this.stats.misses++;
      logger.debug('Cache MISS: Role not found in cache', {
        roleId,
        cacheSize: this.cache.size,
        cachedRoleIds: Array.from(this.cache.keys()),
      });
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - cached.cached_at > this.TTL) {
      this.cache.delete(roleId);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      logger.debug('Cache MISS: Role expired', {
        roleId,
        age: now - cached.cached_at,
        ttl: this.TTL,
      });
      return null;
    }

    this.stats.hits++;
    logger.debug('Cache HIT: Role found in cache', {
      roleId,
      roleName: cached.name,
      permissionCount: cached.permissions.length,
    });
    return cached;
  }

  /**
   * Set role permissions in cache
   */
  set(roleId: string, name: string, permissions: Permission[], version: number = 1): void {
    const cached: CachedRolePermissions = {
      role_id: roleId,
      name,
      permissions,
      cached_at: Date.now(),
      version,
    };

    this.cache.set(roleId, cached);
    this.roleVersions.set(roleId, version);
    this.stats.size = this.cache.size;

    logger.debug('Cache SET: Role permissions cached', {
      roleId,
      roleName: name,
      permissionCount: permissions.length,
      cacheSize: this.stats.size,
      version,
    });
  }

  /**
   * Invalidate specific role from cache
   */
  invalidate(roleId: string): boolean {
    const deleted = this.cache.delete(roleId);
    this.roleVersions.delete(roleId);
    this.stats.size = this.cache.size;

    if (deleted) {
      logger.info('Role permissions invalidated', { roleId });
    }

    return deleted;
  }

  /**
   * Invalidate all cached role permissions
   */
  invalidateAll(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.roleVersions.clear();
    this.stats.size = 0;
    this.stats.lastCleared = Date.now();

    logger.info('All role permissions cache cleared', {
      previousSize,
      operation: 'invalidateAll',
    });
  }

  /**
   * Get role version for cache invalidation
   */
  getRoleVersion(roleId: string): number {
    return this.roleVersions.get(roleId) || 1;
  }

  /**
   * Increment role version (for cache invalidation)
   */
  incrementRoleVersion(roleId: string): number {
    const currentVersion = this.getRoleVersion(roleId);
    const newVersion = currentVersion + 1;
    this.roleVersions.set(roleId, newVersion);

    // Invalidate the cached role
    this.invalidate(roleId);

    logger.info('Role version incremented', {
      roleId,
      oldVersion: currentVersion,
      newVersion,
    });

    return newVersion;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    // Convert iterator to array for compatibility
    const entries = Array.from(this.cache.entries());
    for (const [roleId, cached] of entries) {
      if (now - cached.cached_at > this.TTL) {
        this.cache.delete(roleId);
        this.roleVersions.delete(roleId);
        cleanedCount++;
      }
    }

    this.stats.size = this.cache.size;

    if (cleanedCount > 0) {
      logger.debug('Cache cleanup completed', {
        cleanedCount,
        remainingSize: this.stats.size,
      });
    }

    return cleanedCount;
  }

  /**
   * Check if cache has role permissions
   */
  has(roleId: string): boolean {
    return this.cache.has(roleId) && this.get(roleId) !== null;
  }

  /**
   * Get all cached role IDs
   */
  getCachedRoleIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance
export const rolePermissionCache = new RolePermissionCache();

// Cleanup expired entries every hour
setInterval(
  () => {
    rolePermissionCache.cleanup();
  },
  60 * 60 * 1000
);

// Log cache stats every 10 minutes in development
if (process.env.NODE_ENV === 'development') {
  setInterval(
    () => {
      const stats = rolePermissionCache.getStats();
      if (stats.hits + stats.misses > 0) {
        logger.debug('Role permission cache stats', {
          hits: stats.hits,
          misses: stats.misses,
          size: stats.size,
          hitRate: stats.hitRate,
          lastCleared: stats.lastCleared,
        });
      }
    },
    10 * 60 * 1000
  );
}
