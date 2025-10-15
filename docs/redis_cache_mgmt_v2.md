# Redis Cache Management V2: Secondary Index Migration Plan

**Status:** Planning  
**Created:** 2025-10-15  
**Target Completion:** TBD  
**Priority:** HIGH - Fixes critical org filter bug + improves performance

---

## Executive Summary

### Current Problem
The existing Redis cache implementation has two critical issues:

1. **Security Bug:** Super admins with organization filters see unfiltered data (fixed temporarily with in-memory filtering workaround)
2. **Architecture Limitation:** Cache warming creates fragmented entries (measure+frequency combos) that result in cache misses for flexible queries

### Proposed Solution
Implement **Redis Secondary Index Sets** to enable:
- Single cache entry per unique (datasource, measure, practice_uid, provider_uid, frequency)
- O(1) index lookups instead of O(N) SCAN operations
- 100% cache hit rate when warm
- Selective fetching (only load needed practice/provider data)
- Sub-10ms query times regardless of cache size

### Migration Strategy
**Direct replacement** - no feature flags or gradual rollout. Current system has critical security bug that must be fixed immediately. Timeline: ~2.5 weeks from start to production.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Target Architecture](#target-architecture)
3. [Migration Phases](#migration-phases)
4. [Implementation Details](#implementation-details)
5. [Testing Strategy](#testing-strategy)
6. [Rollback Plan](#rollback-plan)
7. [Performance Benchmarks](#performance-benchmarks)
8. [Deployment Plan](#deployment-plan)

---

## Current State Analysis

### Current Cache Structure

**Cache Keys:**
```
datasource:1:m:Charges:p:*:prov:*:freq:Monthly
datasource:1:m:Charges:p:*:prov:*:freq:Weekly
datasource:1:m:Payments:p:*:prov:*:freq:Monthly
```

**Cache Warming (queryDatabase):**
```sql
SELECT * FROM ih.agg_app_measures
WHERE measure = $1 AND frequency = $2  -- Filtered by measure+frequency
```

**Lookup Flow:**
1. Try exact key: `datasource:1:m:Charges:p:114:prov:5:freq:Monthly`
2. Try fallback keys (hierarchy of 5 levels)
3. If all miss → query database with WHERE clause

### Current Issues

| Issue | Impact | Severity |
|-------|--------|----------|
| Organization filter shows unfiltered data | Security breach | 🔴 CRITICAL |
| Cache fragmentation (50-100 entries per datasource) | Low cache hit rate | 🟡 MEDIUM |
| SCAN/KEYS for pattern matching | Production latency spikes | 🔴 CRITICAL |
| Fallback hierarchy complexity | Cache serves wrong frequency data | 🟠 HIGH |

### Files to Modify

**Core Cache Layer:**
- `lib/cache/data-source-cache.ts` (350+ lines of changes)
- `lib/cache/base-cache.ts` (minor updates)

**New Files:**
- `lib/cache/analytics-cache-v2.ts` (new secondary index implementation)
- `lib/cache/cache-index-manager.ts` (index maintenance utilities)

**Integration Points:**
- `lib/services/analytics-query-builder.ts` (switch to new cache)
- `app/api/admin/analytics/dashboard/[dashboardId]/render/route.ts` (use new cache)

**Testing:**
- `tests/integration/analytics-cache-v2.test.ts` (new test suite)
- `tests/performance/cache-benchmark.test.ts` (performance validation)

---

## Target Architecture

### Cache Structure V2

**Primary Data Storage (One entry per unique combination):**
```
cache:ds:1:m:Charges:p:114:prov:5:freq:Monthly → JSON data (all rows)
cache:ds:1:m:Charges:p:114:prov:6:freq:Monthly → JSON data
cache:ds:1:m:Charges:p:115:prov:5:freq:Monthly → JSON data
```

**Secondary Index Sets (Track which keys exist):**
```
idx:ds:1:master → Set[all cache keys for datasource 1]
idx:ds:1:m:Charges → Set[all Charges keys]
idx:ds:1:m:Charges:freq:Monthly → Set[all Monthly Charges keys]
idx:ds:1:m:Charges:p:114 → Set[all practice 114 Charges keys]
idx:ds:1:m:Charges:p:114:freq:Monthly → Set[all practice 114 Monthly Charges keys]
```

**Cache Warming:**
```sql
SELECT * FROM ih.agg_app_measures  -- NO WHERE CLAUSE
ORDER BY measure, practice_uid, provider_uid, frequency, date_index
```

**Lookup Flow:**
```typescript
// 1. Build index key from filters
const indexKey = 'idx:ds:1:m:Charges:p:114:freq:Monthly';

// 2. Get matching cache keys (O(1) + O(N))
const cacheKeys = await redis.smembers(indexKey);

// 3. Fetch data (O(K))
const data = await redis.mget(...cacheKeys);

// 4. Apply in-memory filters (date range, RBAC, advanced)
const filtered = applyFilters(data, filters);
```

**Query Time:** 5-10ms (vs current 50-500ms with SCAN)

---

## Migration Phases

### Phase 0: Preparation & Setup (1 day)

**Goal:** Set up infrastructure and validate capacity

**Note:** NO feature flags - current system is broken, we're replacing it directly.

#### Tasks:

1. **Add telemetry/monitoring**
   - [ ] Add CloudWatch custom metrics for:
     - Cache hit rate
     - Query latency
     - Memory usage
     - Index lookup time
   - [ ] Add detailed logging for cache operations

2. **Database analysis**
   - [ ] Run query to count unique combinations per datasource
   - [ ] Estimate cache entry count and memory requirements
   - [ ] Validate Valkey/ElastiCache capacity

3. **Backup current cache (optional)**
   - [ ] Document current cache keys
   - [ ] Export current cache stats for comparison

**Acceptance Criteria:**
- ✅ Monitoring ready
- ✅ Capacity planning completed
- ✅ Baseline metrics documented

---

### Phase 1: Implement Core V2 Cache (5 days)

**Goal:** Build new cache implementation alongside existing system

#### Task 1.1: Create AnalyticsCacheV2 Class

**File:** `lib/cache/analytics-cache-v2.ts`

```typescript
export class AnalyticsCacheV2 {
  // Core methods:
  - warmCache(datasourceId: number): Promise<WarmResult>
  - query(filters: CacheQueryFilters): Promise<CacheEntry[]>
  - invalidate(datasourceId: number): Promise<void>
  - getCacheStats(datasourceId: number): Promise<CacheStats>
  
  // Private methods:
  - writeBatch(entries: CacheEntry[]): Promise<void>
  - getCacheKey(entry: CacheEntry): string
  - getIndexKeys(entry: CacheEntry): string[]
  - buildIndexKeyFromFilters(filters: CacheQueryFilters): string
}
```

**Implementation Details:**

1. **Cache Key Generation**
   ```typescript
   private getCacheKey(entry: CacheEntry): string {
     return `cache:ds:${entry.datasourceId}:m:${entry.measure}:p:${entry.practiceUid}:prov:${entry.providerUid}:freq:${entry.frequency}`;
   }
   ```

2. **Index Key Generation**
   ```typescript
   private getIndexKeys(entry: CacheEntry): string[] {
     const { datasourceId: ds, measure: m, practiceUid: p, providerUid: prov, frequency: freq } = entry;
     
     return [
       `idx:ds:${ds}:master`,                              // Master index for cleanup
       `idx:ds:${ds}:m:${m}:freq:${freq}`,                // Base query
       `idx:ds:${ds}:m:${m}:p:${p}:freq:${freq}`,         // With practice
       `idx:ds:${ds}:m:${m}:freq:${freq}:prov:${prov}`,   // With provider
       `idx:ds:${ds}:m:${m}:p:${p}:prov:${prov}:freq:${freq}`, // Full combo
     ];
   }
   ```

3. **Batch Write with Indexes**
   ```typescript
   private async writeBatch(entries: CacheEntry[]): Promise<void> {
     const pipeline = this.redis.pipeline();
     const TTL = 4 * 60 * 60; // 4 hours
     
     for (const entry of entries) {
       const cacheKey = this.getCacheKey(entry);
       const indexKeys = this.getIndexKeys(entry);
       
       // Store data with TTL
       pipeline.set(cacheKey, JSON.stringify(entry), 'EX', TTL);
       
       // Add to all indexes with TTL
       indexKeys.forEach(indexKey => {
         pipeline.sadd(indexKey, cacheKey);
         pipeline.expire(indexKey, TTL);
       });
     }
     
     await pipeline.exec();
   }
   ```

4. **Query with Index Lookup**
   ```typescript
   async query(filters: CacheQueryFilters): Promise<CacheEntry[]> {
     // Build index key
     const indexKey = this.buildIndexKeyFromFilters(filters);
     
     // Get matching cache keys (O(1) + O(N))
     const cacheKeys = await this.redis.smembers(indexKey);
     
     if (cacheKeys.length === 0) {
       return [];
     }
     
     // Batch fetch with 10k limit
     const BATCH_SIZE = 10000;
     const results: CacheEntry[] = [];
     
     for (let i = 0; i < cacheKeys.length; i += BATCH_SIZE) {
       const batch = cacheKeys.slice(i, i + BATCH_SIZE);
       const values = await this.redis.mget(...batch);
       
       results.push(
         ...values
           .filter((v): v is string => v !== null)
           .map(v => JSON.parse(v) as CacheEntry)
       );
     }
     
     return results;
   }
   ```

**Subtasks:**
- [ ] Implement `AnalyticsCacheV2` class
- [ ] Add TypeScript interfaces for `CacheEntry`, `CacheQueryFilters`, `WarmResult`, `CacheStats`
- [ ] Implement cache key generation methods
- [ ] Implement index key generation methods
- [ ] Implement batch write with pipeline
- [ ] Implement query with index lookup and MGET batching
- [ ] Add error handling and logging
- [ ] Add unit tests for key generation
- [ ] Add unit tests for batch operations

**Acceptance Criteria:**
- ✅ All methods implemented and tested
- ✅ Unit tests pass (100% coverage)
- ✅ TypeScript compilation passes
- ✅ Linting passes

---

#### Task 1.2: Implement Cache Warming

**Method:** `warmCache(datasourceId: number)`

**Implementation:**

```typescript
async warmCache(datasourceId: number, batchSize = 5000): Promise<WarmResult> {
  const startTime = Date.now();
  log.info('Starting cache warming', { datasourceId, version: 'v2' });
  
  // Get data source config
  const config = await chartConfigService.getDataSourceConfigById(datasourceId);
  if (!config) {
    throw new Error(`Data source not found: ${datasourceId}`);
  }
  
  const { tableName, schemaName } = config;
  
  // Query ALL data (no WHERE clause)
  const query = `
    SELECT *
    FROM ${schemaName}.${tableName}
    ORDER BY measure, practice_uid, provider_uid, frequency, date_index
  `;
  
  log.debug('Executing cache warming query', { datasourceId, schema: schemaName, table: tableName });
  
  const allRows = await executeAnalyticsQuery(query, []);
  
  log.info('Cache warming query completed', {
    datasourceId,
    totalRows: allRows.length,
    duration: Date.now() - startTime,
  });
  
  // Group by unique combination
  const grouped = new Map<string, CacheEntry[]>();
  
  for (const row of allRows) {
    const key = `${row.measure}|${row.practice_uid}|${row.provider_uid}|${row.frequency}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row as CacheEntry);
  }
  
  log.info('Data grouped for caching', {
    datasourceId,
    uniqueCombinations: grouped.size,
  });
  
  // Write batches
  let entriesCached = 0;
  const allEntries: CacheEntry[][] = Array.from(grouped.values());
  
  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    await this.writeBatch(batch.flat());
    entriesCached += batch.length;
    
    log.debug('Cache warming progress', {
      datasourceId,
      cached: entriesCached,
      total: allEntries.length,
      progress: Math.round((entriesCached / allEntries.length) * 100),
    });
  }
  
  // Set metadata
  await this.redis.set(
    `cache:meta:ds:${datasourceId}:last_warm`,
    new Date().toISOString(),
    'EX',
    4 * 60 * 60
  );
  
  const duration = Date.now() - startTime;
  
  log.info('Cache warming completed', {
    datasourceId,
    entriesCached,
    totalRows: allRows.length,
    duration,
    version: 'v2',
  });
  
  return {
    entriesCached,
    totalRows: allRows.length,
    duration,
  };
}
```

**Subtasks:**
- [ ] Implement `warmCache` method
- [ ] Add grouping logic by unique combinations
- [ ] Add batch processing with progress logging
- [ ] Add metadata tracking (last_warm timestamp)
- [ ] Add error handling for database failures
- [ ] Add error handling for Redis failures
- [ ] Test with production-sized datasets (1M+ rows)
- [ ] Validate memory usage during warming

**Acceptance Criteria:**
- ✅ Can warm cache with 1M+ rows
- ✅ Memory usage stays within limits
- ✅ Proper error handling and rollback
- ✅ Progress logging works

---

#### Task 1.3: Implement Query with Multi-Practice Filters

**Method:** `query(filters: CacheQueryFilters)` - handle organization filters

**Implementation:**

```typescript
async query(filters: CacheQueryFilters): Promise<CacheEntry[]> {
  const { datasourceId, measure, frequency, practiceUids, providerUids } = filters;
  
  // Build list of index sets to intersect
  const indexSets: string[] = [];
  
  // Base index (required)
  indexSets.push(`idx:ds:${datasourceId}:m:${measure}:freq:${frequency}`);
  
  // Handle practice filter (organization/RBAC)
  if (practiceUids && practiceUids.length > 0) {
    if (practiceUids.length === 1) {
      // Single practice - direct index
      indexSets.push(`idx:ds:${datasourceId}:m:${measure}:p:${practiceUids[0]}:freq:${frequency}`);
    } else {
      // Multiple practices - union them first
      const tempUnionKey = `temp:union:${Date.now()}:${Math.random()}`;
      
      const practiceIndexes = practiceUids.map(
        puid => `idx:ds:${datasourceId}:m:${measure}:p:${puid}:freq:${frequency}`
      );
      
      await this.redis.sunionstore(tempUnionKey, ...practiceIndexes);
      indexSets.push(tempUnionKey);
      
      // Auto-cleanup after 10 seconds
      await this.redis.expire(tempUnionKey, 10);
    }
  }
  
  // Handle provider filter
  if (providerUids && providerUids.length > 0) {
    if (providerUids.length === 1) {
      indexSets.push(`idx:ds:${datasourceId}:m:${measure}:freq:${frequency}:prov:${providerUids[0]}`);
    } else {
      const tempUnionKey = `temp:union:${Date.now()}:${Math.random()}`;
      
      const providerIndexes = providerUids.map(
        provuid => `idx:ds:${datasourceId}:m:${measure}:freq:${frequency}:prov:${provuid}`
      );
      
      await this.redis.sunionstore(tempUnionKey, ...providerIndexes);
      indexSets.push(tempUnionKey);
      await this.redis.expire(tempUnionKey, 10);
    }
  }
  
  // Get matching keys
  let matchingKeys: string[];
  
  if (indexSets.length === 1) {
    matchingKeys = await this.redis.smembers(indexSets[0]);
  } else {
    // Intersect all filter sets
    const tempResultKey = `temp:result:${Date.now()}:${Math.random()}`;
    await this.redis.sinterstore(tempResultKey, ...indexSets);
    matchingKeys = await this.redis.smembers(tempResultKey);
    await this.redis.del(tempResultKey);
  }
  
  log.info('Index lookup completed', {
    datasourceId,
    measure,
    frequency,
    practiceCount: practiceUids?.length || 0,
    providerCount: providerUids?.length || 0,
    matchingKeys: matchingKeys.length,
  });
  
  if (matchingKeys.length === 0) {
    return [];
  }
  
  // Batch fetch data
  const BATCH_SIZE = 10000;
  const results: CacheEntry[] = [];
  
  for (let i = 0; i < matchingKeys.length; i += BATCH_SIZE) {
    const batch = matchingKeys.slice(i, i + BATCH_SIZE);
    const values = await this.redis.mget(...batch);
    
    results.push(
      ...values
        .filter((v): v is string => v !== null)
        .map(v => JSON.parse(v) as CacheEntry)
    );
  }
  
  return results;
}
```

**Subtasks:**
- [ ] Implement single practice filter logic
- [ ] Implement multi-practice SUNION logic
- [ ] Implement provider filter logic
- [ ] Add set intersection for multiple filters
- [ ] Add temp key cleanup
- [ ] Test with various filter combinations
- [ ] Test with large practice arrays (100+ practices)
- [ ] Validate query performance (<10ms)

**Acceptance Criteria:**
- ✅ Single practice filter works
- ✅ Multi-practice filter works (org filters)
- ✅ Provider filter works
- ✅ Combined filters work
- ✅ Query time < 10ms
- ✅ Temp keys are cleaned up

---

#### Task 1.4: Implement Cache Invalidation

**Method:** `invalidate(datasourceId: number)`

**Implementation:**

```typescript
async invalidate(datasourceId: number): Promise<void> {
  log.info('Starting cache invalidation', { datasourceId, version: 'v2' });
  const startTime = Date.now();
  
  // Use master index to find all keys
  const masterIndex = `idx:ds:${datasourceId}:master`;
  const allCacheKeys = await this.redis.smembers(masterIndex);
  
  if (allCacheKeys.length === 0) {
    log.info('No cache keys to invalidate', { datasourceId });
    return;
  }
  
  log.info('Invalidating cache entries', {
    datasourceId,
    keysToDelete: allCacheKeys.length,
  });
  
  // Delete all cache keys in batches
  const BATCH_SIZE = 1000;
  for (let i = 0; i < allCacheKeys.length; i += BATCH_SIZE) {
    const batch = allCacheKeys.slice(i, i + BATCH_SIZE);
    await this.redis.del(...batch);
  }
  
  // Delete all index keys
  const indexPattern = `idx:ds:${datasourceId}:*`;
  let cursor = '0';
  const indexKeys: string[] = [];
  
  do {
    const [nextCursor, keys] = await this.redis.scan(
      cursor,
      'MATCH',
      indexPattern,
      'COUNT',
      1000
    );
    cursor = nextCursor;
    indexKeys.push(...keys);
  } while (cursor !== '0');
  
  if (indexKeys.length > 0) {
    await this.redis.del(...indexKeys);
  }
  
  // Delete metadata
  await this.redis.del(`cache:meta:ds:${datasourceId}:last_warm`);
  
  const duration = Date.now() - startTime;
  
  log.info('Cache invalidation completed', {
    datasourceId,
    cacheKeysDeleted: allCacheKeys.length,
    indexKeysDeleted: indexKeys.length,
    duration,
    version: 'v2',
  });
}
```

**Subtasks:**
- [ ] Implement master index-based deletion
- [ ] Add batch deletion for cache keys
- [ ] Add SCAN-based deletion for index keys
- [ ] Add metadata cleanup
- [ ] Test with large datasets (100k+ keys)
- [ ] Measure invalidation time

**Acceptance Criteria:**
- ✅ All cache keys deleted
- ✅ All index keys deleted
- ✅ Metadata cleared
- ✅ Invalidation completes in <30 seconds for 100k keys

---

#### Task 1.5: Add Cache Statistics

**Method:** `getCacheStats(datasourceId: number)`

**Implementation:**

```typescript
async getCacheStats(datasourceId: number): Promise<CacheStats> {
  const masterIndex = `idx:ds:${datasourceId}:master`;
  const totalKeys = await this.redis.scard(masterIndex);
  const lastWarm = await this.redis.get(`cache:meta:ds:${datasourceId}:last_warm`);
  
  // Sample memory usage
  let estimatedMemoryMB = 0;
  if (totalKeys > 0) {
    const sampleKey = await this.redis.srandmember(masterIndex);
    if (sampleKey) {
      const sampleSize = await this.redis.memory('usage', sampleKey) || 0;
      estimatedMemoryMB = (totalKeys * sampleSize) / (1024 * 1024);
    }
  }
  
  // Count index keys
  const indexPattern = `idx:ds:${datasourceId}:*`;
  let indexCount = 0;
  let cursor = '0';
  
  do {
    const [nextCursor, keys] = await this.redis.scan(
      cursor,
      'MATCH',
      indexPattern,
      'COUNT',
      1000
    );
    cursor = nextCursor;
    indexCount += keys.length;
  } while (cursor !== '0');
  
  return {
    datasourceId,
    totalEntries: totalKeys,
    indexCount,
    estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
    lastWarmed: lastWarm || null,
    isWarm: lastWarm !== null,
    version: 'v2',
  };
}
```

**Subtasks:**
- [ ] Implement stats collection
- [ ] Add memory estimation
- [ ] Add index counting
- [ ] Test with various cache states
- [ ] Add to admin monitoring dashboard

**Acceptance Criteria:**
- ✅ Stats method works
- ✅ Memory estimation is accurate
- ✅ Can be called frequently without performance impact

---

### Phase 2: Integration Layer (2 days)

**Goal:** Replace V1 cache with V2 in existing application code

#### Task 2.1: Update Data Source Cache

**File:** `lib/cache/data-source-cache.ts`

**Purpose:** Replace existing implementation with V2

**Strategy:** Directly replace V1 implementation methods with V2 logic

**Changes:**

1. **Replace `generateKeyHierarchy` method:**
   ```typescript
   // DELETE entire method - no more hierarchy
   ```

2. **Replace `buildDataSourceKey` method:**
   ```typescript
   private buildDataSourceKey(entry: CacheEntry): string {
     return `cache:ds:${entry.datasourceId}:m:${entry.measure}:p:${entry.practiceUid}:prov:${entry.providerUid}:freq:${entry.frequency}`;
   }
   ```

3. **Add `getIndexKeys` method:**
   ```typescript
   private getIndexKeys(entry: CacheEntry): string[] {
     const { datasourceId: ds, measure: m, practiceUid: p, providerUid: prov, frequency: freq } = entry;
     
     return [
       `idx:ds:${ds}:master`,
       `idx:ds:${ds}:m:${m}:freq:${freq}`,
       `idx:ds:${ds}:m:${m}:p:${p}:freq:${freq}`,
       `idx:ds:${ds}:m:${m}:freq:${freq}:prov:${prov}`,
       `idx:ds:${ds}:m:${m}:p:${p}:prov:${prov}:freq:${freq}`,
     ];
   }
   ```

4. **Replace `getCached` method:**
   ```typescript
   async getCached(components: CacheKeyComponents): Promise<{
     rows: Record<string, unknown>[];
     cacheKey: string;
     cacheLevel: number;
   } | null> {
     // Build index key from components
     const indexKey = this.buildIndexKey(components);
     
     // Get matching cache keys (O(1))
     const cacheKeys = await this.redis.smembers(indexKey);
     
     if (cacheKeys.length === 0) {
       return null;
     }
     
     // Fetch all matching entries
     const values = await this.redis.mget(...cacheKeys);
     const rows = values
       .filter((v): v is string => v !== null)
       .map(v => JSON.parse(v));
     
     return {
       rows,
       cacheKey: indexKey,
       cacheLevel: 0,
     };
   }
   ```

5. **Replace `setCached` method:**
   ```typescript
   async setCached(components: CacheKeyComponents, rows: Record<string, unknown>[]): Promise<void> {
     // Group by unique combination
     const grouped = this.groupByDimensions(rows);
     
     const pipeline = this.redis.pipeline();
     const TTL = 4 * 60 * 60;
     
     for (const [key, data] of grouped.entries()) {
       const cacheKey = this.getCacheKey(key);
       const indexKeys = this.getIndexKeys(key);
       
       // Store data
       pipeline.set(cacheKey, JSON.stringify(data), 'EX', TTL);
       
       // Add to indexes
       indexKeys.forEach(indexKey => {
         pipeline.sadd(indexKey, cacheKey);
         pipeline.expire(indexKey, TTL);
       });
     }
     
     await pipeline.exec();
   }
   ```

6. **Replace `warmDataSource` method:**
   ```typescript
   async warmDataSource(datasourceId: number): Promise<WarmResult> {
     // Query ALL data (no WHERE clause)
     const query = `SELECT * FROM ${schema}.${table}`;
     const allRows = await executeAnalyticsQuery(query, []);
     
     // Group and cache
     const grouped = this.groupByDimensions(allRows);
     
     // Write in batches
     await this.setCached({ datasourceId }, allRows);
     
     return { entriesCached: grouped.size, totalRows: allRows.length };
   }
   ```

**Subtasks:**
- [ ] Remove hierarchy methods
- [ ] Add index key generation
- [ ] Update getCached to use indexes
- [ ] Update setCached to create indexes
- [ ] Update warmDataSource to cache all data
- [ ] Remove fallback logic
- [ ] Test with existing code

**Acceptance Criteria:**
- ✅ No breaking changes to public API
- ✅ Existing code continues to work
- ✅ All tests pass

---

#### Task 2.2: Verify Integration Points

**Files to verify (no changes needed):**
- `lib/services/analytics-query-builder.ts` - Already uses `dataSourceCache`
- `lib/services/dashboard-renderer.ts` - Already uses query builder

**Subtasks:**
- [ ] Verify `analyticsQueryBuilder.queryMeasures()` still works
- [ ] Verify dashboard rendering still works
- [ ] Test organization filters work correctly
- [ ] Test RBAC filtering works correctly

**Acceptance Criteria:**
- ✅ No breaking changes to existing code
- ✅ Organization filters work correctly
- ✅ RBAC filtering works correctly

---

### Phase 3: Testing & Validation (4 days)

**Goal:** Comprehensive testing of V2 cache implementation

#### Task 3.1: Unit Tests

**File:** `tests/unit/analytics-cache-v2.test.ts`

**Test Coverage:**

1. **Cache Key Generation**
   - [ ] Test `getCacheKey()` with various inputs
   - [ ] Test key format and uniqueness
   - [ ] Test special characters in measure names

2. **Index Key Generation**
   - [ ] Test `getIndexKeys()` returns correct indexes
   - [ ] Test all combinations of filters
   - [ ] Test index key format

3. **Batch Writing**
   - [ ] Test batch write with 1000 entries
   - [ ] Test pipeline execution
   - [ ] Test TTL is set correctly
   - [ ] Test indexes are created

4. **Query Logic**
   - [ ] Test single practice filter
   - [ ] Test multi-practice filter (SUNION)
   - [ ] Test provider filter
   - [ ] Test combined filters
   - [ ] Test empty results

5. **Cache Invalidation**
   - [ ] Test master index deletion
   - [ ] Test index cleanup
   - [ ] Test metadata cleanup

**Subtasks:**
- [ ] Write unit tests for all methods
- [ ] Achieve 100% code coverage
- [ ] Test edge cases (empty data, large datasets)
- [ ] Test error handling

**Acceptance Criteria:**
- ✅ 100% code coverage
- ✅ All tests pass
- ✅ Edge cases covered

---

#### Task 3.2: Integration Tests

**File:** `tests/integration/analytics-cache-v2.test.ts`

**Test Scenarios:**

1. **Cache Warming**
   - [ ] Warm cache with 1M rows
   - [ ] Verify all entries cached
   - [ ] Verify indexes created
   - [ ] Test warming performance (<2 minutes for 1M rows)

2. **Cache Queries**
   - [ ] Query with no filters (all practices)
   - [ ] Query with single practice
   - [ ] Query with multiple practices (org filter)
   - [ ] Query with provider filter
   - [ ] Query with combined filters

3. **RBAC Integration**
   - [ ] Super admin sees all data
   - [ ] Organization-scoped user sees filtered data
   - [ ] Own-scoped user sees only their data

4. **Organization Filters**
   - [ ] Dashboard with org filter shows correct data
   - [ ] Multi-practice org filter works
   - [ ] Empty org (no practices) returns no data

5. **Cache Invalidation**
   - [ ] Invalidate and re-warm cache
   - [ ] Verify old data is gone
   - [ ] Verify new data is present

**Subtasks:**
- [ ] Write integration tests
- [ ] Test with production-like data
- [ ] Test RBAC scenarios
- [ ] Test organization filter scenarios
- [ ] Measure query performance

**Acceptance Criteria:**
- ✅ All integration tests pass
- ✅ RBAC filtering works correctly
- ✅ Organization filters work correctly
- ✅ Query time < 10ms

---

#### Task 3.3: Performance Benchmarks

**File:** `tests/performance/cache-benchmark.test.ts`

**Benchmarks to Run:**

1. **Cache Warming**
   - [ ] Measure time to warm 1M rows
   - [ ] Measure time to warm 5M rows
   - [ ] Measure memory usage during warming

2. **Query Performance**
   - [ ] Measure query time with 10 cache keys
   - [ ] Measure query time with 100 cache keys
   - [ ] Measure query time with 1000 cache keys
   - [ ] Compare V1 vs V2 query times

3. **Memory Usage**
   - [ ] Measure cache size for 1M rows
   - [ ] Measure index overhead
   - [ ] Compare V1 vs V2 memory usage

4. **Concurrent Queries**
   - [ ] Test 10 concurrent queries
   - [ ] Test 100 concurrent queries
   - [ ] Measure Redis CPU usage

**Target Metrics:**

| Metric | Target | V1 Baseline | V2 Target |
|--------|--------|-------------|-----------|
| Warm 1M rows | < 2 min | 5 min | < 2 min |
| Query time (100 keys) | < 10ms | 50-500ms | < 10ms |
| Memory overhead | < 40% | 20% | < 40% |
| Cache hit rate | > 95% | 60-80% | > 95% |

**Subtasks:**
- [ ] Create benchmark test suite
- [ ] Run benchmarks on staging environment
- [ ] Document results
- [ ] Compare V1 vs V2 performance

**Acceptance Criteria:**
- ✅ All benchmarks meet target metrics
- ✅ V2 is faster than V1 for queries
- ✅ Memory usage is acceptable

---

### Phase 4: Deployment (2 days)

**Goal:** Deploy V2 cache fix to production

**Note:** Since current system is broken, deploy quickly after testing. No gradual rollout needed.

#### Task 4.1: Staging Deployment

**Day 1: Deploy to Staging**

1. **Deploy Code**
   - [ ] Deploy V2 cache implementation
   - [ ] Clear existing cache: `redis-cli FLUSHDB`
   - [ ] Warm cache for all datasources
   - [ ] Run smoke tests

2. **Validation**
   - [ ] Test dashboard with organization filter
   - [ ] Verify super admin sees ONLY filtered data (not all data)
   - [ ] Verify cache hit rate > 90%
   - [ ] Verify query performance < 10ms
   - [ ] Check CloudWatch metrics
   - [ ] Review logs for errors

3. **Full Test Suite**
   - [ ] Run all integration tests
   - [ ] Test with different user roles (super admin, org-scoped, own-scoped)
   - [ ] Test all chart types
   - [ ] Test RBAC filtering
   - [ ] Load test with 100 concurrent users

**Acceptance Criteria:**
- ✅ Organization filter bug is fixed
- ✅ Cache hit rate > 90%
- ✅ Query latency < 10ms
- ✅ All tests pass
- ✅ No errors in logs

---

#### Task 4.2: Production Deployment

**Day 2: Deploy to Production**

1. **Pre-Deployment**
   - [ ] Backup production Redis (optional)
   - [ ] Document current cache stats
   - [ ] Notify team of deployment

2. **Deploy**
   - [ ] Deploy V2 cache implementation
   - [ ] Clear existing cache: `redis-cli FLUSHDB`
   - [ ] Warm cache for all datasources (run in parallel)
   - [ ] Monitor warming progress

3. **Immediate Validation (15 minutes)**
   - [ ] Test dashboard with organization filter
   - [ ] Verify org filter shows correct data
   - [ ] Check error rates (should be 0)
   - [ ] Check cache hit rates
   - [ ] Check query latencies

4. **Extended Monitoring (4 hours)**
   - [ ] Monitor CloudWatch metrics
   - [ ] Review logs every 30 minutes
   - [ ] Test with real users
   - [ ] Verify no user reports of issues

5. **Final Validation (24 hours)**
   - [ ] Cache hit rate > 95%
   - [ ] Query latency P95 < 10ms
   - [ ] Error rate = 0
   - [ ] Memory usage within limits
   - [ ] No user-reported issues

**Rollback Plan:**
If any critical issues:
1. Revert code deployment (< 5 minutes)
2. Clear V2 cache
3. Old code will fall back to database queries
4. Investigate and fix issues

**Acceptance Criteria:**
- ✅ Production deployment successful
- ✅ Organization filter bug is fixed
- ✅ Cache hit rate > 95%
- ✅ Query latency < 10ms
- ✅ No errors
- ✅ No user-reported issues

---

### Phase 5: Monitoring & Optimization (Ongoing)

**Goal:** Ensure V2 cache performs well in production

#### Task 5.1: CloudWatch Dashboards

**Create dashboards for:**

1. **Cache Hit Rate**
   - [ ] V1 vs V2 hit rate comparison
   - [ ] Per-datasource hit rate
   - [ ] Hourly hit rate

2. **Query Latency**
   - [ ] V1 vs V2 latency comparison
   - [ ] P50, P95, P99 latency
   - [ ] Per-datasource latency

3. **Memory Usage**
   - [ ] Redis memory usage
   - [ ] Cache size per datasource
   - [ ] Index overhead

4. **Error Rates**
   - [ ] Cache warming failures
   - [ ] Query failures
   - [ ] Redis connection errors

**Subtasks:**
- [ ] Create CloudWatch dashboards
- [ ] Set up alarms for anomalies
- [ ] Create weekly reports

**Acceptance Criteria:**
- ✅ Dashboards show all key metrics
- ✅ Alarms trigger on issues
- ✅ Weekly reports generated

---

#### Task 5.2: Performance Optimization

**Ongoing optimizations:**

1. **Index Optimization**
   - [ ] Analyze which indexes are used
   - [ ] Remove unused indexes
   - [ ] Add missing indexes based on query patterns

2. **Memory Optimization**
   - [ ] Tune batch sizes
   - [ ] Adjust TTL values
   - [ ] Optimize JSON serialization

3. **Query Optimization**
   - [ ] Cache SUNION results (if frequently used)
   - [ ] Use pipelining for MGET
   - [ ] Optimize temp key cleanup

**Subtasks:**
- [ ] Monthly performance review
- [ ] Implement optimizations
- [ ] Measure impact

**Acceptance Criteria:**
- ✅ Query time stays < 10ms
- ✅ Memory usage stays within limits
- ✅ Cache hit rate stays > 95%

---

## Testing Strategy

### Unit Tests

**Coverage Target:** 100%

**Files to Test:**
- `lib/cache/analytics-cache-v2.ts`
- `lib/cache/cache-router.ts`

**Test Framework:** Vitest with Redis mock

**Key Tests:**
- Cache key generation
- Index key generation
- Batch operations
- Query filtering logic
- Invalidation logic

---

### Integration Tests

**Test Environment:** Staging with production-like data

**Test Scenarios:**
1. End-to-end cache warming
2. Query with various filter combinations
3. RBAC integration
4. Organization filter integration
5. Cache invalidation and re-warming

**Test Data:**
- 1M row dataset
- Multiple datasources
- Multiple users with different RBAC scopes

---

### Performance Tests

**Benchmark Suite:**

| Test | Target | How to Measure |
|------|--------|----------------|
| Cache warm time | < 2 min for 1M rows | Time `warmCache()` |
| Query latency | < 10ms | Time `query()` call |
| Memory overhead | < 40% | Compare cache size vs data size |
| Cache hit rate | > 95% | Log hits vs misses |
| Concurrent queries | 100 QPS | Load test with k6 |

**Tools:**
- k6 for load testing
- CloudWatch for production metrics
- Custom benchmark scripts

---

### Security Tests

**Test Scenarios:**

1. **RBAC Enforcement**
   - [ ] Super admin sees all data
   - [ ] Org-scoped user sees only their org
   - [ ] Own-scoped user sees only their data

2. **Organization Filter Security**
   - [ ] User can only filter to accessible orgs
   - [ ] Attempts to filter to inaccessible org are blocked

3. **Cache Poisoning Prevention**
   - [ ] Validate all cache keys before use
   - [ ] Prevent injection via filter values

**Subtasks:**
- [ ] Security test suite
- [ ] Penetration testing
- [ ] Code review for security

---

## Rollback Plan

### Rollback Triggers

**Immediate Rollback if:**
- Error rate increases > 5%
- Query latency > 100ms P95
- Cache hit rate < 80%
- Memory usage exceeds 80% of capacity
- Any security issue detected

### Rollback Procedure

**Step 1: Disable V2 Cache (< 1 minute)**
```bash
# Set environment variable
ENABLE_CACHE_V2=false

# Restart application
kubectl rollout restart deployment/bcos-app
```

**Step 2: Verify V1 Working (5 minutes)**
- [ ] Check cache hit rates
- [ ] Check query latencies
- [ ] Check error logs
- [ ] Test dashboard rendering

**Step 3: Clear V2 Cache (Optional)**
```bash
# Connect to Redis
redis-cli -h $REDIS_HOST

# Delete all V2 keys
SCAN 0 MATCH cache:ds:* COUNT 1000
# Delete keys in batches

SCAN 0 MATCH idx:ds:* COUNT 1000
# Delete index keys
```

**Step 4: Post-Rollback Analysis**
- [ ] Review logs for root cause
- [ ] Review metrics for anomalies
- [ ] Create incident report
- [ ] Plan fixes

---

## Performance Benchmarks

### Target Metrics

| Metric | Current (V1) | Target (V2) | Improvement |
|--------|--------------|-------------|-------------|
| **Cache Warm Time (1M rows)** | 5 min | < 2 min | 60% faster |
| **Query Latency (P50)** | 50ms | < 5ms | 90% faster |
| **Query Latency (P95)** | 500ms | < 10ms | 98% faster |
| **Cache Hit Rate** | 60-80% | > 95% | 15-35% improvement |
| **Memory Usage** | 10GB | 13-14GB | 30-40% increase |
| **Queries per Second** | 50 QPS | 500+ QPS | 10x improvement |

### Measurement Plan

**Pre-Migration Baseline:**
- [ ] Document V1 cache hit rates (per datasource)
- [ ] Document V1 query latencies (P50, P95, P99)
- [ ] Document V1 memory usage
- [ ] Document V1 error rates

**During Migration:**
- [ ] Compare V1 vs V2 for same datasource
- [ ] Measure migration overhead
- [ ] Track user-reported issues

**Post-Migration:**
- [ ] Document V2 metrics
- [ ] Compare to baseline
- [ ] Generate performance report

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Performance benchmarks meet targets
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Rollback plan tested
- [ ] Monitoring dashboards created
- [ ] Feature flags configured
- [ ] Team trained on new system

### Deployment Schedule

**Timeline:** 6 weeks (gradual rollout)

**Week 1:** Deploy to staging
- Deploy code with V2 disabled
- Test V1 still works
- Enable V2 for one datasource
- Validate functionality

**Week 2:** Deploy to production (V2 disabled)
- Deploy code with V2 disabled
- Monitor for 48 hours
- Verify no regressions

**Week 3:** Enable V2 for 1 datasource
- Enable V2 for primary datasource
- Warm cache
- Monitor for 48 hours
- Verify metrics

**Week 4:** Enable V2 for 25% datasources
- Enable V2 for 3 more datasources
- Monitor for 48 hours
- Verify metrics

**Week 5:** Enable V2 for 100% datasources
- Enable V2 globally
- Warm all caches
- Monitor for 1 week

**Week 6:** Cleanup (optional)
- Remove V1 code
- Remove feature flags
- Finalize documentation

### Post-Deployment Monitoring

**Monitor for 30 days:**
- [ ] Cache hit rate
- [ ] Query latency
- [ ] Error rates
- [ ] Memory usage
- [ ] User feedback

**Weekly Review:**
- [ ] Review metrics
- [ ] Address any issues
- [ ] Optimize as needed

---

## Risk Assessment

### High Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Memory overflow** | Medium | High | Set TTL, monitor memory, scale Redis |
| **Query timeout** | Low | High | Test with large datasets, add timeouts |
| **Cache inconsistency** | Low | High | Validate data integrity, add checksums |
| **Deployment failure** | Low | High | Feature flags, gradual rollout, rollback plan |

### Medium Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Performance regression** | Medium | Medium | Benchmarks, monitoring, rollback |
| **Index overhead** | Medium | Medium | Optimize indexes, monitor memory |
| **Concurrent warming** | Low | Medium | Distributed locks, queue warming |

### Low Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Redis connection issues** | Low | Low | Graceful degradation, retry logic |
| **TTL expiration mid-query** | Low | Low | Extend TTL, refresh on access |

---

## Success Criteria

### Phase 0 Success
- ✅ Feature flags work
- ✅ Monitoring dashboards created
- ✅ Capacity planning completed

### Phase 1 Success
- ✅ V2 cache implementation complete
- ✅ All unit tests pass (100% coverage)
- ✅ Code review approved

### Phase 2 Success
- ✅ Integration layer complete
- ✅ Cache router works
- ✅ Can switch between V1 and V2

### Phase 3 Success
- ✅ All tests pass
- ✅ Performance benchmarks meet targets
- ✅ Security review passed

### Phase 4 Success
- ✅ Deployed to production
- ✅ V2 enabled for all datasources
- ✅ No increase in error rates
- ✅ Cache hit rate > 95%

### Phase 5 Success
- ✅ Monitoring in place
- ✅ Performance optimized
- ✅ Team trained

### Overall Success
- ✅ Organization filter bug fixed
- ✅ Query latency < 10ms
- ✅ Cache hit rate > 95%
- ✅ Memory usage acceptable
- ✅ No user-reported issues
- ✅ System stable for 30 days

---

## Timeline Summary

| Phase | Duration | Dependencies | Team |
|-------|----------|--------------|------|
| **Phase 0: Preparation** | 1 day | None | DevOps + Backend |
| **Phase 1: Core Implementation** | 5 days | Phase 0 | Backend |
| **Phase 2: Integration** | 2 days | Phase 1 | Backend |
| **Phase 3: Testing** | 4 days | Phase 2 | QA + Backend |
| **Phase 4: Deployment** | 2 days | Phase 3 | DevOps + Backend |
| **Phase 5: Monitoring** | Ongoing | Phase 4 | DevOps |
| **Total** | ~2.5 weeks | | |

**Note:** No feature flags or gradual rollout - current system is broken, we're fixing it ASAP.

---

## Appendix

### A. Environment Variables

```bash
# Cache Configuration
CACHE_TTL=14400                        # 4 hours in seconds
CACHE_BATCH_SIZE=5000                  # Warming batch size
CACHE_QUERY_TIMEOUT=10000              # Query timeout in ms

# Monitoring
CACHE_METRICS_ENABLED=true             # Enable CloudWatch metrics
```

### B. Redis Key Patterns

**Cache Keys:**
```
cache:ds:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
```

**Index Keys:**
```
idx:ds:{id}:master
idx:ds:{id}:m:{measure}:freq:{frequency}
idx:ds:{id}:m:{measure}:p:{practice}:freq:{frequency}
idx:ds:{id}:m:{measure}:freq:{frequency}:prov:{provider}
idx:ds:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
```

**Metadata Keys:**
```
cache:meta:ds:{id}:last_warm
```

**Temporary Keys:**
```
temp:union:{timestamp}:{random}
temp:result:{timestamp}:{random}
```

### C. Monitoring Queries

**CloudWatch Insights Queries:**

**Cache Hit Rate:**
```
fields @timestamp, datasourceId, cacheHit
| filter message = "Data source served from cache" or message = "Data source cache miss"
| stats sum(cacheHit) / count(*) * 100 as hitRate by bin(1h)
```

**Query Latency:**
```
fields @timestamp, duration, datasourceId
| filter message = "Cache query completed"
| stats avg(duration), pct(duration, 50), pct(duration, 95), pct(duration, 99) by bin(1h)
```

**Memory Usage:**
```
fields @timestamp, estimatedMemoryMB, datasourceId
| filter message = "Cache stats"
| stats avg(estimatedMemoryMB) by datasourceId
```

### D. Useful Redis Commands

**Check cache size:**
```bash
redis-cli --scan --pattern "cache:ds:1:*" | wc -l
```

**Check index size:**
```bash
redis-cli --scan --pattern "idx:ds:1:*" | wc -l
```

**Sample cache entry:**
```bash
redis-cli --scan --pattern "cache:ds:1:*" | head -1 | xargs redis-cli GET
```

**Clear all V2 cache:**
```bash
redis-cli --scan --pattern "cache:ds:*" | xargs redis-cli DEL
redis-cli --scan --pattern "idx:ds:*" | xargs redis-cli DEL
```

**Memory usage:**
```bash
redis-cli INFO memory
```

---

## Questions & Decisions

### Q1: How to handle cache warming failures?
**Decision:** Log error, alert DevOps, fall back to database queries.

### Q2: What to do if memory exceeds limits?
**Decision:** Reduce TTL, scale Redis, optimize indexes.

### Q3: Should we warm all datasources at once?
**Decision:** Warm in parallel during deployment, then scheduled re-warming every 4 hours.

### Q4: How to handle Redis unavailability?
**Decision:** Graceful degradation - query database directly with WHERE clauses.

### Q5: When to remove old V1 code?
**Decision:** After 30 days of stable V2 operation, remove deprecated methods.

---

## Contacts

**Project Owner:** [Your Name]  
**Backend Lead:** [Name]  
**DevOps Lead:** [Name]  
**QA Lead:** [Name]

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-15  
**Next Review:** Start of each phase

