/**
 * Dashboard Query Cache
 *
 * Phase 7: Query Deduplication
 *
 * Provides query deduplication within a single dashboard render by generating
 * deterministic hashes based on query-affecting parameters.
 *
 * Key Concepts:
 * - Hash includes ONLY parameters that affect the database query
 * - Excludes transformation-only parameters (chartType, colorPalette, etc.)
 * - Used to cache query promises (not data) for in-flight deduplication
 * - Scope: Per-render only (not a global cache)
 */

import { createHash } from 'node:crypto';
import { log } from '@/lib/logger';

/**
 * Parameters that affect the actual database query
 * Excludes transformation-only parameters
 */
export interface QuerySignature {
  dataSourceId: number;
  measure?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  practiceUids?: number[];
  providerName?: string;
  advancedFilters?: unknown[];

  // Include groupBy ONLY if it affects data fetching
  // For most charts, groupBy is applied during transformation, not in query
  groupBy?: string;
}

/**
 * Generate deterministic hash for query deduplication
 *
 * The hash is based on parameters that affect what data is fetched from the database.
 * Parameters that only affect how data is transformed/displayed are excluded.
 *
 * **Included in hash:**
 * - dataSourceId: Which table to query
 * - measure: Which measure to fetch (e.g., 'total_charges')
 * - frequency: Time granularity (e.g., 'monthly', 'weekly')
 * - startDate/endDate: Date range filtering
 * - practiceUids: RBAC filtering (which practices user can see)
 * - providerName: Provider filtering
 * - advancedFilters: Complex filter expressions
 *
 * **Excluded from hash:**
 * - chartType: Visual representation only (line, bar, area)
 * - colorPalette: Visual styling only
 * - stackingMode: Visual layout only
 * - responsive: UI property
 * - aggregation: Applied to already-aggregated data
 *
 * @param config - Chart configuration
 * @param runtimeFilters - Runtime filters
 * @returns SHA256 hash of query signature (64 characters)
 *
 * @example
 * ```typescript
 * const hash1 = generateQueryHash(
 *   { dataSourceId: 1, chartType: 'line' },
 *   { measure: 'total_charges', frequency: 'monthly' }
 * );
 *
 * const hash2 = generateQueryHash(
 *   { dataSourceId: 1, chartType: 'bar' }, // Different chart type
 *   { measure: 'total_charges', frequency: 'monthly' }
 * );
 *
 * // hash1 === hash2 (chart type doesn't affect query)
 * ```
 */
export function generateQueryHash(
  config: Record<string, unknown>,
  runtimeFilters: Record<string, unknown>
): string {
  const signature: Partial<QuerySignature> = {
    dataSourceId: config.dataSourceId as number,
  };

  // Only include properties that are defined
  if (runtimeFilters.measure) signature.measure = runtimeFilters.measure as string;
  if (runtimeFilters.frequency) signature.frequency = runtimeFilters.frequency as string;
  if (runtimeFilters.startDate) signature.startDate = runtimeFilters.startDate as string;
  if (runtimeFilters.endDate) signature.endDate = runtimeFilters.endDate as string;
  if (runtimeFilters.practiceUids) signature.practiceUids = runtimeFilters.practiceUids as number[];
  if (runtimeFilters.providerName) signature.providerName = runtimeFilters.providerName as string;
  if (runtimeFilters.advancedFilters && Array.isArray(runtimeFilters.advancedFilters))
    signature.advancedFilters = runtimeFilters.advancedFilters;

  // Include groupBy ONLY for charts that fetch at different granularity
  // Currently, groupBy is transformation-only for all chart types
  // If future chart types need groupBy in query, update shouldIncludeGroupByInQuery()
  if (shouldIncludeGroupByInQuery(config.chartType as string, config.groupBy as string)) {
    signature.groupBy = config.groupBy as string;
  }

  // Create deterministic string representation
  // Sort keys to ensure consistent ordering
  const sortedKeys = Object.keys(signature).sort();
  const sortedSignature: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const value = signature[key as keyof QuerySignature];
    if (value !== undefined && value !== null) {
      sortedSignature[key] = value;
    }
  }

  const signatureString = JSON.stringify(sortedSignature);

  // Generate SHA256 hash
  const hash = createHash('sha256').update(signatureString).digest('hex');

  log.debug('Query hash generated', {
    dataSourceId: signature.dataSourceId,
    measure: signature.measure,
    frequency: signature.frequency,
    hashLength: hash.length,
    signatureKeys: Object.keys(sortedSignature),
  });

  return hash;
}

/**
 * Determine if groupBy affects the database query
 *
 * For most charts, groupBy is applied during transformation (after fetching).
 * Some chart types may require groupBy in the query itself.
 *
 * @param chartType - Type of chart (line, bar, table, etc.)
 * @param groupBy - GroupBy parameter value
 * @returns true if groupBy should be included in query hash
 */
function shouldIncludeGroupByInQuery(_chartType: string, groupBy?: string): boolean {
  // Currently, groupBy is transformation-only for all chart types
  // The raw data is fetched without grouping, then grouped during transformation

  // If future chart types need groupBy in the query, add them here:
  // if (chartType === 'some-special-chart') return true;

  // Exception: If groupBy is explicitly set to 'none', it doesn't affect anything
  if (!groupBy || groupBy === 'none') {
    return false;
  }

  // Default: groupBy is transformation-only
  return false;
}

/**
 * Query cache for deduplication within a single dashboard render
 *
 * Lifecycle:
 * - Created at start of dashboard render
 * - Cleared at end of dashboard render
 * - NOT a global cache (scoped to single render)
 *
 * Why cache promises?
 * - Multiple charts can await the same in-flight query
 * - Prevents race conditions
 * - Ensures all charts get identical data
 */
export class DashboardQueryCache {
  private cache: Map<string, Promise<unknown>> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    uniqueQueries: 0,
  };

  /**
   * Get cached query promise or execute new query
   *
   * @param queryHash - Hash of query signature
   * @param executor - Function to execute if cache miss
   * @returns Promise resolving to query results
   */
  async get<T = unknown>(queryHash: string, executor: () => Promise<T>): Promise<T> {
    if (this.cache.has(queryHash)) {
      this.stats.hits++;

      log.info('Query cache hit', {
        queryHash: queryHash.substring(0, 16),
        cacheSize: this.cache.size,
        deduplication: 'hit',
      });

      const cached = this.cache.get(queryHash);
      if (!cached) {
        throw new Error(`Cache inconsistency: hash exists but value is undefined`);
      }
      return cached as Promise<T>;
    }

    // Cache miss - execute query and store promise
    this.stats.misses++;
    this.stats.uniqueQueries++;

    log.info('Query cache miss - executing query', {
      queryHash: queryHash.substring(0, 16),
      cacheSize: this.cache.size,
      deduplication: 'miss',
    });

    const promise = executor();
    this.cache.set(queryHash, promise);

    return promise;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalRequests: this.stats.hits + this.stats.misses,
      deduplicationRate:
        this.stats.hits + this.stats.misses > 0
          ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100)
          : 0,
    };
  }

  /**
   * Clear cache and reset statistics
   * Called at end of dashboard render
   */
  clear() {
    const stats = this.getStats();

    log.info('Query cache cleared', {
      uniqueQueries: this.stats.uniqueQueries,
      queriesDeduped: this.stats.hits,
      deduplicationRate: `${stats.deduplicationRate}%`,
      totalRequests: stats.totalRequests,
    });

    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      uniqueQueries: 0,
    };
  }

  /**
   * Get cache size (for debugging)
   */
  size(): number {
    return this.cache.size;
  }
}
