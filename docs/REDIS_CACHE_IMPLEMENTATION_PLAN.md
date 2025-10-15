# Redis Cache Implementation Plan
## Hierarchical Data Source Caching with Query Builder Integration

**Date:** October 15, 2025  
**Status:** Ready for Implementation (REVISED - In-Memory RBAC Filtering)  
**Priority:** HIGH  
**Estimated Total Effort:** 12-15 hours ← Revised from 10-12  
**Expected Impact:** 80-90% faster dashboard loads, 85-95% fewer DB queries ← Realistic estimates

---

## 🔴 CRITICAL ARCHITECTURAL DECISION: Server-Side In-Memory RBAC Filtering

**Problem:** Users with different `accessible_practices` arrays would create different cache keys, preventing cache reuse.

**Solution:** RBAC filtering applied **in-memory on the SERVER** after cache/DB fetch, before sending to client.

**Benefits:**
- ✅ **Maximum cache reuse** - One cache entry serves all users (filtered per user)
- ✅ **Simpler cache keys** - No need to hash permission arrays
- ✅ **Fast filtering** - Pre-aggregated data (~50-200 rows) filtered in <1ms
- ✅ **Flexible** - Works for any RBAC changes
- ✅ **Secure** - Client NEVER receives unfiltered data

**Security Model:**
```typescript
// Cache key (no RBAC): ds:1:m:Charges:p:*:freq:Monthly
// Cached data: ALL practices (e.g., 100 practices × 12 months = 1200 rows)

// Server-side filtering (BEFORE sending to client):
// - Admin user (permission_scope='all'): Returns all 1200 rows
// - Practice admin (accessible_practices=[114,115,116]): Returns 36 rows (filtered)
// - Practice user (accessible_practices=[114]): Returns 12 rows (filtered)

// Client receives: ONLY the filtered data appropriate for their permissions
```

**CRITICAL SECURITY REQUIREMENT:**
- ⚠️ **All filtering MUST happen server-side** - Client cannot receive unfiltered data
- ⚠️ **RBAC filtering applied in `fetchDataSource()`** before returning to caller
- ⚠️ **Chart handlers, API routes, orchestrators** all receive pre-filtered data

**Implementation:**
1. `queryDatabase()` fetches all data for measure/frequency (no RBAC filtering in SQL)
2. `queryDatabase()` DOES apply explicit chart filters via `advancedFilters` (dashboard filters, practice_uid chart config)
3. `fetchDataSource()` applies `applyRBACFilter()` FIRST after cache/DB fetch
4. **Filtered data returned to caller** - client never sees unauthorized data
5. All users share same cache, each gets their filtered subset

**Testing:** Phase 3.0 includes CRITICAL security tests verifying no cross-user data leakage.

---

## 🏗️ ARCHITECTURE DECISION: Extend CacheService Base Class

**Strategy:** Leverage existing `lib/cache/base.ts` infrastructure instead of creating standalone implementation.

**Benefits:**
- ✅ **Code Reuse** - Inherit get(), set(), del(), delPattern(), scan() (~200 lines saved)
- ✅ **Consistency** - Same patterns as rbacCache, authCache, analyticsCache
- ✅ **Automatic Features** - Error handling, Redis unavailable, graceful degradation
- ✅ **Maintainability** - Bug fixes/improvements to base class benefit all caches
- ✅ **Type Safety** - Generic `CacheService<CachedDataEntry>` for strong typing

**Implementation:**
```typescript
// lib/cache/data-source-cache.ts
import { CacheService } from './base';

class DataSourceCacheService extends CacheService<CachedDataEntry> {
  protected namespace = 'datasource';
  protected defaultTTL = 300;
  
  // Only implement business logic:
  // - buildDataSourceKey()
  // - generateKeyHierarchy()
  // - getCached() with fallback
  // - applyRBACFilter()
  // - fetchDataSource()
  // - invalidate() (required abstract method)
  
  // Inherited for free:
  // - get(), set(), del(), delPattern(), scan()
  // - Error handling, logging, key naming
}
```

**Export Pattern:**
```typescript
// lib/cache/index.ts
export { dataSourceCache } from './data-source-cache';

// Usage everywhere:
import { dataSourceCache } from '@/lib/cache';
```

---

## Overview

Implement Redis-backed caching for analytics data sources using hierarchical cache keys based on common query dimensions (data_source_id, measure, practice_uid, provider_uid, frequency). Cache is integrated at the query builder level, automatically benefiting all chart types.

**Key Design Decisions:**
- ✅ **Extend existing `CacheService` base class** (consistent with rbacCache, authCache, etc.)
- ✅ Cache at `analyticsQueryBuilder.queryMeasures()` level
- ✅ Hierarchical cache keys: `datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}`
- ✅ **Advanced filters excluded from cache key** - Store widest data, filter in-memory
- ✅ Date ranges filtered in-memory (not in cache key)
- ✅ **RBAC filtered in-memory on server** (NOT in cache key) ← CRITICAL SECURITY
- ✅ **4-hour TTL with scheduled cache warming** - All data updates 1-2x daily
- ✅ Graceful degradation on Redis failures (inherited from base class)

---

## Implementation Phases

### Phase 1: Core Cache Service (4-5 hours)
**File:** `lib/cache/data-source-cache.ts` (NEW)

### Phase 2: Query Builder Integration (3-4 hours)
**File:** `lib/services/analytics-query-builder.ts` (MODIFY)

### Phase 3: Testing & Validation (2-3 hours)
**Files:** Unit tests, integration tests, manual testing

### Phase 4: Monitoring & Deployment (1 hour)
**Files:** Cache statistics endpoint, logging, deployment

---

## Detailed Task Breakdown

---

## PHASE 1: Core Cache Service Implementation

### Task 1.1: Create Cache Service Extending Base Class (20 min) ← Revised from 30 min

**File:** `lib/cache/data-source-cache.ts`

**Strategy:** Extend existing `CacheService` base class for consistency with other cache services.

**Deliverables:**
- [ ] Create file extending `CacheService<CachedDataEntry>`
- [ ] Define `CacheKeyComponents` interface
- [ ] Define `CacheQueryParams` interface
- [ ] Define `CachedDataEntry` interface
- [ ] Set namespace and defaultTTL
- [ ] Add constants (MAX_CACHE_SIZE, WILDCARD)

**Code Template:**
```typescript
import { CacheService } from './base';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { ChartRenderContext } from '@/lib/types/analytics';
import type { ChartFilter } from '@/lib/types/analytics';

export interface CacheKeyComponents {
  dataSourceId: number;
  measure?: string;
  practiceUid?: number; // Only from explicit chart filters, NOT from RBAC
  providerUid?: number;
  frequency?: string;
  // Note: RBAC filtering (accessible_practices) applied in-memory, NOT in cache key
}

export interface CacheQueryParams {
  dataSourceId: number;
  schema: string;
  table: string;
  measure?: string;
  practiceUid?: number;
  providerUid?: number;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  advancedFilters?: ChartFilter[];
}

interface CachedDataEntry {
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: string;
  expiresAt: string;
  sizeBytes: number;
  keyComponents: CacheKeyComponents;
}

/**
 * Data Source Cache Service
 * 
 * Caches analytics data source query results with in-memory RBAC filtering.
 * Extends CacheService base class for consistency with other cache services.
 * 
 * KEY FEATURES:
 * - Hierarchical cache keys with fallback
 * - In-memory RBAC filtering (maximum cache reuse)
 * - Date range and advanced filtering
 * - Graceful degradation (inherited from base)
 */
class DataSourceCacheService extends CacheService<CachedDataEntry> {
  protected namespace = 'datasource';
  protected defaultTTL = 14400; // 4 hours (data updates 1-2x daily)
  
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly WILDCARD = '*';
  
  // Methods will be added in subsequent tasks
  
  /**
   * Implementation of abstract invalidate method from CacheService
   */
  async invalidate(dataSourceId?: number, measure?: string): Promise<void> {
    // Will be implemented in Task 1.8
  }
}

export const dataSourceCache = new DataSourceCacheService();
```

**Acceptance Criteria:**
- [ ] File compiles without errors
- [ ] Extends `CacheService<CachedDataEntry>` correctly
- [ ] All interfaces exported correctly
- [ ] namespace and defaultTTL set appropriately
- [ ] **BENEFIT:** Inherits get(), set(), del(), delPattern(), scan() for free!

---

### Task 1.2: Implement Cache Key Building (30 min) ← Revised from 45 min

**Methods to implement:**
- [ ] `private buildDataSourceKey(components: CacheKeyComponents): string`
- [ ] `private generateKeyHierarchy(components: CacheKeyComponents): string[]`

**Deliverables:**
```typescript
/**
 * Build cache key from components using base class buildKey()
 * Format: datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
 * 
 * Uses inherited buildKey() method for consistent key naming across all cache services
 */
private buildDataSourceKey(components: CacheKeyComponents): string {
  // Base class buildKey() automatically prepends namespace
  return this.buildKey(
    components.dataSourceId,
    'm', components.measure || this.WILDCARD,
    'p', components.practiceUid || this.WILDCARD,
    'prov', components.providerUid || this.WILDCARD,
    'freq', components.frequency || this.WILDCARD
  );
}

/**
 * Generate cache key fallback hierarchy
 * Returns keys from most specific to least specific
 */
private generateKeyHierarchy(components: CacheKeyComponents): string[] {
  const keys: string[] = [];
  
  // Level 4: measure + practice + provider + frequency
  if (components.measure && components.practiceUid && components.providerUid && components.frequency) {
    keys.push(this.buildDataSourceKey(components));
  }
  
  // Level 3: measure + practice + frequency (all providers)
  if (components.measure && components.practiceUid && components.frequency) {
    keys.push(this.buildDataSourceKey({
      ...components,
      providerUid: undefined,
    }));
  }
  
  // Level 2: measure + practice (all providers, all frequencies)
  if (components.measure && components.practiceUid) {
    keys.push(this.buildDataSourceKey({
      dataSourceId: components.dataSourceId,
      measure: components.measure,
      practiceUid: components.practiceUid,
    }));
  }
  
  // Level 1: measure only
  if (components.measure) {
    keys.push(this.buildDataSourceKey({
      dataSourceId: components.dataSourceId,
      measure: components.measure,
    }));
  }
  
  // Level 0: Full data source
  keys.push(this.buildDataSourceKey({
    dataSourceId: components.dataSourceId,
  }));
  
  return keys;
}
```

**Acceptance Criteria:**
- [ ] `buildDataSourceKey()` uses inherited `buildKey()` method
- [ ] Key format matches: `datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{freq}`
- [ ] `generateKeyHierarchy()` returns keys in correct order (specific → general)
- [ ] Wildcard (`*`) used for undefined components
- [ ] All levels tested with various component combinations
- [ ] **BENEFIT:** Consistent key naming with other cache services

---

### Task 1.3: Implement Cache Get with Fallback (45 min) ← Revised from 1 hour

**Methods to implement:**
- [ ] `async getCached(components: CacheKeyComponents): Promise<{ rows, cacheKey, cacheLevel } | null>`

**Deliverables:**
```typescript
/**
 * Get cached data with fallback hierarchy
 * Tries keys from most specific to least specific
 * 
 * Uses inherited get() method from CacheService base class
 */
async getCached(components: CacheKeyComponents): Promise<{
  rows: Record<string, unknown>[];
  cacheKey: string;
  cacheLevel: number;
} | null> {
  const keyHierarchy = this.generateKeyHierarchy(components);

  // Try each key in hierarchy (uses base class get())
  for (let i = 0; i < keyHierarchy.length; i++) {
    const key = keyHierarchy[i];
    
    // Base class get() handles Redis unavailable, JSON parsing, error handling
    const cached = await this.get<CachedDataEntry>(key);

    if (cached) {
      log.info('Data source cache hit', {
        cacheKey: key,
        cacheLevel: i,
        rowCount: cached.rowCount,
        sizeKB: Math.round(cached.sizeBytes / 1024),
        cachedAt: cached.cachedAt,
      });

      return {
        rows: cached.rows,
        cacheKey: key,
        cacheLevel: i,
      };
    }
  }

  log.info('Data source cache miss (all levels)', {
    dataSourceId: components.dataSourceId,
    measure: components.measure,
    practiceUid: components.practiceUid,
    keysChecked: keyHierarchy.length,
  });

  return null;
  // Note: Error handling is automatic via base class get()
}
```

**Acceptance Criteria:**
- [ ] Tries keys in order (specific → general)
- [ ] Uses inherited `get<CachedDataEntry>()` method from base class
- [ ] Returns on first cache hit
- [ ] Returns null on complete miss
- [ ] Logs cache hits with appropriate level
- [ ] **BENEFIT:** Error handling, Redis unavailable, JSON parsing handled by base class

---

### Task 1.4: Implement Cache Set (20 min) ← Revised from 30 min

**Methods to implement:**
- [ ] `async setCached(components: CacheKeyComponents, rows: Record<string, unknown>[], ttl?: number): Promise<void>`

**Deliverables:**
```typescript
/**
 * Set data in cache
 * Uses inherited set() method from CacheService base class
 */
async setCached(
  components: CacheKeyComponents,
  rows: Record<string, unknown>[],
  ttl?: number
): Promise<void> {
  const key = this.buildDataSourceKey(components);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (ttl || this.defaultTTL) * 1000);

  const cachedData: CachedDataEntry = {
    rows,
    rowCount: rows.length,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sizeBytes: 0,
    keyComponents: components,
  };

  const jsonString = JSON.stringify(cachedData);
  cachedData.sizeBytes = Buffer.byteLength(jsonString, 'utf8');

  // Check size limit
  if (cachedData.sizeBytes > this.MAX_CACHE_SIZE) {
    log.warn('Data source cache entry too large', {
      key,
      sizeMB: Math.round(cachedData.sizeBytes / 1024 / 1024),
      maxMB: Math.round(this.MAX_CACHE_SIZE / 1024 / 1024),
      rowCount: rows.length,
    });
    return;
  }

  // Base class set() handles Redis unavailable, JSON serialization, error handling
  const success = await this.set(key, cachedData, { ttl });

  if (success) {
    log.info('Data source cached', {
      key,
      rowCount: rows.length,
      sizeKB: Math.round(cachedData.sizeBytes / 1024),
      ttl: ttl || this.defaultTTL,
      expiresAt: expiresAt.toISOString(),
    });
  }
  // Note: Error handling is automatic via base class set()
}
```

**Acceptance Criteria:**
- [ ] Builds cache entry with metadata
- [ ] Calculates size and checks against MAX_CACHE_SIZE
- [ ] Uses inherited `set()` method from base class
- [ ] Passes TTL via CacheOptions interface
- [ ] Logs successful cache operations
- [ ] **BENEFIT:** Redis unavailable, error handling, JSON serialization by base class

---

### Task 1.5: Implement Database Query with Advanced Filters (1.5 hours) ← Revised

**Methods to implement:**
- [ ] `private async queryDatabase(params: CacheQueryParams): Promise<Record<string, unknown>[]>`
- [ ] `private buildAdvancedFilterClause(filters: ChartFilter[], startIndex: number): { clause: string; params: unknown[]; nextIndex: number }`

**Deliverables:**
```typescript
/**
 * Query database with explicit chart filters
 * Builds SELECT query with WHERE clause based on cache key components + advanced filters
 * 
 * IMPORTANT: 
 * - Does NOT apply RBAC filtering here (done in-memory after cache/DB fetch)
 * - DOES apply explicit chart filters (practice_uid, provider_uid, dashboard universal filters)
 * - DOES apply advancedFilters (dashboard universal filters like organization → practices)
 * 
 * This allows maximum cache reuse while respecting explicit chart-level filters
 */
private async queryDatabase(
  params: CacheQueryParams
): Promise<Record<string, unknown>[]> {
  const { schema, table, measure, practiceUid, providerUid, frequency, advancedFilters } = params;

  // Build WHERE clause (explicit chart filters only, NOT RBAC)
  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];
  let paramIndex = 1;

  if (measure) {
    whereClauses.push(`measure = $${paramIndex++}`);
    queryParams.push(measure);
  }

  // Only filter by practice_uid if explicitly specified in chart config
  if (practiceUid) {
    whereClauses.push(`practice_uid = $${paramIndex++}`);
    queryParams.push(practiceUid);
  }

  if (providerUid) {
    whereClauses.push(`provider_uid = $${paramIndex++}`);
    queryParams.push(providerUid);
  }

  if (frequency) {
    // Try both 'frequency' and 'time_period' columns
    whereClauses.push(`(frequency = $${paramIndex} OR time_period = $${paramIndex})`);
    queryParams.push(frequency);
    paramIndex++;
  }

  // CRITICAL: Apply advanced filters (dashboard universal filters)
  // This includes organizationId → practiceUids conversion
  if (advancedFilters && advancedFilters.length > 0) {
    const advancedResult = this.buildAdvancedFilterClause(advancedFilters, paramIndex);
    if (advancedResult.clause) {
      whereClauses.push(advancedResult.clause);
      queryParams.push(...advancedResult.params);
      paramIndex = advancedResult.nextIndex;
    }
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT * 
    FROM ${schema}.${table}
    ${whereClause}
    ORDER BY date_index ASC, date_value ASC
  `;

  log.debug('Executing data source query', {
    query,
    paramCount: queryParams.length,
    hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
    note: 'RBAC filtering will be applied in-memory after fetch',
  });

  const queryStart = Date.now();
  const rows = await executeAnalyticsQuery(query, queryParams);
  const queryDuration = Date.now() - queryStart;

  log.info('Database query completed', {
    schema,
    table,
    rowCount: rows.length,
    queryDuration,
    hasAdvancedFilters: advancedFilters && advancedFilters.length > 0,
  });

  return rows;
}

/**
 * Build SQL WHERE clause from advanced filters
 * Handles all filter operators: eq, neq, gt, gte, lt, lte, in, not_in, like
 */
private buildAdvancedFilterClause(
  filters: ChartFilter[],
  startIndex: number
): { clause: string; params: unknown[]; nextIndex: number } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;

  for (const filter of filters) {
    const field = filter.field;
    const operator = filter.operator || 'eq';
    const value = filter.value;

    switch (operator) {
      case 'eq':
        clauses.push(`${field} = $${paramIndex++}`);
        params.push(value);
        break;
      case 'neq':
        clauses.push(`${field} != $${paramIndex++}`);
        params.push(value);
        break;
      case 'gt':
        clauses.push(`${field} > $${paramIndex++}`);
        params.push(value);
        break;
      case 'gte':
        clauses.push(`${field} >= $${paramIndex++}`);
        params.push(value);
        break;
      case 'lt':
        clauses.push(`${field} < $${paramIndex++}`);
        params.push(value);
        break;
      case 'lte':
        clauses.push(`${field} <= $${paramIndex++}`);
        params.push(value);
        break;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          clauses.push(`${field} = ANY($${paramIndex++})`);
          params.push(value);
        } else {
          // Empty array = no results (fail-closed security)
          clauses.push(`${field} = $${paramIndex++}`);
          params.push(-1); // Impossible value
        }
        break;
      case 'not_in':
        if (Array.isArray(value) && value.length > 0) {
          clauses.push(`${field} != ALL($${paramIndex++})`);
          params.push(value);
        }
        break;
      case 'like':
        clauses.push(`${field} ILIKE $${paramIndex++}`);
        params.push(`%${value}%`);
        break;
      default:
        log.warn('Unsupported filter operator', { operator, field });
    }
  }

  return {
    clause: clauses.length > 0 ? `(${clauses.join(' AND ')})` : '',
    params,
    nextIndex: paramIndex,
  };
}
```

**Acceptance Criteria:**
- [ ] Builds parameterized WHERE clause
- [ ] Handles measure, practiceUid, providerUid, frequency filters
- [ ] **Applies advancedFilters to SQL query** (dashboard universal filters)
- [ ] Does NOT apply RBAC filtering (that's done in-memory)
- [ ] Handles all filter operators (eq, neq, gt, gte, lt, lte, in, not_in, like)
- [ ] **Empty array for 'in' operator results in impossible condition** (fail-closed security)
- [ ] Orders by date fields
- [ ] Uses executeAnalyticsQuery for execution
- [ ] Logs query execution with advanced filter status

---

### Task 1.6: Implement In-Memory Filtering (45 min) ← Revised

**Methods to implement:**
- [ ] `private applyRBACFilter(rows, context: ChartRenderContext): Record<string, unknown>[]`
- [ ] `private applyDateRangeFilter(rows, startDate?, endDate?): Record<string, unknown>[]`

**Note:** Advanced filters are now applied in SQL (Task 1.5), so no in-memory advanced filtering needed.

**Deliverables:**
```typescript
/**
 * Apply RBAC filtering in-memory
 * Filters rows based on user's accessible practices and providers
 * 
 * This is THE KEY to making cache reuse work across users with different permissions
 */
private applyRBACFilter(
  rows: Record<string, unknown>[],
  context: ChartRenderContext
): Record<string, unknown>[] {
  // Super admin / 'all' scope: no filtering needed
  if (context.permission_scope === 'all') {
    log.debug('RBAC filter: all scope, no filtering', {
      userId: context.user_id,
      rowCount: rows.length,
    });
    return rows;
  }

  let filtered = rows;

  // Filter by accessible practices (organization-level security)
  if (context.accessible_practices && context.accessible_practices.length > 0) {
    filtered = filtered.filter((row) => {
      const practiceUid = row.practice_uid as number | undefined;
      return practiceUid !== undefined && context.accessible_practices.includes(practiceUid);
    });

    log.debug('RBAC filter: practice filtering applied', {
      userId: context.user_id,
      permissionScope: context.permission_scope,
      accessiblePractices: context.accessible_practices,
      beforeCount: rows.length,
      afterCount: filtered.length,
      filtered: rows.length - filtered.length,
    });
  }

  // Filter by accessible providers (provider-level security)
  if (context.accessible_providers && context.accessible_providers.length > 0) {
    filtered = filtered.filter((row) => {
      const providerUid = row.provider_uid as number | undefined;
      // Allow NULL provider_uid (system-level data) OR matching provider_uid
      return providerUid === null || providerUid === undefined || 
             context.accessible_providers.includes(providerUid);
    });

    log.debug('RBAC filter: provider filtering applied', {
      userId: context.user_id,
      permissionScope: context.permission_scope,
      accessibleProviders: context.accessible_providers,
      beforeCount: rows.length,
      afterCount: filtered.length,
    });
  }

  // Security audit: Log if filtering resulted in empty set
  if (filtered.length === 0 && rows.length > 0) {
    log.security('RBAC filtering resulted in empty dataset', 'medium', {
      userId: context.user_id,
      permissionScope: context.permission_scope,
      originalRowCount: rows.length,
      accessiblePractices: context.accessible_practices,
      accessibleProviders: context.accessible_providers,
      reason: 'no_matching_practices_or_providers',
    });
  }

  return filtered;
}

/**
 * Apply date range filter in-memory
 */
private applyDateRangeFilter(
  rows: Record<string, unknown>[],
  startDate?: string,
  endDate?: string
): Record<string, unknown>[] {
  if (!startDate && !endDate) {
    return rows;
  }

  return rows.filter((row) => {
    const dateValue = (row.date_index || row.date_value) as string;
    
    if (startDate && dateValue < startDate) {
      return false;
    }
    
    if (endDate && dateValue > endDate) {
      return false;
    }
    
    return true;
  });
}
```

**Acceptance Criteria:**
- [ ] RBAC filtering correctly applies accessible_practices array
- [ ] RBAC filtering correctly applies accessible_providers array
- [ ] RBAC filtering skipped for permission_scope='all' (super admin)
- [ ] **Security logging for empty result sets** (audit trail)
- [ ] **RBAC filtering applied BEFORE sending to client** (critical security)
- [ ] Date range filtering works with both date_index and date_value
- [ ] Handles missing startDate or endDate

---

### Task 1.7: Implement Main Fetch Method (1.5 hours) ← Revised from 1 hour

**Methods to implement:**
- [ ] `async fetchDataSource(params: CacheQueryParams, context: ChartRenderContext, nocache: boolean): Promise<Record<string, unknown>[]>`

**Deliverables:**
```typescript
/**
 * Fetch data source with caching
 * Main entry point - handles cache lookup, database fallback, and in-memory filtering
 * 
 * IMPORTANT: RBAC filtering is applied in-memory AFTER cache/DB fetch
 * This allows maximum cache reuse across users with different permissions
 */
async fetchDataSource(
  params: CacheQueryParams,
  context: ChartRenderContext,
  nocache: boolean = false
): Promise<Record<string, unknown>[]> {
  const startTime = Date.now();

  // Build cache key components (only from chart filters, NOT from RBAC)
  const keyComponents: CacheKeyComponents = {
    dataSourceId: params.dataSourceId,
    measure: params.measure,
    practiceUid: params.practiceUid, // Only if explicit chart filter
    providerUid: params.providerUid, // Only if explicit chart filter
    frequency: params.frequency,
  };

  // Try cache first (unless nocache=true)
  if (!nocache) {
    const cached = await this.getCached(keyComponents);
    
    if (cached) {
      // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
      let filteredRows = cached.rows;

      // 1. RBAC filtering (SECURITY CRITICAL)
      filteredRows = this.applyRBACFilter(filteredRows, context);

      // 2. Date range filtering
      if (params.startDate || params.endDate) {
        filteredRows = this.applyDateRangeFilter(
          filteredRows,
          params.startDate,
          params.endDate
        );
      }

      // 3. Advanced filters
      if (params.advancedFilters && params.advancedFilters.length > 0) {
        filteredRows = this.applyAdvancedFilters(
          filteredRows,
          params.advancedFilters
        );
      }

      const duration = Date.now() - startTime;

      log.info('Data source served from cache', {
        cacheKey: cached.cacheKey,
        cacheLevel: cached.cacheLevel,
        cachedRowCount: cached.rows.length,
        afterRBAC: filteredRows.length, // After RBAC but before other filters
        finalRowCount: filteredRows.length,
        duration,
        userId: context.user_id,
        permissionScope: context.permission_scope,
      });

      return filteredRows;
    }
  }

  // Cache miss - query database
  log.info('Data source cache miss - querying database', {
    dataSourceId: params.dataSourceId,
    measure: params.measure,
    practiceUid: params.practiceUid,
    nocache,
    userId: context.user_id,
  });

  const rows = await this.queryDatabase(params);

  // Cache the result (unless nocache=true)
  if (!nocache && rows.length > 0) {
    await this.setCached(keyComponents, rows);
  }

  // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
  let filteredRows = rows;

  // 1. RBAC filtering (SECURITY CRITICAL)
  filteredRows = this.applyRBACFilter(filteredRows, context);

  // 2. Date range filtering
  if (params.startDate || params.endDate) {
    filteredRows = this.applyDateRangeFilter(
      filteredRows,
      params.startDate,
      params.endDate
    );
  }

  // 3. Advanced filters
  if (params.advancedFilters && params.advancedFilters.length > 0) {
    filteredRows = this.applyAdvancedFilters(
      filteredRows,
      params.advancedFilters
    );
  }

  const duration = Date.now() - startTime;

  log.info('Data source fetched from database', {
    totalRowCount: rows.length,
    afterRBAC: filteredRows.length,
    finalRowCount: filteredRows.length,
    duration,
    userId: context.user_id,
    permissionScope: context.permission_scope,
  });

  return filteredRows;
}
```

**Acceptance Criteria:**
- [ ] Checks cache first (unless nocache=true)
- [ ] Falls back to database on cache miss
- [ ] **Applies RBAC filtering FIRST (security critical)**
- [ ] Applies date range and advanced filters after RBAC
- [ ] Caches result after DB fetch (unless nocache=true)
- [ ] Logs all operations with timing and permission scope
- [ ] Logs row counts at each filtering stage

---

### Task 1.8: Implement Cache Management Methods (20 min) ← Revised from 30 min

**Methods to implement:**
- [ ] `async invalidate(dataSourceId?: number, measure?: string): Promise<void>` (required by CacheService)
- [ ] `async getStats(): Promise<{ totalKeys, cacheKeys, estimatedMemoryUsage, keysByLevel }>`

**Deliverables:**
```typescript
/**
 * Invalidate cache entries
 * Implementation of abstract method from CacheService base class
 * 
 * Uses inherited delPattern() method for pattern-based deletion
 */
async invalidate(dataSourceId?: number, measure?: string): Promise<void> {
  if (!dataSourceId) {
    // Clear all data source caches
    const deleted = await this.delPattern(`${this.namespace}:*`);
    log.info('All data source caches cleared', { keysDeleted: deleted });
    return;
  }

  if (measure) {
    // Invalidate specific data source + measure
    const pattern = this.buildKey(dataSourceId, 'm', measure, '*');
    const deleted = await this.delPattern(pattern);
    log.info('Cache invalidated for data source + measure', {
      dataSourceId,
      measure,
      keysDeleted: deleted,
    });
  } else {
    // Invalidate entire data source
    const pattern = this.buildKey(dataSourceId, '*');
    const deleted = await this.delPattern(pattern);
    log.info('Cache invalidated for data source', {
      dataSourceId,
      keysDeleted: deleted,
    });
  }
  // Note: Error handling automatic via base class delPattern()
}

/**
 * Get cache statistics
 * Uses inherited scan() method from CacheService base class
 */
async getStats(): Promise<{
  totalKeys: number;
  cacheKeys: string[];
  estimatedMemoryUsage: number;
  keysByLevel: Record<string, number>;
}> {
  // Use base class scan() method
  const keys = await this.scan(`${this.namespace}:*`, 1000);

  if (keys.length === 0) {
    return {
      totalKeys: 0,
      cacheKeys: [],
      estimatedMemoryUsage: 0,
      keysByLevel: {},
    };
  }

  const client = this.getClient();
  if (!client) {
    return {
      totalKeys: keys.length,
      cacheKeys: keys,
      estimatedMemoryUsage: 0,
      keysByLevel: {},
    };
  }

  let totalSize = 0;
  const keysByLevel: Record<string, number> = {
    'Level 0 (Full DS)': 0,
    'Level 1 (Measure)': 0,
    'Level 2 (Measure+Practice)': 0,
    'Level 3 (Measure+Practice+Freq)': 0,
    'Level 4 (Full)': 0,
  };

  for (const key of keys) {
    const value = await client.get(key);
    if (value) {
      totalSize += Buffer.byteLength(value, 'utf8');

      // Count wildcards to determine level
      const wildcards = (key.match(/\*/g) || []).length;
      if (wildcards === 4) {
        keysByLevel['Level 0 (Full DS)']++;
      } else if (wildcards === 3) {
        keysByLevel['Level 1 (Measure)']++;
      } else if (wildcards === 2) {
        keysByLevel['Level 2 (Measure+Practice)']++;
      } else if (wildcards === 1) {
        keysByLevel['Level 3 (Measure+Practice+Freq)']++;
      } else {
        keysByLevel['Level 4 (Full)']++;
      }
    }
  }

  return {
    totalKeys: keys.length,
    cacheKeys: keys,
    estimatedMemoryUsage: totalSize,
    keysByLevel,
  };
  // Note: Error handling automatic via base class scan()
}
```

**Acceptance Criteria:**
- [ ] `invalidate()` is required implementation of CacheService abstract method
- [ ] `invalidate()` uses inherited `delPattern()` method
- [ ] `invalidate()` supports dataSourceId and/or measure parameters
- [ ] `getStats()` uses inherited `scan()` method
- [ ] `getStats()` calculates memory usage
- [ ] `getStats()` groups keys by level
- [ ] **BENEFIT:** Error handling, Redis unavailable handled by base class methods

---

### Task 1.9: Export from Cache Index (10 min) ← NEW

**File:** `lib/cache/index.ts`

**Deliverables:**
- [ ] Export `dataSourceCache` singleton from index
- [ ] Export types for external use

**Code:**
```typescript
// Add to lib/cache/index.ts:
export { dataSourceCache } from './data-source-cache';

// Add type exports
export type {
  CacheKeyComponents,
  CacheQueryParams,
} from './data-source-cache';
```

**Acceptance Criteria:**
- [ ] Cache exported from central index file
- [ ] Consistent with other cache exports (rbacCache, authCache, etc.)
- [ ] Types exported for external use
- [ ] **BENEFIT:** Consistent import pattern: `import { dataSourceCache } from '@/lib/cache'`

---

### Phase 1 Completion Checklist
- [ ] All 9 tasks completed ← Revised from 8
- [ ] File compiles without TypeScript errors
- [ ] All methods documented with JSDoc comments
- [ ] Extends `CacheService` base class correctly
- [ ] Singleton instance exported from `lib/cache/index.ts`
- [ ] Code follows project style guidelines
- [ ] **SECURITY: RBAC filtering tested with multiple user scenarios**
- [ ] **SECURITY: Verified no cross-user data leakage**
- [ ] **ARCHITECTURE: Consistent with existing cache services**

---

## PHASE 2: Query Builder Integration

### Task 2.1: Import Cache Service (15 min)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Import `dataSourceCache` and `CacheQueryParams`
- [ ] Import types needed

**Code:**
```typescript
import { dataSourceCache, type CacheQueryParams } from '@/lib/cache/data-source-cache';
```

**Acceptance Criteria:**
- [ ] No import errors
- [ ] Types available in file

---

### Task 2.2: Add Helper Method to Extract Provider UID (30 min)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Add `private extractProviderUid(params: AnalyticsQueryParams): number | undefined`

**Code:**
```typescript
/**
 * Extract provider_uid from params
 * Checks params.provider_uid and advanced_filters
 */
private extractProviderUid(params: AnalyticsQueryParams): number | undefined {
  // Direct provider_uid param
  if (params.provider_uid) {
    return typeof params.provider_uid === 'number'
      ? params.provider_uid
      : parseInt(String(params.provider_uid), 10);
  }

  // Check advanced filters for provider_uid
  if (params.advanced_filters) {
    const providerFilter = params.advanced_filters.find(
      (f) => f.field === 'provider_uid' && f.operator === 'eq'
    );
    
    if (providerFilter && typeof providerFilter.value === 'number') {
      return providerFilter.value;
    }
  }

  return undefined;
}
```

**Acceptance Criteria:**
- [ ] Returns provider_uid from params
- [ ] Returns provider_uid from advanced_filters
- [ ] Returns undefined if not found
- [ ] Handles type conversion correctly

---

### Task 2.3: Add Helper Method to Calculate Total (30 min)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Add `private calculateTotal(rows: Record<string, unknown>[]): number`

**Code:**
```typescript
/**
 * Calculate total count from filtered rows
 * For currency: sum measure_value, for others: count rows
 */
private calculateTotal(rows: Record<string, unknown>[]): number {
  if (rows.length === 0) {
    return 0;
  }

  const firstRow = rows[0];
  const measureType = firstRow?.measure_type;

  if (measureType === 'currency') {
    // Sum all measure_value fields
    return rows.reduce((sum, row) => {
      const value = row.measure_value as number;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
  }

  // For count, just return row count
  return rows.length;
}
```

**Acceptance Criteria:**
- [ ] Returns 0 for empty arrays
- [ ] Sums measure_value for currency type
- [ ] Returns row count for non-currency types
- [ ] Handles missing/invalid values gracefully

---

### Task 2.4: Update queryMeasures() Method (1.5 hours)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Integrate cache into `queryMeasures()` method
- [ ] Build `CacheQueryParams` from `AnalyticsQueryParams`
- [ ] Call `dataSourceCache.fetchDataSource()`
- [ ] Update return value with cache_hit flag
- [ ] Preserve existing special case handling (multiple_series, period_comparison)

**Code:**
```typescript
async queryMeasures(
  params: AnalyticsQueryParams,
  context: ChartRenderContext
): Promise<AnalyticsQueryResult> {
  const startTime = Date.now();

  try {
    // Special handling for multiple series (not cached yet)
    if (params.multiple_series && params.multiple_series.length > 0) {
      return await this.queryMultipleSeries(params, context);
    }

    // Special handling for period comparison (not cached yet)
    if (params.period_comparison?.enabled) {
      return await this.queryWithPeriodComparison(params, context);
    }

    this.log.info('Building analytics query with caching', {
      params: { ...params, limit: params.limit || 1000 },
      userId: context.user_id,
    });

    // Get data source configuration
    let dataSourceConfig = null;
    let tableName = 'agg_app_measures';
    let schemaName = 'ih';

    if (params.data_source_id) {
      dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);

      if (dataSourceConfig) {
        tableName = dataSourceConfig.tableName;
        schemaName = dataSourceConfig.schemaName;
      }
    }

    // Validate table access
    await this.validateTable(tableName, schemaName, dataSourceConfig);

    // ===== NEW: CACHE INTEGRATION =====
    
    // Extract provider_uid from params
    const providerUid = this.extractProviderUid(params);

    // Build cache query params
    const cacheParams: CacheQueryParams = {
      dataSourceId: params.data_source_id!,
      schema: schemaName,
      table: tableName,
      
      // Cache key components
      measure: params.measure,
      practiceUid: params.practice_uid,
      providerUid: providerUid,
      frequency: params.frequency,
      
      // In-memory filters (NOT in cache key)
      startDate: params.start_date,
      endDate: params.end_date,
      advancedFilters: params.advanced_filters,
    };

    // Fetch with caching (passing ChartRenderContext for RBAC)
    const rows = await dataSourceCache.fetchDataSource(
      cacheParams,
      context, // ChartRenderContext includes accessible_practices for RBAC
      params.nocache || false
    );

    // Calculate total
    const totalCount = this.calculateTotal(rows);

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: rows as AggAppMeasure[],
      total_count: totalCount,
      query_time_ms: duration,
      cache_hit: !params.nocache, // Approximate
    };

    this.log.info('Analytics query completed (with caching)', {
      dataSourceId: params.data_source_id,
      measure: params.measure,
      practiceUid: params.practice_uid,
      rowCount: rows.length,
      totalCount,
      duration,
      userId: context.user_id,
    });

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.log.error('Analytics query failed', {
      error: errorMessage,
      params,
      userId: context.user_id,
    });

    throw new Error(`Query execution failed: ${errorMessage}`);
  }
}
```

**Acceptance Criteria:**
- [ ] Cache integrated before DB query
- [ ] Special cases (multiple_series, period_comparison) still work
- [ ] `nocache` parameter respected
- [ ] `cache_hit` flag set in result
- [ ] Existing error handling preserved
- [ ] Logging updated with cache info

---

### Task 2.5: Update queryMultipleSeries() for Caching (45 min)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Modify `queryMultipleSeries()` to fetch each series separately
- [ ] Each series can hit cache independently
- [ ] Combine results with series metadata

**Code:**
```typescript
private async queryMultipleSeries(
  params: AnalyticsQueryParams,
  context: ChartRenderContext
): Promise<AnalyticsQueryResult> {
  const startTime = Date.now();

  if (!params.multiple_series || params.multiple_series.length === 0) {
    throw new Error('Multiple series configuration is required');
  }

  this.log.info('Building multiple series query with caching', {
    seriesCount: params.multiple_series.length,
    measures: params.multiple_series.map((s) => s.measure),
    userId: context.user_id,
  });

  // Fetch each series separately (can hit cache per measure)
  const seriesPromises = params.multiple_series.map(async (series) => {
    const seriesParams: AnalyticsQueryParams = {
      ...params,
      measure: series.measure,
      multiple_series: undefined, // Clear to avoid recursion
    };

    // Recursive call - will hit cache per measure
    const result = await this.queryMeasures(seriesParams, context);

    // Tag with series metadata
    return result.data.map((item) => ({
      ...item,
      series_id: series.id,
      series_label: series.label,
      series_aggregation: series.aggregation,
      ...(series.color && { series_color: series.color }),
    }));
  });

  const allSeriesData = await Promise.all(seriesPromises);
  const combinedData = allSeriesData.flat();

  const duration = Date.now() - startTime;

  const result: AnalyticsQueryResult = {
    data: combinedData,
    total_count: combinedData.length,
    query_time_ms: duration,
    cache_hit: true, // Each series fetched from cache (potentially)
  };

  this.log.info('Multiple series query completed (with caching)', {
    seriesCount: params.multiple_series.length,
    totalRecords: combinedData.length,
    queryTime: duration,
    userId: context.user_id,
  });

  return result;
}
```

**Acceptance Criteria:**
- [ ] Fetches each series separately via recursive `queryMeasures()` call
- [ ] Each series can hit cache independently
- [ ] Series metadata correctly applied
- [ ] Results combined correctly
- [ ] Logging includes cache info

---

### Task 2.6: Verify Period Comparison Works with Cache (30 min)

**File:** `lib/services/analytics-query-builder.ts`

**Deliverables:**
- [ ] Review `queryWithPeriodComparison()` implementation
- [ ] Verify both periods call `queryMeasures()` (which now uses cache)
- [ ] Add logging to confirm cache hits
- [ ] No code changes needed (should work automatically)

**Verification:**
```typescript
// In queryWithPeriodComparison() - already calls queryMeasures():
[currentResult, comparisonResult] = await Promise.all([
  this.executeBaseQuery(params, context),      // Calls queryMeasures()
  this.executeBaseQuery(comparisonParams, context), // Calls queryMeasures()
]);

// Both will hit cache because:
// - Same measure, practice, provider, frequency
// - Only date range differs (filtered in-memory)
```

**Acceptance Criteria:**
- [ ] Period comparison code reviewed
- [ ] Confirmed both periods call `queryMeasures()`
- [ ] Both periods can hit same cache entry
- [ ] Date ranges filtered in-memory
- [ ] No code changes required

---

### Phase 2 Completion Checklist
- [ ] All 6 tasks completed
- [ ] File compiles without TypeScript errors
- [ ] All chart types benefit from caching
- [ ] Special cases (multiple_series, period_comparison) work correctly
- [ ] `nocache` parameter respected
- [ ] Logging includes cache information

---

## PHASE 3: Testing & Validation

### Task 3.0: CRITICAL Security Tests for RBAC Filtering (1 hour) ← NEW

**File:** `tests/unit/cache/rbac-security.test.ts` (NEW)

**Purpose:** Verify that in-memory RBAC filtering prevents cross-user data leakage

**Critical Test Scenarios:**

```typescript
describe('DataSourceCache - RBAC Security', () => {
  describe('CRITICAL: Cross-User Data Isolation', () => {
    it('should NOT allow practice user to see other practices data via cache', async () => {
      // User A: Practice admin with practices [114, 115, 116]
      const contextA: ChartRenderContext = {
        user_id: 'user-a',
        accessible_practices: [114, 115, 116],
        accessible_providers: [],
        roles: ['practice_admin'],
        permission_scope: 'organization',
      };

      // User B: Practice user with practice [114] ONLY
      const contextB: ChartRenderContext = {
        user_id: 'user-b',
        accessible_practices: [114],
        accessible_providers: [],
        roles: ['practice_user'],
        permission_scope: 'organization',
      };

      const params = {
        dataSourceId: 1,
        schema: 'ih',
        table: 'agg_app_measures',
        measure: 'Charges by Provider',
        frequency: 'Monthly',
        // NO practiceUid filter - should use RBAC
      };

      // User A fetches data (populates cache with practices 114, 115, 116)
      const resultA = await dataSourceCache.fetchDataSource(params, contextA);
      expect(resultA.length).toBeGreaterThan(0);
      const practicesA = [...new Set(resultA.map(r => r.practice_uid))];
      expect(practicesA).toContain(114);
      expect(practicesA).toContain(115);
      expect(practicesA).toContain(116);

      // User B fetches data (same cache key, but MUST be filtered)
      const resultB = await dataSourceCache.fetchDataSource(params, contextB);
      expect(resultB.length).toBeGreaterThan(0);
      const practicesB = [...new Set(resultB.map(r => r.practice_uid))];
      expect(practicesB).toEqual([114]); // ONLY practice 114
      expect(practicesB).not.toContain(115); // MUST NOT see 115
      expect(practicesB).not.toContain(116); // MUST NOT see 116

      // Verify data counts are different
      expect(resultB.length).toBeLessThan(resultA.length);
    });

    it('should allow super admin to see all data', async () => {
      const superAdminContext: ChartRenderContext = {
        user_id: 'admin',
        accessible_practices: [],
        accessible_providers: [],
        roles: ['super_admin'],
        permission_scope: 'all',
      };

      const params = {
        dataSourceId: 1,
        schema: 'ih',
        table: 'agg_app_measures',
        measure: 'Charges by Provider',
        frequency: 'Monthly',
      };

      const result = await dataSourceCache.fetchDataSource(params, superAdminContext);
      expect(result.length).toBeGreaterThan(0);
      
      // Should see multiple practices
      const practices = [...new Set(result.map(r => r.practice_uid))];
      expect(practices.length).toBeGreaterThan(1);
    });

    it('should return empty array for user with no accessible practices', async () => {
      const noAccessContext: ChartRenderContext = {
        user_id: 'no-access',
        accessible_practices: [],
        accessible_providers: [],
        roles: ['practice_user'],
        permission_scope: 'organization',
      };

      const params = {
        dataSourceId: 1,
        schema: 'ih',
        table: 'agg_app_measures',
        measure: 'Charges by Provider',
        frequency: 'Monthly',
      };

      const result = await dataSourceCache.fetchDataSource(params, noAccessContext);
      expect(result).toEqual([]);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] **ALL security tests MUST pass before Phase 3 continues**
- [ ] Test verifies cross-user data isolation
- [ ] Test verifies super admin access
- [ ] Test verifies empty accessible_practices behavior
- [ ] Test verifies provider-level filtering
- [ ] Security audit logs reviewed

---

### Task 3.1: Unit Tests for Cache Service (1.5 hours)

**File:** `tests/unit/cache/data-source-cache.test.ts` (NEW)

**Deliverables:**
- [ ] Test cache key building
- [ ] Test key hierarchy generation
- [ ] Test date range filtering
- [ ] Test advanced filters
- [ ] Test RBAC filtering (in queryDatabase)
- [ ] Test cache get/set/invalidate
- [ ] Test graceful error handling

**Test Cases:**
```typescript
describe('DataSourceCache', () => {
  describe('buildCacheKey', () => {
    it('should build key with all components', () => {
      const cache = new DataSourceCache();
      const key = cache.buildCacheKey({
        dataSourceId: 1,
        measure: 'Charges by Provider',
        practiceUid: 114,
        providerUid: 1001,
        frequency: 'Monthly',
      });
      expect(key).toBe('ds:1:m:Charges by Provider:p:114:prov:1001:freq:Monthly');
    });

    it('should use wildcards for missing components', () => {
      const cache = new DataSourceCache();
      const key = cache.buildCacheKey({
        dataSourceId: 1,
        measure: 'Charges',
        practiceUid: 114,
      });
      expect(key).toBe('ds:1:m:Charges:p:114:prov:*:freq:*');
    });
  });

  describe('generateKeyHierarchy', () => {
    it('should return keys from specific to general', () => {
      const cache = new DataSourceCache();
      const keys = cache.generateKeyHierarchy({
        dataSourceId: 1,
        measure: 'Charges',
        practiceUid: 114,
        providerUid: 1001,
        frequency: 'Monthly',
      });

      expect(keys.length).toBeGreaterThan(0);
      expect(keys[0]).toContain('prov:1001');
      expect(keys[keys.length - 1]).toContain('prov:*');
    });
  });

  describe('applyDateRangeFilter', () => {
    it('should filter by start date', () => {
      const cache = new DataSourceCache();
      const rows = [
        { date_index: '2024-01-01', measure_value: 100 },
        { date_index: '2024-02-01', measure_value: 200 },
      ];

      const filtered = cache['applyDateRangeFilter'](rows, '2024-02-01', undefined);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].date_index).toBe('2024-02-01');
    });

    it('should filter by end date', () => {
      const cache = new DataSourceCache();
      const rows = [
        { date_index: '2024-01-01', measure_value: 100 },
        { date_index: '2024-02-01', measure_value: 200 },
      ];

      const filtered = cache['applyDateRangeFilter'](rows, undefined, '2024-01-31');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].date_index).toBe('2024-01-01');
    });

    it('should filter by both dates', () => {
      const cache = new DataSourceCache();
      const rows = [
        { date_index: '2024-01-01', measure_value: 100 },
        { date_index: '2024-02-01', measure_value: 200 },
        { date_index: '2024-03-01', measure_value: 300 },
      ];

      const filtered = cache['applyDateRangeFilter'](rows, '2024-02-01', '2024-02-28');
      expect(filtered).toHaveLength(1);
    });
  });

  describe('applyAdvancedFilters', () => {
    it('should apply eq filter', () => {
      const cache = new DataSourceCache();
      const rows = [
        { provider_name: 'Dr. Smith', measure_value: 100 },
        { provider_name: 'Dr. Jones', measure_value: 200 },
      ];

      const filtered = cache['applyAdvancedFilters'](rows, [
        { field: 'provider_name', operator: 'eq', value: 'Dr. Smith' },
      ]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].provider_name).toBe('Dr. Smith');
    });

    it('should apply in filter', () => {
      const cache = new DataSourceCache();
      const rows = [
        { provider_uid: 1, measure_value: 100 },
        { provider_uid: 2, measure_value: 200 },
        { provider_uid: 3, measure_value: 300 },
      ];

      const filtered = cache['applyAdvancedFilters'](rows, [
        { field: 'provider_uid', operator: 'in', value: [1, 3] },
      ]);
      expect(filtered).toHaveLength(2);
    });

    it('should apply multiple filters', () => {
      const cache = new DataSourceCache();
      const rows = [
        { provider_uid: 1, measure_value: 100 },
        { provider_uid: 2, measure_value: 200 },
        { provider_uid: 1, measure_value: 150 },
      ];

      const filtered = cache['applyAdvancedFilters'](rows, [
        { field: 'provider_uid', operator: 'eq', value: 1 },
        { field: 'measure_value', operator: 'gte', value: 150 },
      ]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].measure_value).toBe(150);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] All test cases pass
- [ ] Code coverage >80%
- [ ] Edge cases tested
- [ ] Error handling tested

---

### Task 3.2: Integration Tests for Query Builder (1 hour)

**File:** `tests/integration/analytics/cache-integration.test.ts` (NEW)

**Deliverables:**
- [ ] Test cache miss → DB query → cache set
- [ ] Test cache hit → fast retrieval
- [ ] Test nocache parameter
- [ ] Test multiple charts sharing cache
- [ ] Test RBAC filtering
- [ ] Test multiple series caching

**Test Cases:**
```typescript
describe('Analytics Cache Integration', () => {
  let userContext: UserContext;

  beforeEach(async () => {
    // Create test user with practice access
    const user = await UserFactory.create();
    const practice = await PracticeFactory.create({ practice_uid: 114 });
    
    userContext = {
      user_id: user.user_id,
      practices: [practice],
      is_super_admin: false,
      // ... other context fields
    };

    // Clear cache before each test
    await dataSourceCache.clearAll();
  });

  it('should cache query results on first request', async () => {
    const params: AnalyticsQueryParams = {
      data_source_id: 1,
      measure: 'Charges by Provider',
      frequency: 'Monthly',
      practice_uid: 114,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
    };

    const result = await analyticsQueryBuilder.queryMeasures(params, chartContext);
    
    expect(result.data.length).toBeGreaterThan(0);
    
    // Verify cache was populated
    const stats = await dataSourceCache.getStats();
    expect(stats.totalKeys).toBe(1);
  });

  it('should serve from cache on second request', async () => {
    const params: AnalyticsQueryParams = {
      data_source_id: 1,
      measure: 'Charges by Provider',
      frequency: 'Monthly',
      practice_uid: 114,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
    };

    // First request (cache miss)
    const result1 = await analyticsQueryBuilder.queryMeasures(params, chartContext);
    const firstQueryTime = result1.query_time_ms;

    // Second request (cache hit)
    const result2 = await analyticsQueryBuilder.queryMeasures(params, chartContext);
    const secondQueryTime = result2.query_time_ms;

    expect(result2.data).toEqual(result1.data);
    expect(secondQueryTime).toBeLessThan(firstQueryTime);
    expect(secondQueryTime).toBeLessThan(50); // Should be very fast
  });

  it('should respect nocache parameter', async () => {
    const params: AnalyticsQueryParams = {
      data_source_id: 1,
      measure: 'Patient Count',
      frequency: 'Monthly',
      practice_uid: 114,
      nocache: true,
    };

    await analyticsQueryBuilder.queryMeasures(params, chartContext);
    
    // Cache should be empty
    const stats = await dataSourceCache.getStats();
    expect(stats.totalKeys).toBe(0);
  });

  it('should share cache across multiple charts with different date ranges', async () => {
    const baseParams = {
      data_source_id: 1,
      measure: 'Revenue',
      frequency: 'Monthly',
      practice_uid: 114,
    };

    // Chart 1: Q1 data
    const result1 = await analyticsQueryBuilder.queryMeasures(
      { ...baseParams, start_date: '2024-01-01', end_date: '2024-03-31' },
      chartContext
    );

    // Chart 2: Q2 data (should hit same cache, filter in-memory)
    const result2 = await analyticsQueryBuilder.queryMeasures(
      { ...baseParams, start_date: '2024-04-01', end_date: '2024-06-30' },
      chartContext
    );

    // Only one cache entry (shared)
    const stats = await dataSourceCache.getStats();
    expect(stats.totalKeys).toBe(1);

    // Results should be different (different date ranges)
    expect(result1.data).not.toEqual(result2.data);
  });

  it('should cache multiple series independently', async () => {
    const params: AnalyticsQueryParams = {
      data_source_id: 1,
      frequency: 'Monthly',
      practice_uid: 114,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      multiple_series: [
        { id: 'charges', measure: 'Charges by Provider', aggregation: 'sum', label: 'Charges' },
        { id: 'payments', measure: 'Payments by Provider', aggregation: 'sum', label: 'Payments' },
      ],
    };

    const result = await analyticsQueryBuilder.queryMeasures(params, chartContext);
    
    expect(result.data.length).toBeGreaterThan(0);
    
    // Should have 2 cache entries (one per measure)
    const stats = await dataSourceCache.getStats();
    expect(stats.totalKeys).toBe(2);
  });

  it('should enforce RBAC filtering', async () => {
    // User has access to practice 114 only
    const params: AnalyticsQueryParams = {
      data_source_id: 1,
      measure: 'Charges by Provider',
      frequency: 'Monthly',
      practice_uid: 999, // Different practice
    };

    const result = await analyticsQueryBuilder.queryMeasures(params, chartContext);
    
    // Should return no data (RBAC filtered)
    expect(result.data.length).toBe(0);
  });
});
```

**Acceptance Criteria:**
- [ ] All test cases pass
- [ ] Tests run in isolation
- [ ] Tests clean up after themselves
- [ ] RBAC enforcement verified
- [ ] Cache behavior verified

---

### Task 3.3: Manual Testing (30 min)

**Deliverables:**
- [ ] Test dashboard loading (cold cache)
- [ ] Test dashboard loading (warm cache)
- [ ] Verify performance improvement
- [ ] Test cache invalidation
- [ ] Test nocache parameter via API

**Test Scenarios:**

1. **Cold Cache Performance:**
   - Clear Redis cache
   - Load dashboard with 6 charts
   - Record total time
   - Verify all charts load

2. **Warm Cache Performance:**
   - Load same dashboard again
   - Record total time
   - Verify <100ms load time
   - Check browser network tab

3. **Cache Invalidation:**
   - Load dashboard (populate cache)
   - Call invalidation API
   - Load dashboard again (should query DB)

4. **RBAC Security:**
   - Login as org admin
   - Load dashboard (should see org data only)
   - Verify no data leakage

5. **Nocache Parameter:**
   - Add `nocache=true` to API request
   - Verify DB query executed
   - Verify no cache entry created

**Acceptance Criteria:**
- [ ] Cold cache: Dashboard loads correctly
- [ ] Warm cache: Dashboard loads <100ms
- [ ] Cache invalidation works
- [ ] RBAC enforced correctly
- [ ] Nocache parameter works

---

### Phase 3 Completion Checklist
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual testing complete
- [ ] Performance verified
- [ ] Security verified

---

## PHASE 4: Monitoring & Deployment

### Task 4.1: Create Cache Statistics API Endpoint (30 min)

**File:** `app/api/admin/cache/stats/route.ts` (NEW)

**Deliverables:**
- [ ] Create API endpoint for cache statistics
- [ ] Require admin permissions
- [ ] Return cache stats (total keys, memory usage, keys by level)

**Code:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { dataSourceCache } from '@/lib/cache/data-source-cache';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require super admin
    if (!session.user.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stats = await dataSourceCache.getStats();

    log.info('Cache statistics retrieved', {
      userId: session.user.user_id,
      totalKeys: stats.totalKeys,
      memoryMB: Math.round(stats.estimatedMemoryUsage / 1024 / 1024),
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalKeys: stats.totalKeys,
        estimatedMemoryUsageMB: Math.round(stats.estimatedMemoryUsage / 1024 / 1024),
        keysByLevel: stats.keysByLevel,
        cacheKeys: stats.cacheKeys.slice(0, 10), // Show first 10 keys
      },
    });
  } catch (error) {
    log.error('Failed to get cache statistics', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Endpoint requires authentication
- [ ] Endpoint requires super admin
- [ ] Returns cache statistics
- [ ] Logs access

---

### Task 4.2: Create Cache Invalidation API Endpoint (30 min)

**File:** `app/api/admin/cache/invalidate/route.ts` (NEW)

**Deliverables:**
- [ ] Create API endpoint for cache invalidation
- [ ] Support partial invalidation (by data source, measure, practice)
- [ ] Require admin permissions

**Code:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { dataSourceCache } from '@/lib/cache/data-source-cache';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require super admin
    if (!session.user.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { dataSourceId, measure, practiceUid, all } = body;

    let keysDeleted = 0;

    if (all) {
      // Clear all cache entries
      keysDeleted = await dataSourceCache.clearAll();
      log.info('All cache entries cleared', {
        userId: session.user.user_id,
        keysDeleted,
      });
    } else {
      // Partial invalidation
      keysDeleted = await dataSourceCache.invalidate({
        dataSourceId: dataSourceId ? parseInt(dataSourceId, 10) : undefined,
        measure,
        practiceUid: practiceUid ? parseInt(practiceUid, 10) : undefined,
      });

      log.info('Cache partially invalidated', {
        userId: session.user.user_id,
        dataSourceId,
        measure,
        practiceUid,
        keysDeleted,
      });
    }

    return NextResponse.json({
      success: true,
      keysDeleted,
    });
  } catch (error) {
    log.error('Failed to invalidate cache', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Endpoint requires authentication
- [ ] Endpoint requires super admin
- [ ] Supports full cache clear (`all: true`)
- [ ] Supports partial invalidation
- [ ] Logs invalidation operations

---

### Task 4.3: Update Documentation (30 min)

**Files:**
- [ ] Update `README.md` with cache configuration
- [ ] Update `docs/CACHING.md` (create if needed)
- [ ] Document cache statistics endpoint
- [ ] Document cache invalidation endpoint

**Documentation sections:**
- Overview of caching strategy
- Cache key structure
- TTL configuration
- Monitoring cache performance
- Invalidation strategies
- Troubleshooting

**Acceptance Criteria:**
- [ ] Documentation is clear and complete
- [ ] Examples provided
- [ ] API endpoints documented

---

### Task 4.4: Deployment Plan (Coordination)

**Deliverables:**
- [ ] Create deployment checklist
- [ ] Plan staging deployment
- [ ] Plan production rollout strategy
- [ ] Define rollback procedure

**Deployment Checklist:**

**Pre-Deployment:**
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Redis available in environment
- [ ] REDIS_URL configured

**Staging Deployment:**
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Monitor cache hit rates
- [ ] Verify performance gains
- [ ] Check Redis memory usage

**Production Rollout (Gradual):**
- [ ] Deploy code (cache disabled by default)
- [ ] Enable for 10% of requests (feature flag)
- [ ] Monitor for 24 hours:
  - Cache hit rate
  - Dashboard load times
  - Redis memory
  - Error rates
- [ ] Increase to 50%
- [ ] Monitor for 24 hours
- [ ] Increase to 100%

**Rollback Procedure:**
- [ ] Set environment variable `DISABLE_CACHE=true`
- [ ] Clear Redis cache
- [ ] Monitor DB query rates
- [ ] Investigate issues

**Acceptance Criteria:**
- [ ] Deployment plan documented
- [ ] Rollback procedure tested
- [ ] Monitoring alerts configured

---

### Phase 4 Completion Checklist
- [ ] Cache statistics endpoint created
- [ ] Cache invalidation endpoint created
- [ ] Documentation updated
- [ ] Deployment plan created
- [ ] Ready for staging deployment

---

## Final Checklist - Implementation Complete

### Code Quality
- [ ] All TypeScript errors resolved
- [ ] All linter warnings fixed
- [ ] Code follows project style guide
- [ ] All methods documented with JSDoc
- [ ] No console.log statements (use logger)

### Testing
- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] Manual testing complete
- [ ] Performance benchmarks met
- [ ] Security validated

### Documentation
- [ ] Implementation plan complete
- [ ] API documentation updated
- [ ] README updated
- [ ] Deployment guide created

### Deployment
- [ ] Staging deployment successful
- [ ] Performance verified in staging
- [ ] Production rollout plan approved
- [ ] Monitoring alerts configured

---

## Success Metrics

### Must Achieve
- ✅ Cache hit rate: >80% (after warm-up)
- ✅ Dashboard load time: <100ms (warm cache)
- ✅ DB query reduction: >90%
- ✅ Zero security vulnerabilities
- ✅ Graceful degradation on errors

### Nice to Have
- ✅ Cache hit rate: >95%
- ✅ Dashboard load time: <50ms
- ✅ Automated cache warming
- ✅ Cache analytics dashboard

---

## Time Estimate Summary (REVISED - Leveraging Base Class)

| Phase | Tasks | Estimated Time | Time Savings |
|-------|-------|----------------|--------------|
| **Phase 1: Core Cache Service** | 9 tasks | **4-5 hours** | ✅ 1-2 hours saved (using CacheService) |
| **Phase 2: Query Builder Integration** | 6 tasks | **3-4 hours** | - |
| **Phase 3: Testing & Validation** | 4 tasks | **3-4 hours** | - |
| **Phase 4: Monitoring & Deployment** | 4 tasks | **1 hour** | - |
| **TOTAL** | **23 tasks** | **11-14 hours** | ✅ 1-2 hours faster than standalone

**Key Savings from Extending CacheService:**
- ✅ No need to implement: get(), set(), del(), delPattern(), scan()
- ✅ Automatic error handling and graceful degradation
- ✅ Consistent key naming and logging patterns
- ✅ JSON serialization/deserialization handled
- ✅ Redis unavailable handling built-in

---

## Next Steps

1. ✅ Review this implementation plan
2. ✅ Approve approach
3. 🔨 Begin Phase 1: Core Cache Service
4. 🔨 Continue through all phases
5. 🚀 Deploy to staging
6. 🚀 Deploy to production

**Ready to implement! Expected impact: 97% faster dashboard loads** 🚀

