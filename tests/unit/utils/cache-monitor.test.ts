import { beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '@/lib/logger';
import { cacheAdmin, logCacheStats, monitorCacheHealth } from '@/lib/utils/cache-monitor';

// Mock the cache
vi.mock('@/lib/cache', () => ({
  rbacCache: {
    invalidateAllRolePermissions: vi.fn(),
    invalidateRolePermissions: vi.fn(),
    invalidateUserContext: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('cache-monitor utilities', () => {
  let mockRbacCache: {
    invalidateAllRolePermissions: ReturnType<typeof vi.fn>;
    invalidateRolePermissions: ReturnType<typeof vi.fn>;
    invalidateUserContext: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get reference to the mocked cache
    const { rbacCache } = await import('@/lib/cache');
    mockRbacCache = vi.mocked(rbacCache);
  });

  describe('logCacheStats', () => {
    it('should log Redis cache information', async () => {
      await logCacheStats();

      // Verify Redis cache stats are logged
      expect(log.info).toHaveBeenCalledWith('Redis Cache Performance Stats', {
        backend: 'redis',
        note: 'Detailed stats to be implemented',
      });
    });
  });

  describe('monitorCacheHealth', () => {
    it('should log Redis cache health check', async () => {
      await monitorCacheHealth();

      // Verify health check is logged
      expect(log.debug).toHaveBeenCalledWith('Redis cache health check', {
        backend: 'redis',
        status: 'active',
      });
    });
  });

  describe('cacheAdmin', () => {
    it('should clear all caches', async () => {
      await cacheAdmin.clearCache();

      expect(mockRbacCache.invalidateAllRolePermissions).toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith('All Redis caches cleared');
    });

    it('should invalidate role permissions', async () => {
      const roleId = 'test-role-id';

      await cacheAdmin.invalidateRole(roleId);

      expect(mockRbacCache.invalidateRolePermissions).toHaveBeenCalledWith(roleId);
      expect(log.info).toHaveBeenCalledWith('Role permissions invalidated', { roleId });
    });

    it('should invalidate user context', async () => {
      const userId = 'test-user-id';

      await cacheAdmin.invalidateUser(userId);

      expect(mockRbacCache.invalidateUserContext).toHaveBeenCalledWith(userId);
      expect(log.info).toHaveBeenCalledWith('User context invalidated', { userId });
    });
  });
});
