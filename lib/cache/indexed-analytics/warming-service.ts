/**
 * Cache Warming Service
 *
 * Handles cache population from database with distributed locking and batching.
 *
 * RESPONSIBILITIES:
 * - Fetch all data from analytics database
 * - Group data by unique cache key combinations
 * - Write to Redis with indexes using pipelines
 * - Distributed locking to prevent concurrent warming
 * - Progress tracking for UI feedback
 *
 * ARCHITECTURE:
 * - Uses cache-client for all Redis operations
 * - Uses key-generator for consistent key construction
 * - Batched pipeline operations for performance
 * - Error recovery with lock cleanup
 */

import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { columnMappingService } from '@/lib/services/column-mapping-service';
import type { IndexedCacheClient } from './cache-client';
import { KeyGenerator, type CacheKeyEntry } from './key-generator';

/**
 * Cache warming result
 */
export interface WarmResult {
  entriesCached: number;
  totalRows: number;
  duration: number;
  skipped?: boolean;
}

/**
 * Progress callback for warming operations
 */
export type ProgressCallback = (progress: {
  rowsProcessed: number;
  totalRows: number;
  percent: number;
}) => void;

/**
 * Cache Warming Service
 * Orchestrates cache population with locking and batching
 */
export class CacheWarmingService {
  private readonly LOCK_TTL_SECONDS = 300; // 5 minutes

  constructor(private client: IndexedCacheClient) {}

  /**
   * Warm cache for a datasource
   * Fetches ALL data and groups by unique combinations
   *
   * @param datasourceId - Data source ID to warm
   * @returns Warming result
   */
  async warmCache(datasourceId: number): Promise<WarmResult> {
    const startTime = Date.now();

    log.info('Starting cache warming', {
      datasourceId,
      component: 'warming-service',
    });

    // Acquire distributed lock
    const lockKey = KeyGenerator.getLockKey(datasourceId);
    const acquired = await this.client.acquireLock(lockKey, this.LOCK_TTL_SECONDS);

    if (!acquired) {
      log.info('Cache warming already in progress, skipping', {
        datasourceId,
        lockKey,
        component: 'warming-service',
      });
      return {
        entriesCached: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        skipped: true,
      };
    }

    try {
      // Get data source config
      const config = await chartConfigService.getDataSourceConfigById(datasourceId);
      if (!config) {
        throw new Error(`Data source not found: ${datasourceId}`);
      }

      const { tableName, schemaName } = config;

      // Security: Validate schema name (whitelist approach)
      // Table names are validated by being pulled from configured data sources in the database
      const ALLOWED_SCHEMAS = ['ih'];
      if (!ALLOWED_SCHEMAS.includes(schemaName)) {
        log.error('Invalid schema name attempted in cache warming', new Error('SQL injection attempt'), {
          datasourceId,
          schemaName,
          tableName,
          component: 'warming-service',
        });
        throw new Error(`Invalid schema name: ${schemaName}. Only schemas ${ALLOWED_SCHEMAS.join(', ')} are allowed.`);
      }

      // Validate table name format (alphanumeric, underscores only)
      // This prevents SQL injection while allowing dynamic table names from data source configs
      const TABLE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;
      if (!TABLE_NAME_PATTERN.test(tableName)) {
        log.error('Invalid table name format in cache warming', new Error('SQL injection attempt'), {
          datasourceId,
          schemaName,
          tableName,
          component: 'warming-service',
        });
        throw new Error(`Invalid table name format: ${tableName}. Only alphanumeric characters and underscores allowed.`);
      }

      // Get column mappings for dynamic column access
      const columnMapping = await columnMappingService.getMapping(datasourceId);

      // Query ALL data (no WHERE clause, no ORDER BY to support all schemas)
      // Schema and table names validated above to prevent SQL injection
      const query = `
        SELECT *
        FROM ${schemaName}.${tableName}
      `;

      log.debug('Executing cache warming query', {
        datasourceId,
        schema: schemaName,
        table: tableName,
        columnMapping,
        component: 'warming-service',
      });

      const allRows = await executeAnalyticsQuery(query, []);

      log.info('Cache warming query completed', {
        datasourceId,
        totalRows: allRows.length,
        component: 'warming-service',
      });

      // Group by unique combination
      const grouped = this.groupDataByKey(allRows, datasourceId, columnMapping);

      log.info('Data grouped for caching', {
        datasourceId,
        uniqueCombinations: grouped.size,
        validRows: allRows.length,
        component: 'warming-service',
      });

      // Write to SHADOW keys (zero downtime)
      const entriesCached = await this.writeBatchesToShadow(grouped, datasourceId);

      log.info('Shadow keys populated, performing atomic swap', {
        datasourceId,
        entriesCached,
        component: 'warming-service',
      });

      // Atomic swap: RENAME shadow keys to production keys
      await this.swapShadowKeys(datasourceId);

      // Set metadata
      await this.setMetadata(datasourceId);

      const duration = Date.now() - startTime;

      log.info('Cache warming completed with zero downtime', {
        datasourceId,
        entriesCached,
        totalRows: allRows.length,
        duration,
        component: 'warming-service',
      });

      return {
        entriesCached,
        totalRows: allRows.length,
        duration,
      };
    } finally {
      // Always release lock
      await this.client.releaseLock(lockKey);
      log.debug('Cache warming lock released', {
        datasourceId,
        lockKey,
        component: 'warming-service',
      });
    }
  }

  /**
   * Warm cache with progress tracking
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
    // TODO: Implement true shadow key strategy in future iteration
    // For now, delegate to regular warmCache
    log.info('Concurrent warming requested, using standard warming', {
      datasourceId,
      component: 'warming-service',
    });

    // Call progress callback with 100% when done (placeholder)
    const result = await this.warmCache(datasourceId);

    if (onProgress && !result.skipped) {
      onProgress({
        rowsProcessed: result.totalRows,
        totalRows: result.totalRows,
        percent: 100,
      });
    }

    return result;
  }

  /**
   * Group data by unique cache key combination
   * Uses column mappings to find correct column names
   *
   * @param rows - All rows from database
   * @param datasourceId - Data source ID
   * @param columnMapping - Column mapping configuration
   * @returns Map of cache key to data rows
   */
  private groupDataByKey(
    rows: Record<string, unknown>[],
    datasourceId: number,
    columnMapping: { timePeriodField: string }
  ): Map<string, Record<string, unknown>[]> {
    const grouped = new Map<string, Record<string, unknown>[]>();
    let skippedRows = 0;

    for (const row of rows) {
      // Use column mappings to find the correct column names
      // NOTE: For measure NAME (dimension), always use 'measure' column
      // The measureField in mapping refers to measure VALUE (numeric), not the name
      const measure = row.measure as string | undefined;
      const practiceUid = row.practice_uid as number | undefined;
      const providerUid = (row.provider_uid as number | null | undefined) || null;
      const frequency = row[columnMapping.timePeriodField] as string | undefined;

      // Skip rows missing required fields
      if (!measure || !practiceUid || !frequency) {
        skippedRows++;
        continue;
      }

      const key = `${measure}|${practiceUid}|${providerUid}|${frequency}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      const group = grouped.get(key);
      if (group) {
        group.push(row);
      }
    }

    if (skippedRows > 0) {
      log.warn('Skipped rows with missing required fields', {
        datasourceId,
        skippedRows,
        component: 'warming-service',
      });
    }

    return grouped;
  }

  /**
   * Write grouped data to SHADOW keys in batches using pipelines
   * Shadow keys allow us to build the new cache without affecting production
   *
   * @param grouped - Map of cache key to data rows
   * @param datasourceId - Data source ID
   * @returns Number of entries cached
   */
  private async writeBatchesToShadow(
    grouped: Map<string, Record<string, unknown>[]>,
    datasourceId: number
  ): Promise<number> {
    let entriesCached = 0;
    const batchSize = this.client.getBatchSize();
    let pipeline = this.client.createPipeline();

    if (!pipeline) {
      log.error('Failed to create Redis pipeline', {
        datasourceId,
        component: 'warming-service',
      });
      return 0;
    }

    for (const [key, rows] of Array.from(grouped.entries())) {
      const parts = key.split('|');
      const measure = parts[0];
      const practiceUidStr = parts[1];
      const providerUidStr = parts[2];
      const frequency = parts[3];

      if (!measure || !practiceUidStr || !frequency) {
        log.warn('Skipping invalid cache entry - missing required fields', {
          datasourceId,
          key,
          component: 'warming-service',
        });
        continue;
      }

      const entry: CacheKeyEntry = {
        datasourceId,
        measure,
        practiceUid: Number.parseInt(practiceUidStr, 10),
        providerUid:
          providerUidStr && providerUidStr !== 'null'
            ? Number.parseInt(providerUidStr, 10)
            : null,
        frequency,
      };

      // Generate SHADOW keys for storage, PRODUCTION keys for index references
      const shadowCacheKey = KeyGenerator.getShadowCacheKey(entry);
      const productionCacheKey = KeyGenerator.getCacheKey(entry); // What the key will be called after RENAME
      const shadowIndexKeys = KeyGenerator.getShadowIndexKeys(entry);

      // Store data to shadow key WITHOUT TTL
      // CRITICAL: Shadow keys must not expire before swap completes
      // TTL will be applied to production keys after atomic RENAME
      pipeline.set(shadowCacheKey, JSON.stringify(rows));

      // Add PRODUCTION key names to shadow indexes
      // CRITICAL: Index must reference the FINAL key name (after RENAME), not the shadow name
      // Otherwise index will point to non-existent keys after swap
      for (const shadowIndexKey of shadowIndexKeys) {
        pipeline.sadd(shadowIndexKey, productionCacheKey);
        // NOTE: No EXPIRE command - index keys persist until explicitly deleted
      }

      entriesCached++;

      // Execute pipeline in batches
      if (entriesCached % batchSize === 0) {
        const result = await this.client.executePipeline(pipeline);

        if (!result.success) {
          log.error('Redis pipeline errors during shadow key warming', {
            datasourceId,
            errorCount: result.errorCount,
            component: 'warming-service',
          });
          throw new Error(`Redis pipeline failed with ${result.errorCount} errors`);
        }

        pipeline = this.client.createPipeline();
        if (!pipeline) {
          throw new Error('Failed to create new pipeline');
        }

        log.debug('Shadow key warming progress', {
          datasourceId,
          cached: entriesCached,
          total: grouped.size,
          progress: Math.round((entriesCached / grouped.size) * 100),
          component: 'warming-service',
        });
      }
    }

    // Execute remaining pipeline
    if (entriesCached % batchSize !== 0 && grouped.size > 0) {
      const result = await this.client.executePipeline(pipeline);

      if (!result.success) {
        log.error('Redis pipeline errors during final shadow key batch', {
          datasourceId,
          errorCount: result.errorCount,
          component: 'warming-service',
        });
        throw new Error(`Redis pipeline failed with ${result.errorCount} errors`);
      }
    }

    return entriesCached;
  }

  /**
   * Atomic swap: RENAME shadow keys to production keys
   * This happens in milliseconds with zero cache downtime
   *
   * Process:
   * 1. SCAN for all shadow cache keys
   * 2. For each shadow key, RENAME to production key (atomic operation)
   * 3. SCAN for all shadow index keys
   * 4. For each shadow index key, RENAME to production key (atomic operation)
   *
   * RENAME is atomic - either the key is renamed or it fails.
   * Old production keys are automatically overwritten.
   *
   * @param datasourceId - Data source ID
   */
  private async swapShadowKeys(datasourceId: number): Promise<void> {
    const redis = this.client.getClient();
    if (!redis) {
      throw new Error('Redis client not available for shadow key swap');
    }

    const swapStartTime = Date.now();
    let cacheKeysRenamed = 0;
    let indexKeysRenamed = 0;

    // Get TTL and keyPrefix once for all operations
    const ttl = this.client.getDefaultTTL();
    const keyPrefix = redis.options.keyPrefix || '';

    // Step 1: Rename shadow cache keys to production keys
    const shadowCachePattern = KeyGenerator.getShadowCachePattern(datasourceId);
    let cursor = '0';
    const SCAN_COUNT = 1000; // Process 1000 keys per batch for better performance
    let iterations = 0;
    const MAX_ITERATIONS = 1000; // Safety limit (at 1000 keys per scan = 1M keys max)

    log.info('Starting shadow cache key swap', {
      datasourceId,
      pattern: shadowCachePattern,
      component: 'warming-service',
    });

    do {
      const result = await redis.scan(cursor, 'MATCH', shadowCachePattern, 'COUNT', SCAN_COUNT);
      cursor = result[0];
      const shadowKeys = result[1];

      // Rename each shadow key to production key using pipeline for performance
      // Process keys in batches to avoid overwhelming Redis
      if (shadowKeys.length > 0) {
        const pipeline = redis.pipeline();

        for (const shadowKey of shadowKeys) {
          // IMPORTANT: SCAN returns keys WITH prefix, but RENAME will add prefix again
          // Strip prefix from SCAN results before using in RENAME
          // bcos:development:shadow:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly
          // => shadow:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly (strip prefix)
          // => cache:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly (replace)
          const keyWithoutPrefix = keyPrefix ? shadowKey.replace(keyPrefix, '') : shadowKey;
          const productionKey = keyWithoutPrefix.replace('shadow:', 'cache:');

          // Step 1: RENAME is atomic - overwrites old key if exists
          // Use keys WITHOUT prefix - ioredis will add prefix automatically
          pipeline.rename(keyWithoutPrefix, productionKey);

          // Step 2: Set TTL on production key (48 hours)
          // This must happen AFTER rename since shadow keys have no TTL
          pipeline.expire(productionKey, ttl);
        }

        try {
          // Execute all RENAME+EXPIRE operations in a single pipeline
          const results = await pipeline.exec();

          // Check for errors in pipeline execution
          if (results) {
            for (let i = 0; i < results.length; i += 2) {
              const result = results[i];
              if (result) {
                const [renameError] = result;
                if (renameError) {
                  log.error('Failed to rename shadow cache key in pipeline', renameError instanceof Error ? renameError : new Error(String(renameError)), {
                    batchIndex: i / 2,
                    datasourceId,
                    component: 'warming-service',
                  });
                  throw renameError;
                }
              }
              cacheKeysRenamed++;
            }
          }
        } catch (error) {
          log.error('Failed to execute cache key rename pipeline', error instanceof Error ? error : new Error(String(error)), {
            datasourceId,
            batchSize: shadowKeys.length,
            component: 'warming-service',
          });
          throw error;
        }
      }

      iterations++;
      if (iterations > MAX_ITERATIONS) {
        log.error('SCAN exceeded maximum iterations during cache key swap', new Error('SCAN timeout'), {
          datasourceId,
          pattern: shadowCachePattern,
          iterations,
          keysRenamed: cacheKeysRenamed,
          component: 'warming-service',
        });
        throw new Error(`SCAN exceeded max iterations: ${MAX_ITERATIONS}`);
      }
    } while (cursor !== '0');

    log.info('Shadow cache keys swapped', {
      datasourceId,
      keysRenamed: cacheKeysRenamed,
      duration: Date.now() - swapStartTime,
      component: 'warming-service',
    });

    // Step 2: Rename shadow index keys to production keys
    const shadowIndexPattern = KeyGenerator.getShadowIndexPattern(datasourceId);
    cursor = '0';
    iterations = 0; // Reset iteration counter

    log.info('Starting shadow index key swap', {
      datasourceId,
      pattern: shadowIndexPattern,
      component: 'warming-service',
    });

    do {
      const result = await redis.scan(cursor, 'MATCH', shadowIndexPattern, 'COUNT', SCAN_COUNT);
      cursor = result[0];
      const shadowIndexKeys = result[1];

      // Rename each shadow index key to production key using pipeline for performance
      if (shadowIndexKeys.length > 0) {
        const pipeline = redis.pipeline();

        for (const shadowIndexKey of shadowIndexKeys) {
          // IMPORTANT: SCAN returns keys WITH prefix, but RENAME will add prefix again
          // Strip prefix from SCAN results before using in RENAME
          // bcos:development:shadow_idx:{ds:1}:master
          // => shadow_idx:{ds:1}:master (strip prefix)
          // => idx:{ds:1}:master (replace)
          const keyWithoutPrefix = keyPrefix ? shadowIndexKey.replace(keyPrefix, '') : shadowIndexKey;
          const productionIndexKey = keyWithoutPrefix.replace('shadow_idx:', 'idx:');

          // RENAME is atomic - overwrites old key if exists
          // Use keys WITHOUT prefix - ioredis will add prefix automatically
          pipeline.rename(keyWithoutPrefix, productionIndexKey);

          // Set TTL on production index key
          pipeline.expire(productionIndexKey, ttl);
        }

        try {
          // Execute all RENAME+EXPIRE operations in a single pipeline
          const results = await pipeline.exec();

          // Check for errors in pipeline execution
          if (results) {
            for (let i = 0; i < results.length; i += 2) {
              const result = results[i];
              if (result) {
                const [renameError] = result;
                if (renameError) {
                  log.error('Failed to rename shadow index key in pipeline', renameError instanceof Error ? renameError : new Error(String(renameError)), {
                    batchIndex: i / 2,
                    datasourceId,
                    component: 'warming-service',
                  });
                  throw renameError;
                }
              }
              indexKeysRenamed++;
            }
          }
        } catch (error) {
          log.error('Failed to execute index key rename pipeline', error instanceof Error ? error : new Error(String(error)), {
            datasourceId,
            batchSize: shadowIndexKeys.length,
            component: 'warming-service',
          });
          throw error;
        }
      }

      iterations++;
      if (iterations > MAX_ITERATIONS) {
        log.error('SCAN exceeded maximum iterations during index key swap', new Error('SCAN timeout'), {
          datasourceId,
          pattern: shadowIndexPattern,
          iterations,
          keysRenamed: indexKeysRenamed,
          component: 'warming-service',
        });
        throw new Error(`SCAN exceeded max iterations: ${MAX_ITERATIONS}`);
      }
    } while (cursor !== '0');

    const totalDuration = Date.now() - swapStartTime;

    log.info('Shadow index keys swapped - atomic swap complete', {
      datasourceId,
      cacheKeysRenamed,
      indexKeysRenamed,
      totalKeys: cacheKeysRenamed + indexKeysRenamed,
      duration: totalDuration,
      note: 'Zero downtime achieved via atomic RENAME',
      component: 'warming-service',
    });
  }

  /**
   * Set metadata for cache (last warming timestamp)
   *
   * @param datasourceId - Data source ID
   */
  private async setMetadata(datasourceId: number): Promise<void> {
    const metadataKey = KeyGenerator.getMetadataKey(datasourceId);

    await this.client.setCached(metadataKey, [{ timestamp: new Date().toISOString() }]);

    log.debug('Cache metadata set', {
      datasourceId,
      metadataKey,
      component: 'warming-service',
    });
  }
}
