/**
 * Chart Execution Config Cache Service
 *
 * Redis-based caching of built chart execution configurations.
 * Provides cross-request caching with appropriate TTL.
 *
 * Single Responsibility:
 * - Cache key generation
 * - Cache storage and retrieval (Redis)
 * - Cache invalidation
 *
 * KEY NAMING:
 *   chartexec:{chartId}:{filterHash}
 *
 * TTL: 24 hours (ANALYTICS_TTL.CHART_CONFIG)
 */

import { createHash } from 'node:crypto';
import { log } from '@/lib/logger';
import { CacheService } from '@/lib/cache/base';
import { ANALYTICS_TTL } from '@/lib/constants/cache-ttl';
import type { ChartExecutionConfig, ResolvedFilters } from './types';

/**
 * Chart Execution Config Cache Service
 *
 * Redis-backed cache for built chart configurations.
 * Extends CacheService for consistent Redis operations.
 */
class ChartExecutionConfigCacheService extends CacheService<ChartExecutionConfig> {
  protected namespace = 'chartexec';
  protected defaultTTL = ANALYTICS_TTL.CHART_CONFIG; // 24 hours

  /**
   * Build deterministic cache key from chart ID and filters
   *
   * Cache key format: chartexec:{chartId}:{filterHash}
   * Filter hash is MD5 of sorted filter components (first 16 chars)
   *
   * @param chartId - Chart definition ID
   * @param filters - Resolved universal filters
   * @returns Cache key string
   */
  buildCacheKey(chartId: string, filters: ResolvedFilters): string {
    // Include only filter properties that affect config building
    const filterComponents = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      dateRangePreset: filters.dateRangePreset,
      organizationId: filters.organizationId,
      practiceUids: filters.practiceUids?.sort(), // Sort for consistency
      providerName: filters.providerName,
    };

    const filterHash = createHash('md5')
      .update(JSON.stringify(filterComponents))
      .digest('hex')
      .substring(0, 16);

    return this.buildKey(chartId, filterHash);
  }

  /**
   * Get config from cache
   *
   * @param cacheKey - Cache key from buildCacheKey()
   * @returns Cached config or null if not found
   */
  async getConfig(cacheKey: string): Promise<ChartExecutionConfig | null> {
    const cached = await this.get<ChartExecutionConfig>(cacheKey);

    if (cached) {
      log.debug('Chart execution config cache hit', {
        cacheKey,
        component: 'chart-exec-cache',
      });
    }

    return cached;
  }

  /**
   * Store config in cache
   *
   * @param cacheKey - Cache key from buildCacheKey()
   * @param config - Chart execution config to cache
   */
  async setConfig(cacheKey: string, config: ChartExecutionConfig): Promise<void> {
    const success = await this.set(cacheKey, config);

    if (success) {
      log.debug('Chart execution config cached', {
        cacheKey,
        chartId: config.chartId,
        chartName: config.chartName,
        component: 'chart-exec-cache',
      });
    }
  }

  /**
   * Invalidate cache entries
   *
   * If chartId provided, invalidates all cache entries for that chart.
   * If chartId not provided, clears all chart execution configs.
   *
   * @param chartId - Optional chart ID to invalidate (or all if omitted)
   */
  async invalidate(chartId?: string): Promise<void> {
    if (chartId) {
      // Invalidate specific chart (all filter combinations)
      const pattern = this.buildKey(chartId, '*');
      const deletedCount = await this.delPattern(pattern);

      log.info('Chart execution config cache invalidated', {
        chartId,
        deletedCount,
        component: 'chart-exec-cache',
      });
    } else {
      // Clear all chart execution configs
      const pattern = this.buildKey('*');
      const deletedCount = await this.delPattern(pattern);

      log.info('All chart execution configs invalidated', {
        deletedCount,
        component: 'chart-exec-cache',
      });
    }
  }
}

// Export singleton instance for cross-request caching
export const chartExecutionConfigCache = new ChartExecutionConfigCacheService();

// Re-export types for backward compatibility
export type { ChartExecutionConfig };
