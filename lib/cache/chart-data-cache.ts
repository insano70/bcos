/**
 * Chart Data Cache Service
 *
 * Redis-backed caching for chart data responses.
 * Part of Phase 6: Unified Caching Strategy
 *
 * Features:
 * - Get/Set/Delete operations with TTL
 * - Pattern-based invalidation
 * - Data source-based invalidation
 * - Graceful error handling (cache failures don't break charts)
 * - Comprehensive logging
 */

import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';
import type { ChartData } from '@/lib/types/analytics';

/**
 * Cached chart data response structure
 */
export interface CachedChartDataResponse {
  chartData: ChartData;
  rawData: Record<string, unknown>[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    queryTimeMs: number;
    recordCount: number;
    cachedAt: string;
  };
}

/**
 * Chart Data Cache Service
 *
 * Provides Redis-backed caching for chart data with automatic TTL and
 * pattern-based invalidation support.
 */
export class ChartDataCache {
  private readonly DEFAULT_TTL = 300; // 5 minutes in seconds
  private readonly KEY_PREFIX = 'chart:data:';

  /**
   * Get cached chart data by key
   *
   * @param key - Cache key
   * @returns Cached data or null if not found/error
   */
  async get(key: string): Promise<CachedChartDataResponse | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping cache get', { key });
        return null;
      }

      const fullKey = this.KEY_PREFIX + key;
      const cached = await redis.get(fullKey);

      if (!cached) {
        log.debug('Cache miss', { key });
        return null;
      }

      const data = JSON.parse(cached) as CachedChartDataResponse;
      log.info('Cache hit', {
        key,
        chartType: data.metadata.chartType,
        cachedAt: data.metadata.cachedAt,
        recordCount: data.metadata.recordCount,
      });

      return data;
    } catch (error) {
      log.error('Cache get failed', error, { key });
      // Graceful degradation - return null on error
      return null;
    }
  }

  /**
   * Set chart data in cache with TTL
   *
   * @param key - Cache key
   * @param data - Chart data to cache
   * @param ttl - Time to live in seconds (default: 5 minutes)
   */
  async set(
    key: string,
    data: CachedChartDataResponse,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping cache set', { key });
        return;
      }

      const fullKey = this.KEY_PREFIX + key;
      const value = JSON.stringify({
        ...data,
        metadata: {
          ...data.metadata,
          cachedAt: new Date().toISOString(),
        },
      });

      await redis.setex(fullKey, ttl, value);

      log.info('Cache set', {
        key,
        chartType: data.metadata.chartType,
        ttl,
        recordCount: data.metadata.recordCount,
      });
    } catch (error) {
      log.error('Cache set failed', error, { key, ttl });
      // Graceful degradation - don't throw on cache errors
    }
  }

  /**
   * Invalidate cache by pattern
   *
   * @param pattern - Pattern to match (e.g., "bar:*" for all bar charts)
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping cache invalidation', { pattern });
        return;
      }

      const fullPattern = this.KEY_PREFIX + pattern;
      const keys = await redis.keys(fullPattern);

      if (keys.length === 0) {
        log.debug('No keys found for invalidation pattern', { pattern });
        return;
      }

      await redis.del(...keys);

      log.info('Cache invalidated by pattern', {
        pattern,
        keysDeleted: keys.length,
      });
    } catch (error) {
      log.error('Cache invalidation failed', error, { pattern });
      // Graceful degradation - don't throw
    }
  }

  /**
   * Invalidate all cached charts for a specific data source
   *
   * @param dataSourceId - Data source ID
   */
  async invalidateByDataSource(dataSourceId: number): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping data source cache invalidation', {
          dataSourceId,
        });
        return;
      }

      // Pattern matches all charts using this data source
      // Format: chart:data:{chartType}:{dataSourceId}:*
      const patterns = [
        `${this.KEY_PREFIX}*:${dataSourceId}:*`, // Matches all chart types
      ];

      let totalDeleted = 0;

      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
          totalDeleted += keys.length;
        }
      }

      log.info('Cache invalidated by data source', {
        dataSourceId,
        keysDeleted: totalDeleted,
      });
    } catch (error) {
      log.error('Data source cache invalidation failed', error, { dataSourceId });
      // Graceful degradation - don't throw
    }
  }

  /**
   * Clear all chart data cache
   * Use with caution - primarily for testing/maintenance
   */
  async clearAll(): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping cache clear');
        return;
      }

      const keys = await redis.keys(this.KEY_PREFIX + '*');

      if (keys.length === 0) {
        log.debug('No chart cache keys to clear');
        return;
      }

      await redis.del(...keys);

      log.warn('All chart data cache cleared', {
        keysDeleted: keys.length,
      });
    } catch (error) {
      log.error('Cache clear all failed', error);
      // Graceful degradation - don't throw
    }
  }

  /**
   * Get cache statistics
   * Useful for monitoring and debugging
   */
  async getStats(): Promise<{
    totalKeys: number;
    keysByType: Record<string, number>;
  }> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return { totalKeys: 0, keysByType: {} };
      }

      const keys = await redis.keys(this.KEY_PREFIX + '*');
      const keysByType: Record<string, number> = {};

      for (const key of keys) {
        // Extract chart type from key format: chart:data:{chartType}:{dataSourceId}:{hash}
        const parts = key.replace(this.KEY_PREFIX, '').split(':');
        const chartType = parts[0] || 'unknown';
        keysByType[chartType] = (keysByType[chartType] || 0) + 1;
      }

      return {
        totalKeys: keys.length,
        keysByType,
      };
    } catch (error) {
      log.error('Failed to get cache stats', error);
      return { totalKeys: 0, keysByType: {} };
    }
  }
}

// Export singleton instance
export const chartDataCache = new ChartDataCache();

