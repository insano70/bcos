/**
 * Cache Performance Monitoring Utility
 * Tracks cache hit rates and performance metrics
 */

import { rolePermissionCache } from '@/lib/cache/role-permission-cache';
import { log } from '@/lib/logger';

/**
 * Log cache performance statistics
 */
export function logCacheStats(): void {
  const stats = rolePermissionCache.getStats();

  if (stats.hits + stats.misses > 0) {
    log.info('Cache Performance Stats', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${stats.hitRate}%`,
      cacheSize: stats.size,
      totalRequests: stats.hits + stats.misses,
    });
  }
}

/**
 * Monitor cache performance and log warnings for poor performance
 */
export function monitorCacheHealth(): void {
  const stats = rolePermissionCache.getStats();
  const totalRequests = stats.hits + stats.misses;

  if (totalRequests > 10) {
    // Only monitor after some requests
    if (stats.hitRate < 50) {
      log.warn('Low cache hit rate detected', {
        hitRate: stats.hitRate,
        recommendations: [
          'Check if roles are being modified frequently',
          'Verify cache TTL settings',
          'Consider warming up cache on startup',
        ],
      });
    }

    if (stats.size > 100) {
      log.warn('Large cache size detected', {
        cacheSize: stats.size,
        recommendation: 'Consider implementing cache size limits',
      });
    }
  }
}

/**
 * Export cache management functions for admin use
 */
export const cacheAdmin = {
  getStats: () => rolePermissionCache.getStats(),
  clearCache: () => rolePermissionCache.invalidateAll(),
  invalidateRole: (roleId: string) => rolePermissionCache.invalidate(roleId),
  getCachedRoleIds: () => rolePermissionCache.getCachedRoleIds(),
};
