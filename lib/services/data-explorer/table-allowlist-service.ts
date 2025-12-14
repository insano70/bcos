/**
 * Table Allow-List Service
 * Provides a set of allowed tables for Data Explorer queries based on explorer_table_metadata
 *
 * SECURITY: Only tables registered in explorer_table_metadata with is_active=true
 * can be queried through the Data Explorer. This prevents access to arbitrary tables.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { explorerTableMetadata } from '@/lib/db/schema';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

/**
 * Cached allow-list with TTL
 */
interface CachedAllowList {
  tables: Set<string>;
  timestamp: number;
}

// In-memory cache for table allow-list
// TTL: 5 minutes (tables don't change frequently)
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedAllowList: CachedAllowList | null = null;

/**
 * Get the set of allowed tables from explorer_table_metadata
 * Returns both schema.table and table-only formats for flexible matching
 *
 * @param forceRefresh - Bypass cache and fetch fresh data
 * @returns Set of allowed table names
 */
export async function getAllowedTables(forceRefresh = false): Promise<Set<string>> {
  const startTime = Date.now();

  // Check cache
  if (!forceRefresh && cachedAllowList) {
    const age = Date.now() - cachedAllowList.timestamp;
    if (age < CACHE_TTL_MS) {
      return cachedAllowList.tables;
    }
  }

  try {
    // Fetch active tables from metadata
    const tables = await db
      .select({
        schema_name: explorerTableMetadata.schema_name,
        table_name: explorerTableMetadata.table_name,
      })
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.is_active, true));

    // Build allow-list with multiple formats for matching
    const allowedTables = new Set<string>();

    for (const { schema_name, table_name } of tables) {
      // Add fully qualified name (schema.table)
      allowedTables.add(`${schema_name}.${table_name}`);

      // Add table-only name (for queries that don't specify schema)
      allowedTables.add(table_name);

      // Add with quotes for PostgreSQL identifier handling
      allowedTables.add(`"${schema_name}"."${table_name}"`);
      allowedTables.add(`"${table_name}"`);
    }

    // Update cache
    cachedAllowList = {
      tables: allowedTables,
      timestamp: Date.now(),
    };

    const duration = Date.now() - startTime;

    log.info('Table allow-list refreshed', {
      operation: 'refresh_table_allowlist',
      tableCount: tables.length,
      allowListSize: allowedTables.size,
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'table-allowlist-service',
    });

    return allowedTables;
  } catch (error) {
    log.error('Failed to fetch table allow-list', error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'refresh_table_allowlist',
      component: 'table-allowlist-service',
    });

    // If cache exists, return stale data rather than failing
    if (cachedAllowList) {
      log.warn('Returning stale table allow-list due to error', {
        operation: 'refresh_table_allowlist',
        cacheAge: Date.now() - cachedAllowList.timestamp,
        component: 'table-allowlist-service',
      });
      return cachedAllowList.tables;
    }

    // No cache available, return empty set (fail-closed)
    return new Set<string>();
  }
}

/**
 * Check if a specific table is allowed
 *
 * @param schemaName - Schema name (e.g., 'ih')
 * @param tableName - Table name
 * @returns true if table is in allow-list
 */
export async function isTableAllowed(schemaName: string | null, tableName: string): Promise<boolean> {
  const allowedTables = await getAllowedTables();

  // Check various formats
  if (schemaName) {
    if (allowedTables.has(`${schemaName}.${tableName}`)) return true;
    if (allowedTables.has(`"${schemaName}"."${tableName}"`)) return true;
  }

  if (allowedTables.has(tableName)) return true;
  if (allowedTables.has(`"${tableName}"`)) return true;

  return false;
}

/**
 * Invalidate the allow-list cache
 * Call this when tables are added/removed from explorer_table_metadata
 */
export function invalidateAllowListCache(): void {
  cachedAllowList = null;

  log.info('Table allow-list cache invalidated', {
    operation: 'invalidate_allowlist_cache',
    component: 'table-allowlist-service',
  });
}

/**
 * Get tables by tier (for tiered access control if needed)
 *
 * @param maxTier - Maximum tier to include (1 = most trusted, 3 = least trusted)
 * @returns Set of allowed table names for the tier
 */
export async function getAllowedTablesByTier(maxTier: 1 | 2 | 3): Promise<Set<string>> {
  const startTime = Date.now();

  try {
    // Fetch all active tables with tier info, then filter in memory
    // (drizzle doesn't have <= operator built-in for tier comparison)
    const filteredTables = await db
      .select({
        schema_name: explorerTableMetadata.schema_name,
        table_name: explorerTableMetadata.table_name,
        tier: explorerTableMetadata.tier,
      })
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.is_active, true));

    const allowedTables = new Set<string>();

    for (const { schema_name, table_name, tier } of filteredTables) {
      if (tier !== null && tier <= maxTier) {
        allowedTables.add(`${schema_name}.${table_name}`);
        allowedTables.add(table_name);
      }
    }

    const duration = Date.now() - startTime;

    log.info('Tier-filtered table allow-list fetched', {
      operation: 'get_allowlist_by_tier',
      maxTier,
      tableCount: allowedTables.size / 2, // Divide by 2 since we add both formats
      duration,
      component: 'table-allowlist-service',
    });

    return allowedTables;
  } catch (error) {
    log.error('Failed to fetch tier-filtered allow-list', error instanceof Error ? error : new Error('Unknown error'), {
      operation: 'get_allowlist_by_tier',
      maxTier,
      component: 'table-allowlist-service',
    });

    return new Set<string>();
  }
}
