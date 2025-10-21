/**
 * Cache Invalidation Service
 *
 * Handles selective cache cleanup and invalidation.
 *
 * RESPONSIBILITIES:
 * - Invalidate cache entries for a datasource
 * - Cleanup index keys
 * - Cleanup metadata
 * - Batch deletion for efficiency
 *
 * ARCHITECTURE:
 * - Uses master index for efficient invalidation
 * - Batch deletion to avoid overwhelming Redis
 * - Pattern-based scanning for index cleanup
 * - Graceful error handling
 */

import { log } from '@/lib/logger';
import type { IndexedCacheClient } from './cache-client';
import { KeyGenerator } from './key-generator';

/**
 * Cache Invalidation Service
 * Handles cache cleanup operations
 */
export class CacheInvalidationService {
  private readonly BATCH_SIZE = 1000;
  private readonly SCAN_COUNT = 1000;

  constructor(private client: IndexedCacheClient) {}

  /**
   * Invalidate cache for a datasource
   * Uses master index for efficient cleanup
   *
   * @param datasourceId - Data source ID to invalidate
   */
  async invalidate(datasourceId: number): Promise<void> {
    log.info('Starting cache invalidation', {
      datasourceId,
      component: 'invalidation-service',
    });
    const startTime = Date.now();

    // Use master index to find all keys
    const masterIndex = KeyGenerator.getMasterIndexKey(datasourceId);
    const allCacheKeys = await this.client.smembers(masterIndex);

    if (allCacheKeys.length === 0) {
      log.info('No cache keys to invalidate', {
        datasourceId,
        component: 'invalidation-service',
      });
      return;
    }

    log.info('Invalidating cache entries', {
      datasourceId,
      keysToDelete: allCacheKeys.length,
      component: 'invalidation-service',
    });

    // Delete all cache keys in batches
    await this.deleteCacheKeys(allCacheKeys, datasourceId);

    // Delete all index keys
    const indexKeysDeleted = await this.cleanupIndexes(datasourceId);

    // Delete metadata
    await this.cleanupMetadata(datasourceId);

    const duration = Date.now() - startTime;

    log.info('Cache invalidation completed', {
      datasourceId,
      cacheKeysDeleted: allCacheKeys.length,
      indexKeysDeleted,
      duration,
      component: 'invalidation-service',
    });
  }

  /**
   * Delete cache keys in batches
   *
   * @param keys - Array of cache keys to delete
   * @param datasourceId - Data source ID (for logging)
   */
  private async deleteCacheKeys(keys: string[], datasourceId: number): Promise<void> {
    for (let i = 0; i < keys.length; i += this.BATCH_SIZE) {
      const batch = keys.slice(i, i + this.BATCH_SIZE);
      await this.client.deleteMany(batch);

      log.debug('Cache key deletion progress', {
        datasourceId,
        deleted: Math.min(i + this.BATCH_SIZE, keys.length),
        total: keys.length,
        progress: Math.round((Math.min(i + this.BATCH_SIZE, keys.length) / keys.length) * 100),
        component: 'invalidation-service',
      });
    }
  }

  /**
   * Cleanup all index keys for a datasource
   *
   * @param datasourceId - Data source ID
   * @returns Number of index keys deleted
   */
  private async cleanupIndexes(datasourceId: number): Promise<number> {
    const redis = this.client.getClient();
    if (!redis) {
      return 0;
    }

    const indexPattern = KeyGenerator.getIndexPattern(datasourceId);
    const indexKeys: string[] = [];

    try {
      // Use SCAN with cursor properly (like flush-redis.mjs)
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', indexPattern, 'COUNT', this.SCAN_COUNT);
        cursor = result[0];
        indexKeys.push(...result[1]);
      } while (cursor !== '0');

      log.info('Index keys scanned for deletion', {
        datasourceId,
        pattern: indexPattern,
        keysFound: indexKeys.length,
        component: 'invalidation-service',
      });
    } catch (error) {
      log.error(
        'Failed to scan index keys',
        error instanceof Error ? error : new Error(String(error)),
        {
          datasourceId,
          pattern: indexPattern,
          component: 'invalidation-service',
        }
      );
      return 0;
    }

    if (indexKeys.length > 0) {
      await this.client.deleteMany(indexKeys);
    }

    return indexKeys.length;
  }

  /**
   * Cleanup metadata for a datasource
   *
   * @param datasourceId - Data source ID
   */
  private async cleanupMetadata(datasourceId: number): Promise<void> {
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);
    await this.client.deleteKey(metadataKey);

    log.debug('Cache metadata deleted', {
      datasourceId,
      metadataKey,
      component: 'invalidation-service',
    });
  }
}
