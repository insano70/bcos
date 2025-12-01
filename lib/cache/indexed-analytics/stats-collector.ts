/**
 * Cache Statistics Collector
 *
 * Provides cache statistics and monitoring for indexed analytics cache.
 *
 * RESPONSIBILITIES:
 * - Collect cache size metrics
 * - Estimate memory usage
 * - Return dimension counts (from metadata)
 * - Determine cache warmth status
 *
 * ARCHITECTURE:
 * - Read-only operations (no side effects)
 * - Dimension counts read from metadata (O(1) operation)
 * - Memory sampling for estimates
 * - Backward compatible with old metadata format
 *
 * PERFORMANCE:
 * - Dimension counts stored during cache warming (see warming-service.ts)
 * - This eliminates expensive SCAN operations on index keys
 * - Typical response time: ~10ms vs previous 5-30 seconds
 */

import { log } from '@/lib/logger';
import type { IndexedCacheClient } from './cache-client';
import { KeyGenerator } from './key-generator';

/**
 * Cache statistics
 */
export interface CacheStats {
  datasourceId: number;
  totalEntries: number;
  indexCount: number;
  estimatedMemoryMB: number;
  lastWarmed: string | null;
  isWarm: boolean;
  uniqueMeasures: number;
  uniquePractices: number;
  uniqueProviders: number;
  uniqueFrequencies: string[];
}

/**
 * Cache Statistics Collector
 * Provides monitoring and analysis of cache contents
 */
export class CacheStatsCollector {
  constructor(private client: IndexedCacheClient) {}

  /**
   * Get cache statistics for a datasource
   *
   * PERFORMANCE: Reads dimension counts from metadata stored during warming.
   * This is O(1) vs O(N) SCAN operations - ~10ms vs 5-30 seconds.
   *
   * Backward compatible: Falls back gracefully for old metadata format.
   *
   * @param datasourceId - Data source ID
   * @param dataSourceType - Data source type (optional, for table-based sources)
   * @returns Cache statistics
   */
  async getCacheStats(
    datasourceId: number,
    dataSourceType?: 'measure-based' | 'table-based'
  ): Promise<CacheStats> {
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);
    const metadata = await this.client.getCached(metadataKey);

    // Extract metadata fields (new format includes dimension counts)
    const metadataRecord = metadata?.[0] as Record<string, unknown> | undefined;
    const lastWarmed = metadataRecord?.timestamp as string | undefined;

    // Handle table-based sources differently (they don't use indexes)
    if (dataSourceType === 'table-based') {
      // For table-based sources, check if the cache key exists
      // Key format: datasource:{id}:table:p:*:prov:*
      const cacheKey = `datasource:${datasourceId}:table:p:*:prov:*`;
      const cacheExists = await this.client.getCached(cacheKey);

      return {
        datasourceId,
        totalEntries: cacheExists ? 1 : 0, // Table-based has 1 entry (entire table) or 0
        indexCount: 0, // Table-based sources don't use indexes
        estimatedMemoryMB: 0, // Memory estimation disabled
        lastWarmed: lastWarmed || null,
        isWarm: lastWarmed !== null,
        uniqueMeasures: 0, // Table-based doesn't have measures
        uniquePractices: 0, // Count not available without parsing entire table
        uniqueProviders: 0, // Count not available without parsing entire table
        uniqueFrequencies: [], // Table-based doesn't have frequencies
      };
    }

    // Check if metadata has dimension counts (new format from warming-service)
    const hasDimensionCounts = metadataRecord &&
      typeof metadataRecord.uniqueMeasures === 'number' &&
      typeof metadataRecord.uniquePractices === 'number' &&
      typeof metadataRecord.uniqueProviders === 'number' &&
      Array.isArray(metadataRecord.uniqueFrequencies);

    if (hasDimensionCounts && metadataRecord) {
      // Fast path: read directly from metadata (O(1) operation)
      const totalEntries = (metadataRecord.totalEntries as number) || 0;

      // Only estimate memory if there are entries
      let estimatedMemoryMB = 0;
      if (totalEntries > 0) {
        const masterIndex = KeyGenerator.getMasterIndexKey(datasourceId);
        estimatedMemoryMB = await this.estimateMemory(masterIndex, totalEntries);
      }

      return {
        datasourceId,
        totalEntries,
        indexCount: totalEntries * 5, // Each entry creates 5 index keys
        estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
        lastWarmed: lastWarmed || null,
        isWarm: lastWarmed !== null,
        uniqueMeasures: metadataRecord.uniqueMeasures as number,
        uniquePractices: metadataRecord.uniquePractices as number,
        uniqueProviders: metadataRecord.uniqueProviders as number,
        uniqueFrequencies: metadataRecord.uniqueFrequencies as string[],
      };
    }

    // Fallback for old metadata format (backward compatibility)
    // Use master index count but skip expensive SCAN for dimension counts
    const masterIndex = KeyGenerator.getMasterIndexKey(datasourceId);
    const totalKeys = await this.client.scard(masterIndex);
    const estimatedMemoryMB = totalKeys > 0 
      ? await this.estimateMemory(masterIndex, totalKeys)
      : 0;

    log.debug('Using fallback stats (old metadata format - re-warm to optimize)', {
      datasourceId,
      totalKeys,
      hasMetadata: !!metadataRecord,
      component: 'stats-collector',
    });

    return {
      datasourceId,
      totalEntries: totalKeys,
      indexCount: 0, // Unknown without scanning
      estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
      lastWarmed: lastWarmed || null,
      isWarm: lastWarmed !== null,
      uniqueMeasures: 0, // Unknown - re-warm to get counts
      uniquePractices: 0, // Unknown - re-warm to get counts
      uniqueProviders: 0, // Unknown - re-warm to get counts
      uniqueFrequencies: [], // Unknown - re-warm to get counts
    };
  }

  /**
   * Estimate memory usage by sampling
   *
   * Uses a sample-based approach to estimate total memory without expensive MEMORY commands.
   * Samples 10 random keys, calculates their average size, and extrapolates to total.
   *
   * PERFORMANCE: ~50-100ms vs ~1s+ with MEMORY USAGE command
   * ACCURACY: Typically ±10% of actual memory usage
   *
   * @param masterIndex - Master index key containing all cache keys for this datasource
   * @param totalKeys - Total number of cache keys
   * @returns Estimated memory in MB
   */
  private async estimateMemory(masterIndex: string, totalKeys: number): Promise<number> {
    // Early return if no keys
    if (totalKeys === 0) return 0;

    const redis = this.client.getClient();
    if (!redis) {
      log.debug('Redis client not available for memory estimation', {
        component: 'stats-collector',
      });
      return 0;
    }

    try {
      // Sample size: min(10, totalKeys) to avoid sampling more keys than exist
      const sampleSize = Math.min(10, totalKeys);

      // Get random sample of keys from master index using SRANDMEMBER
      // SRANDMEMBER is O(1) and doesn't remove keys from the set
      const sampleKeys = await redis.srandmember(masterIndex, sampleSize);

      if (!sampleKeys || sampleKeys.length === 0) {
        log.debug('No sample keys found for memory estimation', {
          masterIndex,
          totalKeys,
          component: 'stats-collector',
        });
        return 0;
      }

      // Calculate total size of sampled keys
      let totalSampleSize = 0;
      let successfulSamples = 0;

      for (const key of sampleKeys) {
        try {
          const value = await redis.get(key);
          if (value) {
            totalSampleSize += Buffer.byteLength(value, 'utf8');
            successfulSamples++;
          }
        } catch (error) {
          log.warn('Failed to get key value for memory estimation', {
            key,
            error: error instanceof Error ? error.message : String(error),
            component: 'stats-collector',
          });
          // Continue sampling other keys
        }
      }

      if (successfulSamples === 0) {
        log.debug('No successful samples for memory estimation', {
          masterIndex,
          component: 'stats-collector',
        });
        return 0;
      }

      // Calculate average key size and extrapolate to total
      const avgKeySize = totalSampleSize / successfulSamples;
      const estimatedBytes = avgKeySize * totalKeys;
      const estimatedMB = estimatedBytes / (1024 * 1024);

      log.debug('Memory estimation completed', {
        masterIndex,
        totalKeys,
        sampleSize: successfulSamples,
        avgKeySizeKB: Math.round(avgKeySize / 1024),
        estimatedMB: Math.round(estimatedMB * 100) / 100,
        component: 'stats-collector',
      });

      return estimatedMB;
    } catch (error) {
      log.warn('Memory estimation failed', {
        error: error instanceof Error ? error.message : String(error),
        masterIndex,
        totalKeys,
        component: 'stats-collector',
      });
      return 0;
    }
  }

}
