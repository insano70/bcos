/**
 * Cache Warming Worker Thread
 *
 * Runs in a separate V8 isolate from the main thread.
 * This ensures CPU-intensive warming operations don't block user requests.
 *
 * ISOLATION:
 * - Separate event loop
 * - Own database connections
 * - Own Redis client
 * - Own memory heap
 *
 * LIFECYCLE:
 * 1. Spawned by warming-worker-launcher.ts
 * 2. Initializes own connections
 * 3. Executes warming for all data sources
 * 4. Reports results via postMessage
 * 5. Exits
 *
 * CONSTANTS:
 * Some constants are duplicated here from lib/constants/cache-config.ts because:
 * - Worker threads run in isolated V8 contexts
 * - Path aliases (@/lib) don't work reliably in worker threads
 * - Dynamic imports add complexity for minimal benefit
 *
 * If you update these values, also update lib/constants/cache-config.ts:
 * - CACHE_TTL.DEFAULT_SECONDS (172800 = 48 hours)
 * - CACHE_LIMITS.MAX_ENTRY_SIZE_BYTES (100MB)
 * - CACHE_BATCHING.PIPELINE_BATCH_SIZE (500)
 * - CACHE_WARMING.LOCK_TTL_SECONDS (300 = 5 minutes)
 * - WORKER_DB_CONFIG.MAIN_DB_MAX_CONNECTIONS (2)
 * - WORKER_DB_CONFIG.ANALYTICS_DB_MAX_CONNECTIONS (3)
 */

import { parentPort, workerData } from 'node:worker_threads';
import postgres from 'postgres';
import Redis, { type RedisOptions } from 'ioredis';

// =============================================================================
// INLINED CONSTANTS FROM lib/constants/cache-security.ts
// =============================================================================
//
// These constants are duplicated here because:
// - Worker threads run in isolated V8 contexts
// - Path aliases (@/lib) don't work reliably in worker threads
// - Relative imports with tsx loader fail in worker thread contexts
// - Dynamic imports add complexity for minimal benefit
//
// If you update these values, also update lib/constants/cache-security.ts:
// - ALLOWED_ANALYTICS_SCHEMAS
// - TABLE_NAME_PATTERN
// - LOCK_KEY_PREFIX
// - isSchemaAllowed()
// - isTableNameValid()
// - buildSafeTableReference()
// - buildWarmingLockKey()
// =============================================================================

/**
 * Allowed schemas for analytics data sources
 * These schemas are whitelisted for cache warming queries.
 */
const ALLOWED_ANALYTICS_SCHEMAS = ['ih', 'public'] as const;

type AllowedAnalyticsSchema = (typeof ALLOWED_ANALYTICS_SCHEMAS)[number];

/**
 * Validate if a schema name is allowed
 */
function isSchemaAllowed(schemaName: string): schemaName is AllowedAnalyticsSchema {
  return (ALLOWED_ANALYTICS_SCHEMAS as readonly string[]).includes(schemaName);
}

/**
 * Table name validation pattern
 * Matches valid PostgreSQL identifier names to prevent SQL injection.
 */
const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate if a table name is safe for use in SQL
 */
function isTableNameValid(tableName: string): boolean {
  return TABLE_NAME_PATTERN.test(tableName);
}

/**
 * Build a safe SQL identifier for schema.table
 * ALWAYS uses quoted identifiers to prevent SQL injection.
 */
function buildSafeTableReference(schemaName: string, tableName: string): string {
  if (!isSchemaAllowed(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Allowed schemas: ${ALLOWED_ANALYTICS_SCHEMAS.join(', ')}`
    );
  }

  if (!isTableNameValid(tableName)) {
    throw new Error(
      `Invalid table name format: ${tableName}. Must match pattern: ${TABLE_NAME_PATTERN.source}`
    );
  }

  // Always use quoted identifiers for safety
  return `"${schemaName}"."${tableName}"`;
}

/**
 * Cache warming lock key prefix
 */
const LOCK_KEY_PREFIX = 'lock:cache:warm';

/**
 * Build a standardized lock key for cache warming
 */
function buildWarmingLockKey(datasourceId: number): string {
  return `${LOCK_KEY_PREFIX}:{ds:${datasourceId}}`;
}

// =============================================================================
// END INLINED CONSTANTS
// =============================================================================

// Note: WorkerConfig and WarmingWorkerResult types are imported from a separate
// types file that has no dependencies, so this import is safe in worker context
import type { WorkerConfig, WarmingWorkerResult } from './warming-worker-types';

// Data source info from database
interface DataSourceInfo {
  data_source_id: number;
  data_source_name: string;
  data_source_type: 'measure-based' | 'table-based';
  table_name: string | null;
  schema_name: string | null;
  is_active: boolean;
}

/**
 * Worker-specific logging
 *
 * DESIGN DECISION: Uses console.log with JSON format instead of the main app logger.
 *
 * RATIONALE:
 * - Worker threads run in isolated V8 contexts
 * - The main app logger (@/lib/logger) has dependencies that may not work in workers
 * - JSON-formatted console output is picked up by log aggregators (CloudWatch, etc.)
 * - This ensures logs from workers appear alongside main app logs
 *
 * FORMAT: JSON with timestamp, level, message, component, and any additional data.
 * This matches the structured logging format used by the main application.
 *
 * SECURITY: This function intentionally does NOT log workerData to prevent
 * accidental exposure of database credentials in log output.
 */
function logWorker(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    message,
    component: 'warming-worker',
    ...data,
  };
  
  if (level === 'error') {
    console.error(JSON.stringify(logData));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logData));
  } else {
    console.log(JSON.stringify(logData));
  }
}

/**
 * Main worker execution
 */
async function runWarming(): Promise<WarmingWorkerResult> {
  const startTime = Date.now();
  const config = workerData as WorkerConfig;

  logWorker('info', 'Worker thread starting cache warming', {
    environment: config.environment,
  });

  // Initialize worker-specific connections
  let mainDbClient: postgres.Sql | null = null;
  let analyticsClient: postgres.Sql | null = null;
  let redisClient: Redis | null = null;

  try {
    // Create main database connection (for reading data source configs)
    mainDbClient = postgres(config.databaseUrl, {
      max: 2,
      idle_timeout: 30,
      connect_timeout: 10,
    });

    // Create analytics database connection (for reading source data)
    analyticsClient = postgres(config.analyticsDatabaseUrl, {
      max: 3,
      idle_timeout: 30,
      connect_timeout: 10,
      ssl: 'require',
    });

    // Create Redis client
    const redisOptions: RedisOptions = {
      host: config.redisHost,
      port: config.redisPort,
      keyPrefix: `bcos:${config.environment}:`,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
    };
    
    if (config.redisUsername) {
      redisOptions.username = config.redisUsername;
    }
    if (config.redisPassword) {
      redisOptions.password = config.redisPassword;
    }
    if (config.redisTls) {
      redisOptions.tls = {};
    }

    redisClient = new Redis(redisOptions);

    // Wait for Redis to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
      if (redisClient) {
        redisClient.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        redisClient.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      } else {
        clearTimeout(timeout);
        reject(new Error('Redis client not initialized'));
      }
    });

    logWorker('info', 'Worker connections established');

    // Get all active data sources
    const dataSources = await getActiveDataSources(mainDbClient);

    logWorker('info', 'Found data sources to warm', {
      count: dataSources.length,
    });

    // Warm each data source
    let totalEntriesCached = 0;
    let totalRows = 0;
    let successCount = 0;

    for (const ds of dataSources) {
      try {
        const result = await warmDataSource(ds, analyticsClient, redisClient);
        totalEntriesCached += result.entriesCached;
        totalRows += result.totalRows;
        successCount++;

        logWorker('info', 'Data source warmed successfully', {
          dataSourceId: ds.data_source_id,
          dataSourceName: ds.data_source_name,
          entriesCached: result.entriesCached,
          totalRows: result.totalRows,
        });
      } catch (error) {
        logWorker('error', 'Failed to warm data source', {
          dataSourceId: ds.data_source_id,
          dataSourceName: ds.data_source_name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const duration = Date.now() - startTime;

    logWorker('info', 'Worker thread cache warming completed', {
      dataSourcesWarmed: successCount,
      totalEntriesCached,
      totalRows,
      duration,
    });

    return {
      success: true,
      dataSourcesWarmed: successCount,
      totalEntriesCached,
      totalRows,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logWorker('error', 'Worker thread cache warming failed', {
      error: errorMessage,
      duration,
    });

    return {
      success: false,
      dataSourcesWarmed: 0,
      totalEntriesCached: 0,
      totalRows: 0,
      duration,
      error: errorMessage,
    };
  } finally {
    // Clean up connections
    try {
      if (redisClient) {
        await redisClient.quit();
      }
      if (analyticsClient) {
        await analyticsClient.end();
      }
      if (mainDbClient) {
        await mainDbClient.end();
      }
    } catch (cleanupError) {
      logWorker('warn', 'Error during connection cleanup', {
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
  }
}

/**
 * Get all active data sources from the database
 */
async function getActiveDataSources(dbClient: postgres.Sql): Promise<DataSourceInfo[]> {
  const result = await dbClient`
    SELECT 
      data_source_id,
      data_source_name,
      data_source_type,
      table_name,
      schema_name,
      is_active
    FROM chart_data_sources
    WHERE is_active = true
    ORDER BY data_source_id
  `;

  return result as unknown as DataSourceInfo[];
}

/**
 * Warm a single data source
 */
async function warmDataSource(
  ds: DataSourceInfo,
  analyticsClient: postgres.Sql,
  redisClient: Redis
): Promise<{ entriesCached: number; totalRows: number }> {
  // Use centralized lock key pattern for consistency across services
  const lockKey = buildWarmingLockKey(ds.data_source_id);
  const lockTtl = 300; // 5 minutes

  // Try to acquire distributed lock
  const lockAcquired = await redisClient.set(lockKey, '1', 'EX', lockTtl, 'NX');
  
  if (lockAcquired !== 'OK') {
    logWorker('debug', 'Skipping data source - lock already held', {
      dataSourceId: ds.data_source_id,
    });
    return { entriesCached: 0, totalRows: 0 };
  }

  try {
    if (ds.data_source_type === 'table-based') {
      return await warmTableBasedDataSource(ds, analyticsClient, redisClient);
    } else {
      return await warmMeasureBasedDataSource(ds, analyticsClient, redisClient);
    }
  } finally {
    // Release lock with error handling (audit-4)
    try {
      await redisClient.del(lockKey);
    } catch (releaseError) {
      // Log but don't throw - lock will auto-expire after TTL
      logWorker('error', 'Failed to release warming lock', {
        dataSourceId: ds.data_source_id,
        lockKey,
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
        note: 'Lock will auto-expire after TTL',
      });
    }
  }
}

/**
 * Warm a table-based data source
 */
async function warmTableBasedDataSource(
  ds: DataSourceInfo,
  analyticsClient: postgres.Sql,
  redisClient: Redis
): Promise<{ entriesCached: number; totalRows: number }> {
  if (!ds.table_name || !ds.schema_name) {
    throw new Error(`Table-based data source ${ds.data_source_id} missing table/schema config`);
  }

  // Security: validate schema using centralized whitelist
  if (!isSchemaAllowed(ds.schema_name)) {
    throw new Error(
      `Invalid schema: ${ds.schema_name}. Allowed: ${ALLOWED_ANALYTICS_SCHEMAS.join(', ')}`
    );
  }

  // Security: validate table name using centralized pattern
  if (!isTableNameValid(ds.table_name)) {
    throw new Error(`Invalid table name format: ${ds.table_name}`);
  }

  // Build safe query using quoted identifiers
  const maxRows = 100000;
  const safeTableRef = buildSafeTableReference(ds.schema_name, ds.table_name);
  const query = `SELECT * FROM ${safeTableRef} LIMIT ${maxRows}`;
  const rows = await analyticsClient.unsafe(query);

  if (rows.length === 0) {
    return { entriesCached: 0, totalRows: 0 };
  }

  // Cache the data
  const cacheKey = `datasource:${ds.data_source_id}:table:p:*:prov:*`;
  const cacheData = {
    rows,
    rowCount: rows.length,
    cachedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 172800 * 1000).toISOString(),
    sizeBytes: 0,
    keyComponents: { dataSourceId: ds.data_source_id, dataSourceType: 'table-based' },
  };
  
  const jsonString = JSON.stringify(cacheData);
  await redisClient.setex(cacheKey, 172800, jsonString);

  // Set metadata
  const metadataKey = `cache:meta:{ds:${ds.data_source_id}}:last_warm`;
  await redisClient.setex(metadataKey, 172800, JSON.stringify([{ timestamp: new Date().toISOString() }]));

  return { entriesCached: 1, totalRows: rows.length };
}

/**
 * Warm a measure-based data source
 */
async function warmMeasureBasedDataSource(
  ds: DataSourceInfo,
  analyticsClient: postgres.Sql,
  redisClient: Redis
): Promise<{ entriesCached: number; totalRows: number }> {
  if (!ds.table_name || !ds.schema_name) {
    throw new Error(`Measure-based data source ${ds.data_source_id} missing table/schema config`);
  }

  // Security: validate schema using centralized whitelist
  if (!isSchemaAllowed(ds.schema_name)) {
    throw new Error(
      `Invalid schema: ${ds.schema_name}. Allowed: ${ALLOWED_ANALYTICS_SCHEMAS.join(', ')}`
    );
  }

  // Security: validate table name using centralized pattern
  if (!isTableNameValid(ds.table_name)) {
    throw new Error(`Invalid table name format: ${ds.table_name}`);
  }

  // Build safe query using quoted identifiers (prevents SQL injection)
  const safeTableRef = buildSafeTableReference(ds.schema_name, ds.table_name);
  const query = `SELECT * FROM ${safeTableRef}`;
  const allRows = await analyticsClient.unsafe(query) as Record<string, unknown>[];

  if (allRows.length === 0) {
    return { entriesCached: 0, totalRows: 0 };
  }

  // Group by unique key combinations
  const grouped = new Map<string, Record<string, unknown>[]>();
  
  for (const row of allRows) {
    const measure = row.measure as string | undefined;
    const practiceUid = row.practice_uid as number | undefined;
    const providerUid = (row.provider_uid as number | null | undefined) || null;
    const frequency = (row.time_period || row.frequency) as string | undefined;

    if (!measure || !practiceUid || !frequency) {
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

  // Write to Redis using pipeline
  let pipeline = redisClient.pipeline();
  const ttl = 172800; // 48 hours
  let entriesCached = 0;
  const batchSize = 500;

  for (const [key, rows] of Array.from(grouped.entries())) {
    const parts = key.split('|');
    const measure = parts[0];
    const practiceUid = parts[1];
    const providerUid = parts[2];
    const frequency = parts[3];

    // Build cache key
    const cacheKey = `cache:{ds:${ds.data_source_id}}:m:${measure}:p:${practiceUid}:prov:${providerUid}:freq:${frequency}`;
    
    // Build index keys
    const baseIndexKey = `idx:{ds:${ds.data_source_id}}:m:${measure}:freq:${frequency}`;
    const practiceIndexKey = `idx:{ds:${ds.data_source_id}}:m:${measure}:p:${practiceUid}:freq:${frequency}`;
    const providerIndexKey = `idx:{ds:${ds.data_source_id}}:m:${measure}:freq:${frequency}:prov:${providerUid}`;

    try {
      const serialized = JSON.stringify(rows);
      
      // Skip if too large
      if (serialized.length > 100 * 1024 * 1024) {
        continue;
      }

      pipeline.setex(cacheKey, ttl, serialized);
      pipeline.sadd(baseIndexKey, cacheKey);
      pipeline.expire(baseIndexKey, ttl);
      pipeline.sadd(practiceIndexKey, cacheKey);
      pipeline.expire(practiceIndexKey, ttl);
      pipeline.sadd(providerIndexKey, cacheKey);
      pipeline.expire(providerIndexKey, ttl);

      entriesCached++;

      // Execute batch and recreate pipeline for next batch
      if (entriesCached % batchSize === 0) {
        await pipeline.exec();
        pipeline = redisClient.pipeline(); // Recreate pipeline for next batch
      }
    } catch {
      // Skip entries that fail to serialize
    }
  }

  // Execute remaining pipeline (if there are uncommitted commands)
  if (entriesCached % batchSize !== 0) {
    await pipeline.exec();
  }

  // Set metadata
  const metadataKey = `cache:meta:{ds:${ds.data_source_id}}:last_warm`;
  const metadata = {
    timestamp: new Date().toISOString(),
    uniqueMeasures: new Set(Array.from(grouped.keys()).map(k => k.split('|')[0])).size,
    uniquePractices: new Set(Array.from(grouped.keys()).map(k => k.split('|')[1])).size,
    uniqueProviders: new Set(Array.from(grouped.keys()).map(k => k.split('|')[2])).size,
    totalEntries: entriesCached,
  };
  await redisClient.setex(metadataKey, ttl, JSON.stringify([metadata]));

  return { entriesCached, totalRows: allRows.length };
}

// Execute warming and send result back to main thread
runWarming()
  .then((result) => {
    parentPort?.postMessage(result);
    // Small delay to ensure message is fully transmitted before exit
    setTimeout(() => process.exit(0), 100);
  })
  .catch((error) => {
    parentPort?.postMessage({
      success: false,
      dataSourcesWarmed: 0,
      totalEntriesCached: 0,
      totalRows: 0,
      duration: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    // Small delay to ensure error message is fully transmitted before exit
    setTimeout(() => process.exit(1), 100);
  });

