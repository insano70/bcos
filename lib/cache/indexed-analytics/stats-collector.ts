/**
 * Cache Statistics Collector
 *
 * Provides cache statistics and monitoring for indexed analytics cache.
 *
 * RESPONSIBILITIES:
 * - Collect cache size metrics
 * - Estimate memory usage
 * - Extract unique dimension counts
 * - Determine cache warmth status
 *
 * ARCHITECTURE:
 * - Read-only operations (no side effects)
 * - Scans index keys for metadata
 * - Memory sampling for estimates
 * - Parses keys to extract dimensions
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
  private readonly SCAN_COUNT = 1000;
  private readonly MAX_SCAN_ITERATIONS = 10000;

  constructor(private client: IndexedCacheClient) {}

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
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);
    const metadata = await this.client.getCached(metadataKey);

    // Extract last warmed timestamp from metadata
    const lastWarmed = metadata?.[0] ? (metadata[0].timestamp as string) : null;

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

    // For measure-based sources, use index-based counting
    const masterIndex = KeyGenerator.getMasterIndexKey(datasourceId);
    const totalKeys = await this.client.scard(masterIndex);

    // Sample memory usage
    const estimatedMemoryMB = await this.estimateMemory(masterIndex, totalKeys);

    // Collect unique values from index keys
    const uniqueCounts = await this.parseIndexKeys(datasourceId);

    return {
      datasourceId,
      totalEntries: totalKeys,
      indexCount: uniqueCounts.indexCount,
      estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
      lastWarmed: lastWarmed || null,
      isWarm: lastWarmed !== null,
      uniqueMeasures: uniqueCounts.measures.size,
      uniquePractices: uniqueCounts.practices.size,
      uniqueProviders: uniqueCounts.providers.size,
      uniqueFrequencies: Array.from(uniqueCounts.frequencies).sort(),
    };
  }

  /**
   * Estimate memory usage by sampling
   *
   * NOTE: Memory estimation is disabled because Redis MEMORY command is not universally
   * supported. This method now always returns 0 to prevent performance degradation.
   *
   * Previously, this method would sample a random cache entry and multiply its size
   * by total key count. However, memoryUsage() calls were causing ~1 second timeouts
   * per call, leading to 10x performance regression in dashboard loading.
   *
   * See: Performance regression investigation 2025-10-19
   *
   * @param masterIndex - Master index key (unused)
   * @param totalKeys - Total number of keys (unused)
   * @returns Always returns 0 (memory estimation disabled)
   */
  private async estimateMemory(_masterIndex: string, _totalKeys: number): Promise<number> {
    // DISABLED: Memory estimation removed to prevent performance regression
    // Redis MEMORY command not universally supported, causes ~1s timeout per call
    return 0;
  }

  /**
   * Parse index keys to extract unique counts
   *
   * @param datasourceId - Data source ID
   * @returns Unique dimension counts and index count
   */
  private async parseIndexKeys(datasourceId: number): Promise<{
    indexCount: number;
    measures: Set<string>;
    practices: Set<number>;
    providers: Set<number>;
    frequencies: Set<string>;
  }> {
    const measures = new Set<string>();
    const practices = new Set<number>();
    const providers = new Set<number>();
    const frequencies = new Set<string>();

    const indexPattern = KeyGenerator.getIndexPattern(datasourceId);
    let indexCount = 0;
    let iterations = 0;

    try {
      // Loop until no more keys or max iterations reached
      // Exit conditions: keys.length === 0, keys.length < SCAN_COUNT, or iterations >= MAX
      while (true) {
        if (iterations++ >= this.MAX_SCAN_ITERATIONS) {
          log.error('SCAN operation exceeded max iterations - Redis may be unhealthy', {
            datasourceId,
            pattern: indexPattern,
            iterations,
            component: 'stats-collector',
          });
          break;
        }

        const keys = await this.client.scanKeys(indexPattern, this.SCAN_COUNT);
        if (keys.length === 0) {
          break;
        }

        indexCount += keys.length;

        // Parse keys to extract unique values
        for (const key of keys) {
          const parsed = KeyGenerator.parseIndexKey(key);
          if (!parsed) {
            continue;
          }

          // Skip the master index key
          if (key.endsWith(':master')) {
            continue;
          }

          // Extract dimensions
          if (parsed.measure && parsed.measure !== '*') {
            measures.add(parsed.measure);
          }

          if (parsed.practiceUid !== undefined) {
            practices.add(parsed.practiceUid);
          }

          if (parsed.providerUid !== undefined) {
            providers.add(parsed.providerUid);
          }

          if (parsed.frequency && parsed.frequency !== '*') {
            frequencies.add(parsed.frequency);
          }
        }

        // Partial batch indicates we've exhausted all results
        if (keys.length < this.SCAN_COUNT) {
          break;
        }
      }
    } catch (error) {
      log.error(
        'Failed to parse index keys',
        error instanceof Error ? error : new Error(String(error)),
        {
          datasourceId,
          pattern: indexPattern,
          component: 'stats-collector',
        }
      );
    }

    return {
      indexCount,
      measures,
      practices,
      providers,
      frequencies,
    };
  }
}
