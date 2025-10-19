/**
 * Cache Query Service
 *
 * Handles index-based queries for efficient cache lookups.
 *
 * RESPONSIBILITIES:
 * - Build index set queries from filters
 * - Execute SINTERSTORE/SUNIONSTORE operations
 * - Fetch matching cache entries
 * - Temporary key management and cleanup
 *
 * ARCHITECTURE:
 * - O(1) index lookups using Redis set operations
 * - Handles single and multiple filter values
 * - Automatic temp key cleanup
 * - Batch fetching for large result sets
 */

import { log } from '@/lib/logger';
import type { IndexedCacheClient } from './cache-client';
import { KeyGenerator } from './key-generator';

/**
 * Cache query filters
 */
export interface CacheQueryFilters {
  datasourceId: number;
  measure: string;
  frequency: string;
  practiceUids?: number[]; // Organization/RBAC filters
  providerUids?: number[]; // Provider filters
}

/**
 * Cache entry structure (returned from queries)
 */
export interface CacheEntry {
  datasourceId: number;
  measure: string;
  practiceUid: number;
  providerUid: number | null;
  frequency: string;
  dateIndex: string;
  measureValue: number;
  measureType?: string;
  [key: string]: unknown; // Allow additional dynamic columns
}

/**
 * Cache Query Service
 * Executes index-based queries for efficient data retrieval
 */
export class CacheQueryService {
  private readonly TEMP_KEY_TTL = 10; // Seconds

  constructor(private client: IndexedCacheClient) {}

  /**
   * Query cache with filters
   * Uses secondary indexes for O(1) lookup
   *
   * @param filters - Query filters
   * @returns Array of cache entries
   */
  async query(filters: CacheQueryFilters): Promise<CacheEntry[]> {
    const { datasourceId, measure, frequency, practiceUids, providerUids } = filters;
    const startTime = Date.now();

    // Build list of index sets to intersect
    const indexSets: string[] = [];
    const tempKeys: string[] = []; // Track temp keys for cleanup

    // Base index (required)
    const baseIndex = KeyGenerator.getBaseIndexKey(datasourceId, measure, frequency);
    indexSets.push(baseIndex);

    // Handle practice filter (organization/RBAC)
    if (practiceUids && practiceUids.length > 0) {
      const practiceIndexKey = await this.buildPracticeIndexSet(
        datasourceId,
        measure,
        frequency,
        practiceUids,
        tempKeys
      );
      if (practiceIndexKey) {
        indexSets.push(practiceIndexKey);
      }
    }

    // Handle provider filter
    if (providerUids && providerUids.length > 0) {
      const providerIndexKey = await this.buildProviderIndexSet(
        datasourceId,
        measure,
        frequency,
        providerUids,
        tempKeys
      );
      if (providerIndexKey) {
        indexSets.push(providerIndexKey);
      }
    }

    // Get matching keys
    const matchingKeys = await this.executeIntersection(datasourceId, indexSets, tempKeys);

    const indexLookupDuration = Date.now() - startTime;

    log.info('Index lookup completed', {
      datasourceId,
      measure,
      frequency,
      practiceCount: practiceUids?.length || 0,
      providerCount: providerUids?.length || 0,
      matchingKeys: matchingKeys.length,
      indexLookupDuration,
      component: 'query-service',
    });

    if (matchingKeys.length === 0) {
      // Cleanup temp keys
      this.cleanupTempKeys(tempKeys);
      return [];
    }

    // Fetch data
    const results = await this.fetchCacheEntries(matchingKeys);

    const totalDuration = Date.now() - startTime;
    const fetchDuration = totalDuration - indexLookupDuration;

    log.info('Cache query completed', {
      datasourceId,
      measure,
      frequency,
      matchingKeys: matchingKeys.length,
      rowsReturned: results.length,
      indexLookupDuration,
      fetchDuration,
      totalDuration,
      component: 'query-service',
    });

    // Cleanup temp keys (fire and forget)
    this.cleanupTempKeys(tempKeys);

    return results;
  }

  /**
   * Build practice index set (handles single or multiple practices)
   *
   * @param datasourceId - Data source ID
   * @param measure - Measure name
   * @param frequency - Time frequency
   * @param practiceUids - Practice UIDs to filter
   * @param tempKeys - Array to track temp keys for cleanup
   * @returns Index key (direct or temp union key)
   */
  private async buildPracticeIndexSet(
    datasourceId: number,
    measure: string,
    frequency: string,
    practiceUids: number[],
    tempKeys: string[]
  ): Promise<string | null> {
    if (practiceUids.length === 1) {
      // Single practice - direct index
      const practiceUid = practiceUids[0];
      if (practiceUid === undefined) {
        return null;
      }
      return KeyGenerator.getPracticeIndexKey(datasourceId, measure, practiceUid, frequency);
    }

    // Multiple practices - union them first
    const tempUnionKey = KeyGenerator.getTempKey(datasourceId, 'union');
    tempKeys.push(tempUnionKey);

    const practiceIndexes = practiceUids.map((puid) =>
      KeyGenerator.getPracticeIndexKey(datasourceId, measure, puid, frequency)
    );

    await this.client.sunionstore(tempUnionKey, ...practiceIndexes);
    await this.client.expire(tempUnionKey, this.TEMP_KEY_TTL);

    return tempUnionKey;
  }

  /**
   * Build provider index set (handles single or multiple providers)
   *
   * @param datasourceId - Data source ID
   * @param measure - Measure name
   * @param frequency - Time frequency
   * @param providerUids - Provider UIDs to filter
   * @param tempKeys - Array to track temp keys for cleanup
   * @returns Index key (direct or temp union key)
   */
  private async buildProviderIndexSet(
    datasourceId: number,
    measure: string,
    frequency: string,
    providerUids: number[],
    tempKeys: string[]
  ): Promise<string | null> {
    if (providerUids.length === 1) {
      // Single provider - direct index
      const providerUid = providerUids[0];
      if (providerUid === undefined) {
        return null;
      }
      return KeyGenerator.getProviderIndexKey(datasourceId, measure, frequency, providerUid);
    }

    // Multiple providers - union them first
    const tempUnionKey = KeyGenerator.getTempKey(datasourceId, 'union');
    tempKeys.push(tempUnionKey);

    const providerIndexes = providerUids.map((provuid) =>
      KeyGenerator.getProviderIndexKey(datasourceId, measure, frequency, provuid)
    );

    await this.client.sunionstore(tempUnionKey, ...providerIndexes);
    await this.client.expire(tempUnionKey, this.TEMP_KEY_TTL);

    return tempUnionKey;
  }

  /**
   * Execute intersection of index sets to get matching cache keys
   *
   * @param datasourceId - Data source ID
   * @param indexSets - Array of index set keys
   * @param tempKeys - Array to track temp keys for cleanup
   * @returns Array of matching cache keys
   */
  private async executeIntersection(
    datasourceId: number,
    indexSets: string[],
    tempKeys: string[]
  ): Promise<string[]> {
    if (indexSets.length === 0) {
      return [];
    }

    if (indexSets.length === 1) {
      const firstIndex = indexSets[0];
      if (!firstIndex) {
        return [];
      }
      return this.client.smembers(firstIndex);
    }

    // Intersect all filter sets
    const tempResultKey = KeyGenerator.getTempKey(datasourceId, 'result');
    tempKeys.push(tempResultKey);

    await this.client.sinterstore(tempResultKey, ...indexSets);
    const matchingKeys = await this.client.smembers(tempResultKey);

    return matchingKeys;
  }

  /**
   * Fetch cache entries for matching keys
   * Handles large result sets by batching MGET operations
   *
   * @param keys - Array of cache keys
   * @returns Array of cache entries
   */
  private async fetchCacheEntries(keys: string[]): Promise<CacheEntry[]> {
    if (keys.length === 0) {
      return [];
    }

    const results: CacheEntry[] = [];
    const dataArrays = await this.client.mget(keys);

    for (const rows of dataArrays) {
      results.push(...(rows as CacheEntry[]));
    }

    return results;
  }

  /**
   * Cleanup temporary keys (fire and forget)
   *
   * @param tempKeys - Array of temp keys to delete
   */
  private cleanupTempKeys(tempKeys: string[]): void {
    if (tempKeys.length === 0) {
      return;
    }

    // Fire and forget cleanup
    this.client.deleteMany(tempKeys).catch((error) => {
      log.warn('Failed to cleanup temp keys', {
        tempKeys,
        error: error instanceof Error ? error.message : String(error),
        component: 'query-service',
      });
    });
  }
}
