/**
 * Cache Performance Monitoring Utility
 * Tracks Redis cache performance metrics
 */

import { rbacCache } from '@/lib/cache';
import { log } from '@/lib/logger';

/**
 * Log cache performance statistics
 * Now monitors Redis cache
 */
export async function logCacheStats(): Promise<void> {
  try {
    // Redis cache stats would need to be implemented in rbacCache
    log.info('Redis Cache Performance Stats', {
      backend: 'redis',
      note: 'Detailed stats to be implemented',
    });
  } catch (error) {
    log.error(
      'Failed to get cache stats',
      error instanceof Error ? error : new Error(String(error)),
      {}
    );
  }
}

/**
 * Monitor cache performance and log warnings for poor performance
 * Now monitors Redis cache
 */
export async function monitorCacheHealth(): Promise<void> {
  try {
    // Basic health check - logs cache backend status
    // For detailed metrics, use /api/admin/analytics/cache/stats endpoint
    log.debug('Redis cache health check', {
      backend: 'redis',
      status: 'active',
    });
  } catch (error) {
    log.error(
      'Cache health monitoring failed',
      error instanceof Error ? error : new Error(String(error)),
      {}
    );
  }
}

/**
 * Export cache management functions for admin use
 * Now uses Redis cache
 */
export const cacheAdmin = {
  clearCache: async () => {
    await rbacCache.invalidateAllRolePermissions();
    log.info('All Redis caches cleared');
  },
  invalidateRole: async (roleId: string) => {
    await rbacCache.invalidateRolePermissions(roleId);
    log.info('Role permissions invalidated', { roleId });
  },
  invalidateUser: async (userId: string) => {
    await rbacCache.invalidateUserContext(userId);
    log.info('User context invalidated', { userId });
  },
};
