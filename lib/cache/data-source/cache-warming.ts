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
import { cacheClient } from '../indexed-analytics/cache-client';
import { db } from '@/lib/db';
import { chart_data_sources } from '@/lib/db/chart-config-schema';
import { eq } from 'drizzle-orm';
import { cacheOperations } from './cache-operations';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import {
  isSchemaAllowed,
  isTableNameValid,
  buildSafeTableReference,
  ALLOWED_ANALYTICS_SCHEMAS,
} from '@/lib/constants/cache-security';

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
  private readonly RATE_LIMIT_SECONDS = 6 * 60; // 6 minutes (10 triggers/hour per datasource)
  private readonly MAX_TABLE_ROWS = 100000; // 100K rows max for table-based warming

  /**
   * Trigger cache warming if needed (non-blocking)
   * Called automatically when stale cache is detected (>4 hours old)
   * Rate limited per-datasource: max 10 triggers/hour (once every 6 minutes)
   *
   * BEHAVIOR: When ANY datasource detects stale cache, warms ALL datasources
   * RATE LIMITING: Each datasource can only trigger warming once per 6 minutes
   *
   * @param datasourceId - Data source ID that detected stale cache (used for rate limiting)
   */
  triggerAutoWarmingIfNeeded(datasourceId: number): void {
    // Fire and forget (don't block user request)
    this.warmAllDataSourcesBackground(datasourceId).catch((error) => {
      log.warn('Background cache warming failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        triggeredBy: datasourceId,
        operation: 'warm_all',
      });
    });
  }

  /**
   * Warm ALL data sources in background with rate limiting
   * SELF-HEALING: Automatically triggered when any datasource detects stale cache
   *
   * RATE LIMITING: Each datasource can trigger at most once per 6 minutes
   * AGGRESSIVE: When one datasource is stale, refresh ALL datasources
   *
   * @param triggeredByDatasourceId - Data source ID that detected stale cache (for rate limiting)
   */
  private async warmAllDataSourcesBackground(triggeredByDatasourceId: number): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping auto-warming', {
        triggeredBy: triggeredByDatasourceId,
        operation: 'warm_all',
      });
      return;
    }

    // === RATE LIMITING CHECK (per datasource) ===
    // Check if THIS datasource triggered warming in last 6 minutes
    const rateLimitKey = `cache:auto-warm:last:${triggeredByDatasourceId}`;
    const lastWarmed = await client.get(rateLimitKey);

    if (lastWarmed) {
      // Key exists = recently triggered by this datasource
      const ttlRemaining = await client.ttl(rateLimitKey);

      log.debug('Auto-warming skipped - datasource recently triggered', {
        triggeredBy: triggeredByDatasourceId,
        lastTriggered: lastWarmed,
        cooldownRemaining: ttlRemaining,
        cooldownRemainingMinutes: Math.round((ttlRemaining / 60) * 10) / 10,
        operation: 'warm_all',
      });
      return; // Skip warming - rate limited
    }

    log.info('Auto-triggered cache warming for ALL datasources', {
      triggeredBy: triggeredByDatasourceId,
      reason: 'stale_cache_detected',
      trigger: 'automatic',
      operation: 'warm_all',
    });

    const startTime = Date.now();

    try {
      // Warm ALL datasources (each has its own distributed lock)
      const result = await this.warmAllDataSources();

      const duration = Date.now() - startTime;

      // === SET RATE LIMIT for triggering datasource (6-minute cooldown) ===
      // Only set if warming succeeded
      const now = new Date();
      await client.setex(
        rateLimitKey,
        this.RATE_LIMIT_SECONDS,
        now.toISOString() // Store timestamp for logging
      );

      const nextAllowedTrigger = new Date(now.getTime() + this.RATE_LIMIT_SECONDS * 1000);

      log.info('Auto cache warming completed for ALL datasources', {
        triggeredBy: triggeredByDatasourceId,
        dataSourcesWarmed: result.dataSourcesWarmed,
        totalEntriesCached: result.totalEntriesCached,
        totalRows: result.totalRows,
        duration,
        rateLimitSet: true,
        nextAllowedTrigger: nextAllowedTrigger.toISOString(),
        operation: 'warm_all',
      });
    } catch (error) {
      log.error('Auto cache warming failed for ALL datasources', error, {
        triggeredBy: triggeredByDatasourceId,
        operation: 'warm_all',
        note: 'Rate limit NOT set on failure, allowing retry after cooldown expires',
      });
      // Note: Rate limit NOT set on failure, allowing retry
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

    // SECURITY: Validate schema using centralized whitelist
    if (!isSchemaAllowed(schemaName)) {
      throw new Error(
        `Invalid schema name: ${schemaName}. Must be one of: ${ALLOWED_ANALYTICS_SCHEMAS.join(', ')}`
      );
    }

    // SECURITY: Validate table name using centralized pattern
    if (!isTableNameValid(tableName)) {
      throw new Error(`Invalid table name format: ${tableName}`);
    }

    log.info('Warming table-based data source', {
      dataSourceId,
      tableName,
      schemaName,
      type: 'table-based',
    });

    // SECURITY: Build safe query using centralized function with quoted identifiers
    // PERFORMANCE: Add LIMIT to prevent memory exhaustion on large tables
    const safeTableRef = buildSafeTableReference(schemaName, tableName);
    const query = `SELECT * FROM ${safeTableRef} LIMIT ${this.MAX_TABLE_ROWS}`;
    const rows = await executeAnalyticsQuery<Record<string, unknown>>(query, []);

    const totalRows = rows.length;

    // Warn if we hit the row limit (table may be incomplete in cache)
    if (totalRows === this.MAX_TABLE_ROWS) {
      log.warn('Table-based data source hit row limit - cache may be incomplete', {
        dataSourceId,
        tableName,
        schemaName,
        rowsReturned: totalRows,
        maxRows: this.MAX_TABLE_ROWS,
        incomplete: true,
      });
    }

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

    // IMPORTANT: Set metadata so cache is marked as warm
    // Table-based sources don't create indexes, so we must set metadata manually
    // STANDARDIZED FORMAT: Use IndexedCacheClient just like measure-based sources
    // This ensures consistent format, TTL (48 hours), and serialization
    const metadataKey = `cache:meta:{ds:${dataSourceId}}:last_warm`;
    const timestamp = new Date().toISOString();

    // Store in standardized format: [{ timestamp: "ISO" }]
    // Use cacheClient to ensure same behavior as measure-based sources
    await cacheClient.setCached(metadataKey, [{ timestamp }]);

    log.info('Table-based cache metadata set', {
      dataSourceId,
      metadataKey,
      timestamp,
    });

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
      // Validate table-based configuration
      if (!tableName || !schemaName) {
        throw new Error(
          `Table-based data source ${dataSourceId} is missing required configuration. ` +
          `tableName: ${tableName || 'null'}, schemaName: ${schemaName || 'null'}. ` +
          `Please update the chart_data_sources table with valid table_name and schema_name values.`
        );
      }
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
