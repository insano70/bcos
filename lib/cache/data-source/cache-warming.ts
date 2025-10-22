/**
 * Cache Warming Service
 *
 * Handles cache warming orchestration with distributed locking and rate limiting.
 *
 * RESPONSIBILITIES:
 * - Auto-warming trigger logic (cold/stale detection)
 * - Manual warming operations
 * - Distributed lock management (prevent race conditions)
 * - Rate limiting (4-hour cooldown)
 * - Warming for single or all data sources
 *
 * SECURITY:
 * - Distributed locking prevents concurrent warming
 * - Rate limiting prevents abuse
 * - Lock expiration (5 min) prevents deadlocks
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { indexedAnalyticsCache } from '../indexed-analytics-cache';
import { db } from '@/lib/db';
import { chart_data_sources } from '@/lib/db/chart-config-schema';
import { eq } from 'drizzle-orm';
import { cacheOperations } from './cache-operations';

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
 * Cache warming result for all data sources
 */
export interface WarmAllResult {
  dataSourcesWarmed: number;
  totalEntriesCached: number;
  totalRows: number;
  duration: number;
}

/**
 * Cache Warming Service
 * Orchestrates cache warming with locking and rate limiting
 */
export class CacheWarmingService {
  private readonly RATE_LIMIT_SECONDS = 4 * 60 * 60; // 4 hours
  private readonly LOCK_TIMEOUT_SECONDS = 300; // 5 minutes

  /**
   * Trigger cache warming if needed (non-blocking)
   * Called automatically when cold cache is detected
   * Rate limited to max once per 4 hours per datasource
   *
   * @param datasourceId - Data source ID to warm
   */
  triggerAutoWarmingIfNeeded(datasourceId: number): void {
    // Fire and forget (don't block user request)
    this.warmDataSourceBackground(datasourceId).catch((error) => {
      log.warn('Background cache warming failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        datasourceId,
      });
    });
  }

  /**
   * Warm data source in background with rate limiting and distributed locking
   * SELF-HEALING: Automatically triggered when cold cache is detected
   *
   * RATE LIMITING: Max once per 4 hours per datasource
   * DISTRIBUTED LOCKING: Prevents concurrent warming attempts
   *
   * @param datasourceId - Data source ID to warm
   */
  private async warmDataSourceBackground(datasourceId: number): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping auto-warming', { datasourceId });
      return;
    }

    // === RATE LIMITING CHECK ===
    // Check if warmed in last 4 hours to prevent too-frequent refreshes
    const rateLimitKey = `cache:auto-warm:last:${datasourceId}`;
    const lastWarmed = await client.get(rateLimitKey);

    if (lastWarmed) {
      // Key exists = recently warmed (within last 4 hours)
      const ttlRemaining = await client.ttl(rateLimitKey);

      log.debug('Auto-warming skipped - recently warmed', {
        datasourceId,
        lastWarmed,
        cooldownRemaining: ttlRemaining,
        cooldownRemainingHours: Math.round(ttlRemaining / 3600),
      });
      return; // Skip warming - rate limited
    }

    // === DISTRIBUTED LOCKING ===
    // Prevent concurrent warming from multiple instances
    const lockKey = `lock:cache:warm:${datasourceId}`;
    const acquired = await client.set(lockKey, '1', 'EX', this.LOCK_TIMEOUT_SECONDS, 'NX');

    if (!acquired) {
      log.info('Cache warming already in progress, skipping', { datasourceId });
      return;
    }

    try {
      log.info('Auto-triggered cache warming', {
        datasourceId,
        reason: 'cold_cache_detected',
        trigger: 'automatic',
      });

      const startTime = Date.now();

      // Perform warming (delegates to indexed cache)
      const result = await indexedAnalyticsCache.warmCache(datasourceId);

      const duration = Date.now() - startTime;

      // === SET RATE LIMIT (4-hour cooldown) ===
      // Only set if warming succeeded
      const now = new Date();
      await client.setex(
        rateLimitKey,
        this.RATE_LIMIT_SECONDS,
        now.toISOString() // Store timestamp for logging
      );

      const nextAllowedWarm = new Date(now.getTime() + this.RATE_LIMIT_SECONDS * 1000);

      log.info('Auto cache warming completed', {
        datasourceId,
        entriesCached: result.entriesCached,
        totalRows: result.totalRows,
        duration,
        rateLimitSet: true,
        nextAllowedWarm: nextAllowedWarm.toISOString(),
      });
    } catch (error) {
      log.error('Auto cache warming failed', error, {
        datasourceId,
        note: 'Rate limit NOT set on failure, allowing retry after lock expires',
      });
      // Note: Rate limit NOT set on failure, allowing retry after lock expires (5 min)
    } finally {
      // Always release lock
      await client.del(lockKey);
    }
  }

  /**
   * Warm table-based data source
   * Fetches all rows from table and caches them directly (no measure grouping)
   *
   * @param dataSourceId - Data source ID
   * @param tableName - Table name
   * @param schemaName - Schema name
   * @returns Warming result
   */
  private async warmTableBasedDataSource(
    dataSourceId: number,
    tableName: string,
    schemaName: string
  ): Promise<WarmResult> {
    const startTime = Date.now();

    log.info('Warming table-based data source', {
      dataSourceId,
      tableName,
      schemaName,
      type: 'table-based',
    });

    // Fetch all rows from table without measure/frequency filtering
    // Note: We need a system user context for warming - for now, fetch raw data
    const rows = await db
      .execute<Record<string, unknown>>(
        `SELECT * FROM ${schemaName}.${tableName}`
      );

    const totalRows = rows.length;

    if (totalRows === 0) {
      log.warn('No rows found for table-based data source', {
        dataSourceId,
        tableName,
        schemaName,
      });
      return {
        entriesCached: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
      };
    }

    // Cache the entire result set as a single entry
    // Key format: datasource:{id}:table:p:*:prov:*
    await cacheOperations.setCached(
      {
        dataSourceId,
        dataSourceType: 'table-based',
      },
      rows
    );

    const duration = Date.now() - startTime;

    log.info('Table-based data source warming completed', {
      dataSourceId,
      entriesCached: 1,
      totalRows,
      duration,
      type: 'table-based',
    });

    return {
      entriesCached: 1,
      totalRows,
      duration,
    };
  }

  /**
   * Warm cache for a specific data source
   * Auto-detects type and routes to appropriate warming method
   *
   * SECURITY: Uses distributed locking to prevent concurrent warming
   * IMPORTANT: Manual warming resets the auto-warming rate limit
   *
   * @param dataSourceId - Data source ID to warm
   * @returns Warming result
   */
  async warmDataSource(dataSourceId: number): Promise<WarmResult> {
    log.info('Warming data source cache', { dataSourceId, trigger: 'manual' });

    // Detect data source type from database
    const dataSourceInfo = await db
      .select({
        dataSourceType: chart_data_sources.data_source_type,
        tableName: chart_data_sources.table_name,
        schemaName: chart_data_sources.schema_name,
      })
      .from(chart_data_sources)
      .where(eq(chart_data_sources.data_source_id, dataSourceId))
      .limit(1);

    if (!dataSourceInfo || dataSourceInfo.length === 0 || !dataSourceInfo[0]) {
      throw new Error(`Data source ${dataSourceId} not found`);
    }

    const { dataSourceType, tableName, schemaName } = dataSourceInfo[0];

    let result: WarmResult;

    // Route to appropriate warming method based on type
    if (dataSourceType === 'table-based') {
      result = await this.warmTableBasedDataSource(dataSourceId, tableName, schemaName);
    } else {
      // Measure-based: delegate to indexed cache which handles locking, grouping, and index creation
      result = await indexedAnalyticsCache.warmCache(dataSourceId);
    }

    // Reset auto-warming rate limit after successful manual warm
    // This prevents auto-warming from triggering shortly after admin manually warms cache
    const client = getRedisClient();
    if (client && !result.skipped) {
      const rateLimitKey = `cache:auto-warm:last:${dataSourceId}`;
      const now = new Date();
      await client.setex(rateLimitKey, this.RATE_LIMIT_SECONDS, now.toISOString());

      log.info('Manual warming reset auto-warm rate limit', {
        dataSourceId,
        dataSourceType,
        rateLimitSet: true,
        nextAutoWarmAllowed: new Date(now.getTime() + this.RATE_LIMIT_SECONDS * 1000).toISOString(),
      });
    }

    return result;
  }

  /**
   * Warm cache for all active data sources
   * Executes all warmings in parallel for maximum performance
   *
   * @returns Warming result for all data sources
   */
  async warmAllDataSources(): Promise<WarmAllResult> {
    const startTime = Date.now();

    log.info('Starting cache warming for all data sources (parallel execution)');

    // Get all active data sources with type information
    const dataSources = await chartConfigService.getAllDataSources();

    // Warm all data sources in parallel
    const warmingPromises = dataSources.map(async (dataSource) => {
      try {
        const result = await this.warmDataSource(dataSource.id);
        return {
          success: true,
          dataSourceId: dataSource.id,
          dataSourceType: dataSource.dataSourceType,
          entriesCached: result.entriesCached,
          totalRows: result.totalRows,
        };
      } catch (error) {
        log.error('Failed to warm data source', error, {
          dataSourceId: dataSource.id,
          dataSourceType: dataSource.dataSourceType,
        });
        return {
          success: false,
          dataSourceId: dataSource.id,
          dataSourceType: dataSource.dataSourceType,
          entriesCached: 0,
          totalRows: 0,
        };
      }
    });

    // Wait for all warmings to complete
    const results = await Promise.all(warmingPromises);

    // Calculate totals
    const successfulWarmings = results.filter((r) => r.success);
    const totalEntriesCached = results.reduce((sum, r) => sum + r.entriesCached, 0);
    const totalRows = results.reduce((sum, r) => sum + r.totalRows, 0);

    const measureBasedCount = results.filter((r) => r.dataSourceType === 'measure-based').length;
    const tableBasedCount = results.filter((r) => r.dataSourceType === 'table-based').length;

    const duration = Date.now() - startTime;

    log.info('Cache warming completed for all data sources', {
      dataSourcesWarmed: successfulWarmings.length,
      dataSourcesFailed: results.length - successfulWarmings.length,
      totalDataSources: dataSources.length,
      measureBasedCount,
      tableBasedCount,
      totalEntriesCached,
      totalRows,
      duration,
      durationMinutes: Math.round(duration / 60000),
      executionMode: 'parallel',
    });

    return {
      dataSourcesWarmed: successfulWarmings.length,
      totalEntriesCached,
      totalRows,
      duration,
    };
  }
}

// Export singleton instance
export const cacheWarmingService = new CacheWarmingService();
