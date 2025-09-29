import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logCacheStats, monitorCacheHealth, cacheAdmin } from '@/lib/utils/cache-monitor'
import { logger } from '@/lib/logger'
import type { MockRolePermissionCache } from '@/tests/types/test-types'

// Mock the cache
vi.mock('@/lib/cache/role-permission-cache', () => ({
  rolePermissionCache: {
    getStats: vi.fn(),
    invalidateAll: vi.fn(),
    invalidate: vi.fn(),
    getCachedRoleIds: vi.fn()
  }
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn()
  }
}))

describe('cache-monitor utilities', () => {
  let mockRolePermissionCache: MockRolePermissionCache

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Get reference to the mocked cache
    const { rolePermissionCache } = await import('@/lib/cache/role-permission-cache')
    mockRolePermissionCache = vi.mocked(rolePermissionCache) as unknown as MockRolePermissionCache
  })

  describe('logCacheStats', () => {
    it('should log cache statistics when there are requests', () => {
      const mockStats = {
        hits: 150,
        misses: 50,
        hitRate: 75,
        size: 10
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      logCacheStats()

      // Verify the business logic outcome: stats are logged when there are requests
      expect(logger.info).toHaveBeenCalledWith('Cache Performance Stats', {
        hits: 150,
        misses: 50,
        hitRate: '75%',
        cacheSize: 10,
        totalRequests: 200
      })
    })

    it('should not log when there are no requests', () => {
      const mockStats = {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      logCacheStats()

      // Verify the business logic outcome: no logging when no requests
      expect(logger.info).not.toHaveBeenCalled()
    })

    it('should calculate hit rate correctly', () => {
      const mockStats = {
        hits: 3,
        misses: 2,
        hitRate: 60,
        size: 5
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      logCacheStats()

      expect(logger.info).toHaveBeenCalledWith('Cache Performance Stats', {
        hits: 3,
        misses: 2,
        hitRate: '60%',
        cacheSize: 5,
        totalRequests: 5
      })
    })

    it('should handle zero hits', () => {
      const mockStats = {
        hits: 0,
        misses: 10,
        hitRate: 0,
        size: 3
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      logCacheStats()

      expect(logger.info).toHaveBeenCalledWith('Cache Performance Stats', {
        hits: 0,
        misses: 10,
        hitRate: '0%',
        cacheSize: 3,
        totalRequests: 10
      })
    })
  })

  describe('monitorCacheHealth', () => {
    it('should not monitor when there are fewer than 10 requests', () => {
      const mockStats = {
        hits: 3,
        misses: 2,
        hitRate: 60,
        size: 5
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(mockRolePermissionCache.getStats).toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should warn about low cache hit rate', () => {
      const mockStats = {
        hits: 25,
        misses: 75,
        hitRate: 25,
        size: 10
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(mockRolePermissionCache.getStats).toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith('Low cache hit rate detected', {
        hitRate: 25,
        recommendations: [
          'Check if roles are being modified frequently',
          'Verify cache TTL settings',
          'Consider warming up cache on startup'
        ]
      })
    })

    it('should warn about large cache size', () => {
      const mockStats = {
        hits: 80,
        misses: 20,
        hitRate: 80,
        size: 150
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(logger.warn).toHaveBeenCalledWith('Large cache size detected', {
        cacheSize: 150,
        recommendation: 'Consider implementing cache size limits'
      })
    })

    it('should warn about both low hit rate and large cache size', () => {
      const mockStats = {
        hits: 30,
        misses: 70,
        hitRate: 30,
        size: 120
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(logger.warn).toHaveBeenCalledTimes(2)
      expect(logger.warn).toHaveBeenCalledWith('Low cache hit rate detected', expect.any(Object))
      expect(logger.warn).toHaveBeenCalledWith('Large cache size detected', expect.any(Object))
    })

    it('should not warn when cache performance is good', () => {
      const mockStats = {
        hits: 80,
        misses: 20,
        hitRate: 80,
        size: 50
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(mockRolePermissionCache.getStats).toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should handle edge case of exactly 10 requests', () => {
      const mockStats = {
        hits: 5,
        misses: 5,
        hitRate: 50,
        size: 20
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(mockRolePermissionCache.getStats).toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should handle 50% hit rate without warning', () => {
      const mockStats = {
        hits: 50,
        misses: 50,
        hitRate: 50,
        size: 20
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should handle exactly 100 cache size without warning', () => {
      const mockStats = {
        hits: 60,
        misses: 40,
        hitRate: 60,
        size: 100
      }

      mockRolePermissionCache.getStats.mockReturnValue(mockStats)

      monitorCacheHealth()

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('cacheAdmin', () => {
    describe('getStats', () => {
      it('should return cache statistics', () => {
        const mockStats = { hits: 10, misses: 5, hitRate: 66.7, size: 3 }
        mockRolePermissionCache.getStats.mockReturnValue(mockStats)

        const result = cacheAdmin.getStats()

        // Test the business outcome, not the delegation
        expect(result).toEqual(mockStats)
      })
    })

    describe('clearCache', () => {
      it('should clear the cache without errors', () => {
        // Test that the function executes without throwing
        expect(() => cacheAdmin.clearCache()).not.toThrow()
      })
    })

    describe('invalidateRole', () => {
      it('should invalidate role without errors', () => {
        const roleId = 'role-123'

        // Test that the function executes without throwing
        expect(() => cacheAdmin.invalidateRole(roleId)).not.toThrow()
      })
    })

    describe('getCachedRoleIds', () => {
      it('should return cached role IDs', () => {
        const mockRoleIds = ['role-1', 'role-2', 'role-3']
        mockRolePermissionCache.getCachedRoleIds.mockReturnValue(mockRoleIds)

        const result = cacheAdmin.getCachedRoleIds()

        // Test the business outcome: returns the role IDs
        expect(result).toEqual(mockRoleIds)
      })
    })

    it('should provide all expected admin functions', () => {
      expect(cacheAdmin).toHaveProperty('getStats')
      expect(cacheAdmin).toHaveProperty('clearCache')
      expect(cacheAdmin).toHaveProperty('invalidateRole')
      expect(cacheAdmin).toHaveProperty('getCachedRoleIds')

      expect(typeof cacheAdmin.getStats).toBe('function')
      expect(typeof cacheAdmin.clearCache).toBe('function')
      expect(typeof cacheAdmin.invalidateRole).toBe('function')
      expect(typeof cacheAdmin.getCachedRoleIds).toBe('function')
    })
  })
})
