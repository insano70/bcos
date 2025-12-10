/**
 * Indexed Analytics Cache
 *
 * Orchestrator facade for indexed analytics cache operations.
 * Delegates to specialized services following the single responsibility principle.
 *
 * ARCHITECTURE:
 * - Thin facade - delegates to specialized services
 * - Maintains existing API contract (zero breaking changes)
 * - Service composition pattern
 * - Matches data-source-cache orchestrator pattern
 *
 * RESPONSIBILITIES:
 * - Public API for cache operations
 * - Service coordination
 * - Type exports
 */

import { cacheClient, type IndexedCacheClient } from './cache-client';
import { CacheInvalidationService } from './invalidation-service';
import { CacheQueryService, type CacheQueryFilters, type CacheEntry } from './query-service';
import { CacheStatsCollector, type CacheStats } from './stats-collector';
import { CacheWarmingService, type WarmResult, type ProgressCallback } from './warming-service';

// Re-export types for external use
export type { CacheEntry, CacheQueryFilters, CacheStats, WarmResult, ProgressCallback };
export { KeyGenerator } from './key-generator';
import { KeyGenerator } from './key-generator';

/**
 * Indexed Analytics Cache Service
 *
 * Main orchestrator for indexed cache operations.
 * Delegates to specialized services for each responsibility.
 */
export class IndexedAnalyticsCache {
  private client: IndexedCacheClient;
  private warmingService: CacheWarmingService;
  private queryService: CacheQueryService;
  private invalidationService: CacheInvalidationService;
  private statsCollector: CacheStatsCollector;

  constructor() {
    // Use singleton client instance
    this.client = cacheClient;

    // Initialize services with shared client
    this.warmingService = new CacheWarmingService(this.client);
    this.queryService = new CacheQueryService(this.client);
    this.invalidationService = new CacheInvalidationService(this.client);
    this.statsCollector = new CacheStatsCollector(this.client);
  }

  /**
   * Warm cache from database
   * Fetches ALL data and groups by unique combinations
   *
   * @param datasourceId - Data source ID to warm
   * @returns Warming result
   */
  async warmCache(datasourceId: number): Promise<WarmResult> {
    return this.warmingService.warmCache(datasourceId);
  }

  /**
   * Warm cache concurrently using shadow keys (zero-downtime)
   * Currently delegates to warmCache (shadow key strategy for future)
   *
   * @param datasourceId - Data source ID to warm
   * @param onProgress - Progress callback (optional)
   * @returns Warming result
   */
  async warmCacheConcurrent(
    datasourceId: number,
    onProgress?: ProgressCallback
  ): Promise<WarmResult> {
    return this.warmingService.warmCacheConcurrent(datasourceId, onProgress);
  }

  /**
   * Query cache with filters
   * Uses secondary indexes for O(1) lookup
   *
   * @param filters - Query filters
   * @returns Array of cache entries
   */
  async query(filters: CacheQueryFilters): Promise<CacheEntry[]> {
    return this.queryService.query(filters);
  }

  /**
   * Batch query for multiple measures from same data source
   * Executes queries in parallel for better performance
   *
   * @param batchFilters - Array of query filters (must share datasourceId and frequency)
   * @returns Map of measure to cache entries
   */
  async batchQuery(
    batchFilters: CacheQueryFilters[]
  ): Promise<Map<string, CacheEntry[]>> {
    return this.queryService.batchQuery(batchFilters);
  }

  /**
   * Check if cache is warm for a datasource
   *
   * Simple check that reads the metadata key to see if cache has been warmed.
   * PERFORMANCE: This is a single Redis GET operation - do NOT use getCacheStats() here
   * as it does expensive SCAN operations.
   *
   * @param datasourceId - Data source ID
   * @returns True if cache is warm, false otherwise
   */
  async isCacheWarm(datasourceId: number): Promise<boolean> {
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);
    const metadata = await this.client.getCached(metadataKey);
    return metadata !== null && metadata.length > 0;
  }

  /**
   * Get last warmed timestamp for a datasource
   *
   * Lightweight method to check cache age without expensive SCAN operations.
   * PERFORMANCE: Single Redis GET - use this instead of getCacheStats() when you only need the timestamp.
   *
   * @param datasourceId - Data source ID
   * @returns ISO timestamp string or null if never warmed
   */
  async getLastWarmedTime(datasourceId: number): Promise<string | null> {
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);
    const metadata = await this.client.getCached(metadataKey);

    if (!metadata || metadata.length === 0) {
      return null;
    }

    return (metadata[0]?.timestamp as string) || null;
  }

  /**
   * Invalidate cache for a datasource
   * Uses master index for efficient cleanup
   *
   * @param datasourceId - Data source ID to invalidate
   */
  async invalidate(datasourceId: number): Promise<void> {
    return this.invalidationService.invalidate(datasourceId);
  }

  /**
   * Get cache statistics for a datasource
   *
   * @param datasourceId - Data source ID
   * @param dataSourceType - Data source type (optional, for table-based sources)
   * @returns Cache statistics
   */
  async getCacheStats(
    datasourceId: number,
    dataSourceType?: 'measure-based' | 'table-based'
  ): Promise<CacheStats> {
    return this.statsCollector.getCacheStats(datasourceId, dataSourceType);
  }
}

// Export singleton instance (maintains existing API)
export const indexedAnalyticsCache = new IndexedAnalyticsCache();
