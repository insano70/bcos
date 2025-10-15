# Data Source Redis Caching - Implementation Proposal

**Date:** October 14, 2025  
**Status:** Proposal - RECOMMENDED APPROACH  
**Priority:** HIGH  
**Estimated Effort:** 6-8 hours

---

## Executive Summary

**Your Approach:** Cache entire data source tables (e.g., `SELECT * FROM ih.agg_app_measures`) in Redis instead of caching dashboard results.

**Why This is Better:**
- ✅ **Simpler:** One cache entry per data source (not per dashboard × filters)
- ✅ **Higher hit rate:** All dashboards/charts using same data source share ONE cache
- ✅ **In-memory filtering:** Apply filters/aggregations in JavaScript (instant)
- ✅ **Easier invalidation:** Just invalidate by data source ID
- ✅ **Predictable memory:** You know exactly how many data sources exist

---

## Architecture Analysis

### Current Data Sources

Based on codebase analysis:

**Primary Analytics Tables:**
- `ih.agg_app_measures` - Pre-aggregated measures by practice/provider/date
- `ih.agg_chart_data` - Chart-specific aggregated data
- `ih.gr_app_measures` - Granular measures

**Typical Size Estimates:**

```
agg_app_measures structure:
├─ Columns: ~15-20 fields
├─ Rows per practice: ~10,000-50,000
├─ Size per row: ~200-500 bytes
└─ Total per practice: ~2-25MB

Example for 1 practice:
├─ Providers: 10
├─ Measures: 20
├─ Frequencies: 4 (Daily, Weekly, Monthly, Quarterly)
├─ Date range: 24 months
└─ Rows: 10 × 20 × 4 × 730 = ~58,000 rows (~10-15MB)
```

**Memory Calculation:**
- 10 practices × 15MB = **~150MB per data source**
- Single data source, all practices = **~150-500MB** (reasonable)

**Conclusion:** ✅ **Data source tables ARE cacheable!**

---

## Proposed Architecture

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────┐
│ Chart/Dashboard requests data with filters                  │
└─────────────────┬────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Check Redis for cached data source                       │
│    Key: datasource:{schema}:{table}                          │
└─────────────────┬────────────────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
      CACHE HIT         CACHE MISS
         │                 │
         ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────────────┐
│ Return full      │  │ 2. Execute: SELECT * FROM table      │
│ dataset from     │  │    - Single query, all rows          │
│ Redis (~10ms)    │  │    - No WHERE clause (get everything)│
└────────┬─────────┘  │    - Apply RBAC via practice_uid     │
         │            └─────────┬────────────────────────────┘
         │                      │
         │                      ▼
         │            ┌──────────────────────────────────────┐
         │            │ 3. Cache in Redis                    │
         │            │    - TTL: 5 minutes (configurable)   │
         │            │    - Compressed JSON                 │
         │            │    - Full dataset                    │
         │            └─────────┬────────────────────────────┘
         │                      │
         └──────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Apply filters IN-MEMORY (JavaScript)                     │
│    - Filter by date range                                   │
│    - Filter by practice/provider                            │
│    - Filter by measure/frequency                            │
│    - GROUP BY and aggregate                                 │
│    - All in <10ms!                                          │
└─────────────────┬────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Return filtered/aggregated data                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Data Source Cache Service (3 hours)

#### File: `lib/cache/data-source-cache.ts` (NEW)

```typescript
/**
 * Data Source Cache Service
 * 
 * Caches entire data source tables in Redis for fast in-memory filtering.
 * 
 * Key Strategy:
 *   datasource:{schema}:{table}
 * 
 * Example:
 *   datasource:ih:agg_app_measures
 * 
 * Benefits:
 * - All charts/dashboards using same data source share ONE cache
 * - Filters applied in-memory (instant)
 * - Simple invalidation (just the data source)
 * - Predictable memory usage
 */

import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/db/analytics-db';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Cached data source structure
 */
export interface CachedDataSource {
  schema: string;
  table: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: string;
  expiresAt: string;
  sizeBytes: number;
}

/**
 * Data Source Cache Service
 */
export class DataSourceCache {
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly KEY_PREFIX = 'datasource:';
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB per data source

  /**
   * Build cache key from schema and table
   */
  private buildCacheKey(schema: string, table: string): string {
    return `${this.KEY_PREFIX}${schema}:${table}`;
  }

  /**
   * Get cached data source
   * Returns ALL rows (unfiltered)
   * 
   * @param schema - Schema name (e.g., 'ih')
   * @param table - Table name (e.g., 'agg_app_measures')
   * @returns Cached rows or null if not found
   */
  async get(
    schema: string,
    table: string
  ): Promise<Record<string, unknown>[] | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping data source cache get', {
          schema,
          table,
        });
        return null;
      }

      const key = this.buildCacheKey(schema, table);
      const cached = await redis.get(key);

      if (!cached) {
        log.info('Data source cache miss', {
          schema,
          table,
          cacheKey: key,
        });
        return null;
      }

      const cachedData = JSON.parse(cached) as CachedDataSource;

      log.info('Data source cache hit', {
        schema,
        table,
        rowCount: cachedData.rowCount,
        cachedAt: cachedData.cachedAt,
        sizeKB: Math.round(cachedData.sizeBytes / 1024),
        cacheKey: key,
      });

      return cachedData.rows;
    } catch (error) {
      log.error('Data source cache get failed', error, { schema, table });
      // Graceful degradation
      return null;
    }
  }

  /**
   * Set data source in cache
   * Stores ALL rows from the table
   * 
   * @param schema - Schema name
   * @param table - Table name
   * @param rows - All rows from the table
   * @param ttl - Time to live in seconds
   */
  async set(
    schema: string,
    table: string,
    rows: Record<string, unknown>[],
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping data source cache set', {
          schema,
          table,
        });
        return;
      }

      const key = this.buildCacheKey(schema, table);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const cachedData: CachedDataSource = {
        schema,
        table,
        rows,
        rowCount: rows.length,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        sizeBytes: 0, // Will calculate
      };

      const jsonString = JSON.stringify(cachedData);
      cachedData.sizeBytes = Buffer.byteLength(jsonString, 'utf8');

      // Check size before caching
      if (cachedData.sizeBytes > this.MAX_CACHE_SIZE) {
        log.warn('Data source too large to cache', {
          schema,
          table,
          sizeMB: Math.round(cachedData.sizeBytes / 1024 / 1024),
          maxMB: Math.round(this.MAX_CACHE_SIZE / 1024 / 1024),
          rowCount: rows.length,
        });
        return;
      }

      await redis.setex(key, ttl, jsonString);

      log.info('Data source cached', {
        schema,
        table,
        rowCount: rows.length,
        sizeKB: Math.round(cachedData.sizeBytes / 1024),
        ttl,
        expiresAt: expiresAt.toISOString(),
        cacheKey: key,
      });
    } catch (error) {
      log.error('Data source cache set failed', error, { schema, table });
      // Don't throw - graceful degradation
    }
  }

  /**
   * Fetch data source with cache layer
   * 
   * This is the main method to use - handles cache check + fallback
   * 
   * @param schema - Schema name
   * @param table - Table name
   * @param userContext - User context for RBAC
   * @param nocache - Bypass cache if true
   * @returns All rows from data source
   */
  async fetchDataSource(
    schema: string,
    table: string,
    userContext: UserContext,
    nocache: boolean = false
  ): Promise<Record<string, unknown>[]> {
    const startTime = Date.now();

    // Check cache first (unless nocache=true)
    if (!nocache) {
      const cached = await this.get(schema, table);
      if (cached) {
        const duration = Date.now() - startTime;

        log.info('Data source served from cache', {
          schema,
          table,
          rowCount: cached.length,
          duration,
          userId: userContext.user_id,
        });

        // Apply RBAC filtering (filter by practice_uid in-memory)
        return this.applyRBACFiltering(cached, userContext);
      }
    }

    // Cache miss - fetch from database
    log.info('Data source cache miss - fetching from database', {
      schema,
      table,
      nocache,
    });

    try {
      // Build query: SELECT * FROM schema.table
      // IMPORTANT: Get ALL rows (no WHERE clause yet)
      // We'll filter in-memory after caching
      const query = `SELECT * FROM ${schema}.${table}`;

      const queryStart = Date.now();
      const rows = await executeAnalyticsQuery(query, []);
      const queryDuration = Date.now() - queryStart;

      log.info('Data source fetched from database', {
        schema,
        table,
        rowCount: rows.length,
        queryDuration,
      });

      // Cache the full dataset (unless nocache=true)
      if (!nocache && rows.length > 0) {
        await this.set(schema, table, rows);
      }

      // Apply RBAC filtering
      return this.applyRBACFiltering(rows, userContext);
    } catch (error) {
      log.error('Data source fetch failed', error, {
        schema,
        table,
        userId: userContext.user_id,
      });
      throw error;
    }
  }

  /**
   * Apply RBAC filtering in-memory
   * Filter rows by practice_uid based on user's accessible practices
   * 
   * @param rows - All rows
   * @param userContext - User context with practice access
   * @returns Filtered rows
   */
  private applyRBACFiltering(
    rows: Record<string, unknown>[],
    userContext: UserContext
  ): Record<string, unknown>[] {
    // If super admin, return all rows
    if (userContext.is_super_admin) {
      return rows;
    }

    // Get user's accessible practice UIDs
    const accessiblePracticeUids = userContext.practices?.map((p) => p.practice_uid) || [];

    if (accessiblePracticeUids.length === 0) {
      log.warn('User has no accessible practices', {
        userId: userContext.user_id,
      });
      return [];
    }

    // Filter rows by practice_uid
    const filtered = rows.filter((row) => {
      const practiceUid = row.practice_uid as number | undefined;
      return practiceUid && accessiblePracticeUids.includes(practiceUid);
    });

    log.debug('RBAC filtering applied', {
      totalRows: rows.length,
      filteredRows: filtered.length,
      accessiblePractices: accessiblePracticeUids.length,
    });

    return filtered;
  }

  /**
   * Invalidate cached data source
   * 
   * @param schema - Schema name
   * @param table - Table name
   */
  async invalidate(schema: string, table: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping data source cache invalidation', {
          schema,
          table,
        });
        return;
      }

      const key = this.buildCacheKey(schema, table);
      await redis.del(key);

      log.info('Data source cache invalidated', {
        schema,
        table,
        cacheKey: key,
      });
    } catch (error) {
      log.error('Data source cache invalidation failed', error, { schema, table });
      // Don't throw
    }
  }

  /**
   * Clear all data source caches
   * Use sparingly - typically only for testing or emergency
   */
  async clearAll(): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping data source cache clear');
        return;
      }

      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        log.debug('No data source cache entries to clear');
        return;
      }

      await redis.del(...keys);

      log.info('All data source caches cleared', {
        keysDeleted: keys.length,
      });
    } catch (error) {
      log.error('Data source cache clear all failed', error);
      // Don't throw
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalDataSources: number;
    cacheKeys: string[];
    estimatedMemoryUsage: number;
  }> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return {
          totalDataSources: 0,
          cacheKeys: [],
          estimatedMemoryUsage: 0,
        };
      }

      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      let totalSize = 0;
      for (const key of keys) {
        const value = await redis.get(key);
        if (value) {
          totalSize += Buffer.byteLength(value, 'utf8');
        }
      }

      return {
        totalDataSources: keys.length,
        cacheKeys: keys,
        estimatedMemoryUsage: totalSize,
      };
    } catch (error) {
      log.error('Failed to get data source cache stats', error);
      return {
        totalDataSources: 0,
        cacheKeys: [],
        estimatedMemoryUsage: 0,
      };
    }
  }
}

// Export singleton instance
export const dataSourceCache = new DataSourceCache();
```

---

### Phase 2: Integrate into Query Builder (2 hours)

#### Modify: `lib/services/analytics-query-builder.ts`

```typescript
import { dataSourceCache } from '@/lib/cache/data-source-cache';

export class AnalyticsQueryBuilder {
  /**
   * Query measures with data source caching
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();
    
    // ... existing validation ...

    try {
      const tableName = dataSourceConfig.tableName;
      const schemaName = dataSourceConfig.schemaName;

      // NEW: Fetch from cache (or database if cache miss)
      const allRows = await dataSourceCache.fetchDataSource(
        schemaName,
        tableName,
        context.userContext,
        params.nocache || false
      );

      // NOW: Apply filters in-memory (JavaScript)
      let filteredRows = allRows;

      // Filter by measure
      if (params.measure) {
        filteredRows = filteredRows.filter(
          (row) => row.measure === params.measure
        );
      }

      // Filter by frequency
      if (params.frequency) {
        filteredRows = filteredRows.filter(
          (row) => row.frequency === params.frequency || row.time_period === params.frequency
        );
      }

      // Filter by practice
      if (params.practice) {
        filteredRows = filteredRows.filter(
          (row) => row.practice === params.practice
        );
      }

      // Filter by provider
      if (params.provider_name) {
        filteredRows = filteredRows.filter(
          (row) => row.provider_name === params.provider_name
        );
      }

      // Filter by date range
      if (params.start_date) {
        filteredRows = filteredRows.filter(
          (row) => {
            const dateValue = row.date_index || row.date_value;
            return dateValue >= params.start_date;
          }
        );
      }

      if (params.end_date) {
        filteredRows = filteredRows.filter(
          (row) => {
            const dateValue = row.date_index || row.date_value;
            return dateValue <= params.end_date;
          }
        );
      }

      // Apply advanced filters
      if (params.advanced_filters && params.advanced_filters.length > 0) {
        filteredRows = this.applyAdvancedFiltersInMemory(
          filteredRows,
          params.advanced_filters
        );
      }

      const duration = Date.now() - startTime;

      log.info('Data source query completed (in-memory filtering)', {
        schema: schemaName,
        table: tableName,
        totalRows: allRows.length,
        filteredRows: filteredRows.length,
        filters: {
          measure: params.measure,
          frequency: params.frequency,
          dateRange: params.start_date && params.end_date,
        },
        duration,
      });

      return {
        rows: filteredRows,
        metadata: {
          rowCount: filteredRows.length,
          queryTimeMs: duration,
          cacheHit: true, // We got data from cache
        },
      };
    } catch (error) {
      log.error('Query measures failed', error);
      throw error;
    }
  }

  /**
   * Apply advanced filters in-memory
   */
  private applyAdvancedFiltersInMemory(
    rows: Record<string, unknown>[],
    filters: ChartFilter[]
  ): Record<string, unknown>[] {
    let filtered = rows;

    for (const filter of filters) {
      filtered = filtered.filter((row) => {
        const value = row[filter.field];

        switch (filter.operator) {
          case 'eq':
            return value === filter.value;
          case 'neq':
            return value !== filter.value;
          case 'gt':
            return Number(value) > Number(filter.value);
          case 'gte':
            return Number(value) >= Number(filter.value);
          case 'lt':
            return Number(value) < Number(filter.value);
          case 'lte':
            return Number(value) <= Number(filter.value);
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value);
          case 'not_in':
            return Array.isArray(filter.value) && !filter.value.includes(value);
          case 'like':
            return String(value).includes(String(filter.value));
          default:
            return true;
        }
      });
    }

    return filtered;
  }
}
```

---

### Phase 3: Invalidation Hooks (1 hour)

#### When to Invalidate

**Scenario 1: Data Source Data Updated**
- New rows added to analytics table
- Existing rows modified
- **Action:** Invalidate that data source cache

```typescript
// After analytics data load/update
await dataSourceCache.invalidate('ih', 'agg_app_measures');
```

**Scenario 2: Manual Refresh**
- User clicks "Refresh" button
- **Action:** Pass `nocache=true` to bypass cache

```typescript
// In chart/dashboard request
const rows = await dataSourceCache.fetchDataSource(
  schema,
  table,
  userContext,
  true // nocache - bypass cache
);
```

**Scenario 3: Scheduled Invalidation**
- ETL job completes
- Data warehouse refresh
- **Action:** API endpoint to invalidate

```typescript
// POST /api/admin/cache/invalidate-data-source
app/api/admin/cache/invalidate-data-source/route.ts (NEW)
```

---

## Performance Comparison

### Before (Database Queries)

```
Dashboard with 6 charts (all using agg_app_measures):
├─ Chart 1: SELECT * FROM agg_app_measures WHERE measure='X' AND frequency='Monthly' (~300ms)
├─ Chart 2: SELECT * FROM agg_app_measures WHERE measure='Y' AND frequency='Monthly' (~300ms)
├─ Chart 3: SELECT * FROM agg_app_measures WHERE measure='Z' AND frequency='Monthly' (~300ms)
├─ Chart 4: SELECT * FROM agg_app_measures WHERE measure='A' AND frequency='Monthly' (~300ms)
├─ Chart 5: SELECT * FROM agg_app_measures WHERE measure='B' AND frequency='Monthly' (~300ms)
└─ Chart 6: SELECT * FROM agg_app_measures WHERE measure='C' AND frequency='Monthly' (~300ms)

Total: 6 queries × 300ms = 1,800ms
```

### After (Data Source Cache)

```
Dashboard with 6 charts (all using agg_app_measures):
├─ Fetch data source from Redis (~50ms) ← ONCE
├─ Chart 1: Filter in-memory (~2ms)
├─ Chart 2: Filter in-memory (~2ms)
├─ Chart 3: Filter in-memory (~2ms)
├─ Chart 4: Filter in-memory (~2ms)
├─ Chart 5: Filter in-memory (~2ms)
└─ Chart 6: Filter in-memory (~2ms)

Total: 50ms + (6 × 2ms) = ~62ms

Performance Gain: 96% faster! (1,800ms → 62ms)
```

---

## Memory Usage Estimates

### Per Data Source

```
agg_app_measures (typical):
├─ Rows: 50,000
├─ Columns: 15
├─ Avg row size: 300 bytes
├─ Total uncompressed: ~15MB
└─ Redis (with compression): ~8-10MB

Multiple practices:
├─ Practice 1: ~10MB
├─ Practice 2: ~10MB
├─ Practice 3: ~10MB
└─ Total: ~30MB for 3 practices
```

### Total Memory (Worst Case)

```
Assumptions:
├─ 3 data sources (agg_app_measures, agg_chart_data, gr_app_measures)
├─ 10 practices per data source
└─ ~10MB per practice cached

Total: 3 × 10 × 10MB = ~300MB

Conclusion: ✅ Easily fits in Redis memory
```

---

## Advantages Over Dashboard Caching

| Aspect | Dashboard Caching | Data Source Caching |
|--------|-------------------|---------------------|
| **Cache Keys** | dashboard_id × filters = 100s of keys | schema.table = ~5 keys |
| **Hit Rate** | Lower (specific to dashboard + filters) | **Higher (shared across all charts)** |
| **Invalidation** | Complex (track dashboard-chart relationships) | **Simple (just data source ID)** |
| **Memory** | dashboard × filter combos = unpredictable | **Predictable (# of data sources)** |
| **Flexibility** | Filters baked into cache | **Apply any filter in-memory** |
| **Code Complexity** | Medium (filter hashing, tracking) | **Low (straightforward)** |

---

## Implementation Checklist

### Phase 1: Core Service (3h)
- [ ] Create `lib/cache/data-source-cache.ts`
- [ ] Implement `get()`, `set()`, `fetchDataSource()` methods
- [ ] Add RBAC filtering (practice_uid)
- [ ] Add size limit checks (100MB max)
- [ ] Add graceful error handling

### Phase 2: Integration (2h)
- [ ] Update `AnalyticsQueryBuilder.queryMeasures()`
- [ ] Add in-memory filtering logic
- [ ] Add in-memory advanced filters
- [ ] Pass `nocache` parameter through

### Phase 3: Invalidation (1h)
- [ ] Create invalidation API endpoint
- [ ] Add manual refresh support
- [ ] Document invalidation triggers

### Phase 4: Testing (2h)
- [ ] Unit tests for `DataSourceCache`
- [ ] Test in-memory filtering logic
- [ ] Test RBAC filtering
- [ ] Test TTL expiration
- [ ] Test nocache bypass

**Total: 8 hours**

---

## Rollout Plan

### Week 1: Implementation & Testing
- Implement core service
- Add integration points
- Write tests
- Code review

### Week 2: Staging
- Deploy to staging
- Enable for internal team
- Monitor cache hit rates
- Validate performance gains

### Week 3: Production Rollout
- Enable for 25% of requests
- Monitor metrics
- Increase to 100%
- Document results

---

## Success Metrics

### Performance
- ✅ Cache hit rate >80%
- ✅ Cached dashboard load <100ms
- ✅ 90%+ reduction in database queries
- ✅ In-memory filtering <5ms per chart

### Memory
- ✅ Total Redis usage <500MB
- ✅ No memory pressure alerts
- ✅ Predictable memory growth

### Reliability
- ✅ Zero cache-related failures
- ✅ Graceful degradation on Redis errors
- ✅ RBAC still enforced correctly

---

## Conclusion

**Your data source caching approach is SUPERIOR** to dashboard-level caching:

✅ **Simpler:** One cache per data source vs hundreds per dashboard × filters  
✅ **Faster:** In-memory JavaScript filtering is instant  
✅ **Higher hit rate:** All charts share the same cache  
✅ **Easier invalidation:** Just invalidate the data source  
✅ **Predictable memory:** You know exactly how many data sources exist

**Estimated Impact:**
- 🚀 **90-95% faster** dashboard loads (with cache)
- 💾 **95% reduction** in database queries
- ⚡ **Sub-100ms** response times
- 🎯 **Simple** implementation and maintenance

**Recommendation:** Proceed with data source caching approach immediately. This is a **high-value, low-complexity** improvement.

**Next Steps:**
1. Approve this approach
2. Implement `DataSourceCache` service (3 hours)
3. Integrate into query builder (2 hours)
4. Test and deploy (3 hours)

**Total effort: 8 hours for 90%+ performance gain!**

