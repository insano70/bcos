# Dashboard Redis Caching - Implementation Proposal

**Date:** October 14, 2025  
**Status:** Proposal  
**Priority:** HIGH  
**Estimated Effort:** 8-12 hours

---

## Executive Summary

**Current State:** Dashboard data has **NO Redis caching**. The `DashboardQueryCache` is an in-memory Map that only exists for a single request (query deduplication within one render).

**Problem:**
- Every dashboard load executes full database queries
- No caching between requests or users
- Same dashboard loaded by different users = duplicate queries
- Dashboard refresh = full query execution again
- Performance impact: ~2-4 seconds per dashboard load

**Proposed Solution:** Implement **Redis-backed dashboard data caching** with intelligent TTL and invalidation.

**Expected Impact:**
- 🚀 **70-80% faster** dashboard loads (cached)
- 💾 **90% reduction** in database queries for popular dashboards
- ⚡ **Sub-500ms** response time for cached dashboards
- 📉 **Reduced database load** by ~60%

---

## Current Architecture Analysis

### What Exists Today

#### 1. `DashboardQueryCache` (In-Memory Only)
**Location:** `lib/services/dashboard-query-cache.ts`

**Type:** In-memory JavaScript `Map`  
**Scope:** Per-request only  
**Lifecycle:** Created → Used → Cleared (within single API call)

```typescript
export class DashboardQueryCache {
  private cache: Map<string, Promise<any>> = new Map(); // ❌ In-memory only!
  
  async get(queryHash, executor) {
    // Only caches within THIS request
    // Lost after request completes
  }
  
  clear() {
    this.cache.clear(); // Called at end of every request
  }
}
```

**Purpose:** Query deduplication within a single dashboard render (prevents duplicate queries for charts with identical data needs).

**What it DOES do:**
- ✅ Prevents duplicate queries within ONE dashboard render
- ✅ If 5 charts need same data, only 1 query executes
- ✅ Stats tracking (hits, misses, dedup rate)

**What it DOES NOT do:**
- ❌ No caching across requests
- ❌ No caching across users
- ❌ No persistence to Redis
- ❌ No TTL management
- ❌ No invalidation strategy

#### 2. Existing Redis Cache Services

**Chart Data Cache** (`lib/cache/chart-data-cache.ts`):
- Caches **individual chart** data
- 5-minute TTL
- Pattern-based invalidation
- ✅ **Has Redis integration**

**Chart Config Cache** (`lib/cache/chart-config-cache.ts`):
- Caches chart metadata (columns, palettes, etc.)
- 24-hour TTL
- ✅ **Has Redis integration**

**Key Insight:** We have Redis caching for individual charts, but **NOT for dashboard batch renders**.

---

## Problem Statement

### Scenario 1: Multiple Users Loading Same Dashboard
```
User A loads "Executive Dashboard" → 10 charts, 15 queries, 2.5s
User B loads "Executive Dashboard" (5 mins later) → 10 charts, 15 queries, 2.5s
User C loads "Executive Dashboard" (10 mins later) → 10 charts, 15 queries, 2.5s

Total: 45 queries, 7.5s of database load

❌ NO data reuse between users
```

### Scenario 2: User Refreshes Dashboard
```
User loads dashboard → 15 queries, 2.5s
User clicks refresh (30 seconds later) → 15 queries, 2.5s

❌ NO caching between refreshes
```

### Scenario 3: Popular Dashboard (CEO Dashboard)
```
10 executives load CEO Dashboard throughout the day
Each load: 20 queries, 3s

Total: 200 queries for IDENTICAL data

❌ NO caching across organization
```

---

## Proposed Solution

### Architecture: Two-Layer Caching

#### Layer 1: In-Memory Deduplication (Exists Today) ✅
**Purpose:** Deduplicate queries WITHIN a single dashboard render  
**Scope:** Request-scoped  
**Implementation:** `DashboardQueryCache` (already complete)

#### Layer 2: Redis Persistence (NEW - To Implement) ❌
**Purpose:** Cache dashboard results ACROSS requests/users  
**Scope:** Global (all users)  
**Implementation:** New `DashboardDataCache` service

### Proposed Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User requests dashboard                                         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Check Redis for cached dashboard result                     │
│    Key: dashboard:{id}:{filters_hash}                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
      CACHE HIT         CACHE MISS
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌──────────────────────────────────────────┐
│ Return cached   │  │ 2. Execute dashboard render              │
│ data (sub-100ms)│  │    - Load chart definitions              │
│                 │  │    - Apply universal filters             │
└─────────────────┘  │    - Use DashboardQueryCache (Layer 1)   │
                     │    - Parallel chart execution            │
                     └─────────┬────────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────────────────────────────┐
                     │ 3. Cache result in Redis                 │
                     │    - TTL: 5 minutes (configurable)       │
                     │    - Include filters in cache key        │
                     │    - Store full DashboardRenderResponse  │
                     └─────────┬────────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────────────────────────────┐
                     │ 4. Return result to user                 │
                     └──────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Dashboard Cache Service (4 hours)

#### File: `lib/cache/dashboard-data-cache.ts` (NEW)

```typescript
/**
 * Dashboard Data Cache Service
 * 
 * Redis-backed caching for complete dashboard render results.
 * Caches the entire DashboardRenderResponse for faster subsequent loads.
 * 
 * Features:
 * - Filter-aware caching (different filters = different cache)
 * - Configurable TTL (default: 5 minutes)
 * - Pattern-based invalidation
 * - Graceful fallback on Redis errors
 * 
 * Cache Key Format:
 *   dashboard:data:{dashboardId}:{filtersHash}
 * 
 * Example:
 *   dashboard:data:123e4567-e89b-12d3-a456-426614174000:a3f2b1c4
 */

import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';
import { createHash } from 'crypto';
import type { DashboardRenderResponse } from '@/lib/services/dashboard-renderer';

/**
 * Cached dashboard data structure
 */
export interface CachedDashboardData {
  dashboardId: string;
  data: DashboardRenderResponse;
  cachedAt: string;
  filters: Record<string, unknown>;
  expiresAt: string;
}

/**
 * Dashboard Data Cache Service
 */
export class DashboardDataCache {
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly KEY_PREFIX = 'dashboard:data:';

  /**
   * Generate deterministic hash for filters
   * Same filters = same hash = cache hit
   */
  private generateFiltersHash(filters: Record<string, unknown>): string {
    // Sort keys for deterministic hashing
    const sortedFilters: Record<string, unknown> = {};
    Object.keys(filters || {})
      .sort()
      .forEach((key) => {
        const value = filters[key];
        if (value !== undefined && value !== null) {
          sortedFilters[key] = value;
        }
      });

    const filtersString = JSON.stringify(sortedFilters);
    return createHash('sha256').update(filtersString).digest('hex').substring(0, 16);
  }

  /**
   * Build cache key from dashboard ID and filters
   */
  private buildCacheKey(dashboardId: string, filters: Record<string, unknown>): string {
    const filtersHash = this.generateFiltersHash(filters);
    return `${this.KEY_PREFIX}${dashboardId}:${filtersHash}`;
  }

  /**
   * Get cached dashboard data
   * 
   * @param dashboardId - Dashboard ID
   * @param filters - Universal filters applied
   * @returns Cached data or null if not found/error
   */
  async get(
    dashboardId: string,
    filters: Record<string, unknown> = {}
  ): Promise<DashboardRenderResponse | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping dashboard cache get', { dashboardId });
        return null;
      }

      const key = this.buildCacheKey(dashboardId, filters);
      const cached = await redis.get(key);

      if (!cached) {
        log.info('Dashboard cache miss', {
          dashboardId,
          filtersHash: this.generateFiltersHash(filters),
          cacheKey: key,
        });
        return null;
      }

      const cachedData = JSON.parse(cached) as CachedDashboardData;

      log.info('Dashboard cache hit', {
        dashboardId,
        cachedAt: cachedData.cachedAt,
        chartsCount: cachedData.data.metadata.chartsRendered,
        filters: cachedData.filters,
        cacheKey: key,
      });

      return cachedData.data;
    } catch (error) {
      log.error('Dashboard cache get failed', error, { dashboardId });
      // Graceful degradation - return null on error
      return null;
    }
  }

  /**
   * Set dashboard data in cache
   * 
   * @param dashboardId - Dashboard ID
   * @param filters - Universal filters applied
   * @param data - Dashboard render result
   * @param ttl - Time to live in seconds
   */
  async set(
    dashboardId: string,
    filters: Record<string, unknown> = {},
    data: DashboardRenderResponse,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping dashboard cache set', { dashboardId });
        return;
      }

      const key = this.buildCacheKey(dashboardId, filters);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const cachedData: CachedDashboardData = {
        dashboardId,
        data,
        cachedAt: now.toISOString(),
        filters,
        expiresAt: expiresAt.toISOString(),
      };

      await redis.setex(key, ttl, JSON.stringify(cachedData));

      log.info('Dashboard data cached', {
        dashboardId,
        chartsCount: data.metadata.chartsRendered,
        ttl,
        expiresAt: expiresAt.toISOString(),
        filters,
        cacheKey: key,
      });
    } catch (error) {
      log.error('Dashboard cache set failed', error, { dashboardId });
      // Graceful degradation - don't throw on cache errors
    }
  }

  /**
   * Invalidate all cached versions of a dashboard
   * (all filter combinations)
   * 
   * @param dashboardId - Dashboard ID to invalidate
   */
  async invalidate(dashboardId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping dashboard cache invalidation', {
          dashboardId,
        });
        return;
      }

      const pattern = `${this.KEY_PREFIX}${dashboardId}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        log.debug('No cached dashboard data to invalidate', { dashboardId, pattern });
        return;
      }

      await redis.del(...keys);

      log.info('Dashboard cache invalidated', {
        dashboardId,
        keysDeleted: keys.length,
        pattern,
      });
    } catch (error) {
      log.error('Dashboard cache invalidation failed', error, { dashboardId });
      // Don't throw - invalidation failures shouldn't break the app
    }
  }

  /**
   * Invalidate cached dashboard data by chart definition ID
   * Used when a chart is updated - invalidate all dashboards using that chart
   * 
   * @param chartDefinitionId - Chart definition ID that was updated
   */
  async invalidateByChartId(chartDefinitionId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping chart-based invalidation', {
          chartDefinitionId,
        });
        return;
      }

      // Get all dashboard cache keys
      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        log.debug('No cached dashboards found', { chartDefinitionId });
        return;
      }

      // Check each cached dashboard to see if it uses this chart
      // This is expensive but necessary for correctness
      let invalidatedCount = 0;
      for (const key of keys) {
        const cached = await redis.get(key);
        if (!cached) continue;

        const cachedData = JSON.parse(cached) as CachedDashboardData;
        const chartIds = Object.keys(cachedData.data.charts);

        if (chartIds.includes(chartDefinitionId)) {
          await redis.del(key);
          invalidatedCount++;
        }
      }

      log.info('Dashboards invalidated by chart update', {
        chartDefinitionId,
        dashboardsInvalidated: invalidatedCount,
        totalDashboardsCached: keys.length,
      });
    } catch (error) {
      log.error('Chart-based dashboard cache invalidation failed', error, {
        chartDefinitionId,
      });
      // Don't throw - invalidation failures shouldn't break the app
    }
  }

  /**
   * Clear all dashboard cache entries
   * Use sparingly - typically only for testing or emergency cache flush
   */
  async clearAll(): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available, skipping dashboard cache clear');
        return;
      }

      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      if (keys.length === 0) {
        log.debug('No dashboard cache entries to clear');
        return;
      }

      await redis.del(...keys);

      log.info('All dashboard cache cleared', {
        keysDeleted: keys.length,
      });
    } catch (error) {
      log.error('Dashboard cache clear all failed', error);
      // Don't throw
    }
  }

  /**
   * Get cache statistics
   * Useful for monitoring and debugging
   */
  async getStats(): Promise<{
    totalCachedDashboards: number;
    cacheKeys: string[];
    estimatedMemoryUsage: number;
  }> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return {
          totalCachedDashboards: 0,
          cacheKeys: [],
          estimatedMemoryUsage: 0,
        };
      }

      const pattern = `${this.KEY_PREFIX}*`;
      const keys = await redis.keys(pattern);

      // Estimate memory usage (rough calculation)
      let totalSize = 0;
      for (const key of keys) {
        const value = await redis.get(key);
        if (value) {
          totalSize += Buffer.byteLength(value, 'utf8');
        }
      }

      return {
        totalCachedDashboards: keys.length,
        cacheKeys: keys,
        estimatedMemoryUsage: totalSize,
      };
    } catch (error) {
      log.error('Failed to get dashboard cache stats', error);
      return {
        totalCachedDashboards: 0,
        cacheKeys: [],
        estimatedMemoryUsage: 0,
      };
    }
  }
}

// Export singleton instance
export const dashboardDataCache = new DashboardDataCache();
```

---

### Phase 2: Integrate into Dashboard Renderer (2 hours)

#### Modify: `lib/services/dashboard-renderer.ts`

**Changes:**
1. Import `dashboardDataCache`
2. Check cache before rendering
3. Set cache after rendering
4. Respect `nocache` parameter

```typescript
// Add import
import { dashboardDataCache } from '@/lib/cache/dashboard-data-cache';

export class DashboardRenderer {
  async renderDashboard(
    dashboardId: string,
    universalFilters: DashboardUniversalFilters,
    userContext: UserContext,
    nocache: boolean = false // NEW parameter
  ): Promise<DashboardRenderResponse> {
    const startTime = Date.now();
    
    // NEW: Check Redis cache first (unless nocache=true)
    if (!nocache) {
      const cached = await dashboardDataCache.get(dashboardId, universalFilters);
      if (cached) {
        const duration = Date.now() - startTime;
        
        log.info('Dashboard served from Redis cache', {
          dashboardId,
          userId: userContext.user_id,
          duration,
          cached: true,
          chartsRendered: cached.metadata.chartsRendered,
        });
        
        return cached;
      }
    }
    
    // Cache miss or nocache - proceed with normal rendering
    const queryCache = new DashboardQueryCache();

    try {
      // ... existing rendering logic ...
      
      const result = {
        charts,
        metadata: {
          totalQueryTime,
          cacheHits,
          cacheMisses,
          queriesExecuted: cacheMisses,
          chartsRendered: Object.keys(charts).length,
          dashboardFiltersApplied: this.getAppliedFilterNames(universalFilters),
          parallelExecution: true,
          deduplication: {
            enabled: true,
            queriesDeduped: dedupStats.hits,
            uniqueQueries: dedupStats.uniqueQueries,
            deduplicationRate: dedupStats.deduplicationRate,
          },
        },
      };
      
      // NEW: Cache result in Redis (unless nocache=true)
      if (!nocache) {
        await dashboardDataCache.set(
          dashboardId,
          universalFilters,
          result,
          300 // 5 minutes TTL
        );
      }
      
      return result;
    } finally {
      queryCache.clear();
    }
  }
}
```

---

### Phase 3: Update API Endpoint (1 hour)

#### Modify: `app/api/admin/analytics/dashboard/[dashboardId]/render/route.ts`

```typescript
// Pass nocache parameter to renderer
const result = await dashboardRenderer.renderDashboard(
  dashboardId,
  filters,
  userContext,
  nocache // Pass through from request
);
```

---

### Phase 4: Cache Invalidation Hooks (3 hours)

#### 4.1 Invalidate on Dashboard Update

**File:** `app/api/admin/analytics/dashboards/[dashboardId]/route.ts`

```typescript
import { dashboardDataCache } from '@/lib/cache/dashboard-data-cache';

// In PATCH handler (after successful update)
await dashboardDataCache.invalidate(dashboardId);

log.info('Dashboard cache invalidated after update', { dashboardId });
```

#### 4.2 Invalidate on Chart Definition Update

**File:** `app/api/admin/analytics/charts/[chartId]/route.ts`

```typescript
import { dashboardDataCache } from '@/lib/cache/dashboard-data-cache';

// In PATCH handler (after successful chart update)
await dashboardDataCache.invalidateByChartId(chartDefinitionId);

log.info('Dashboards invalidated after chart update', { chartDefinitionId });
```

#### 4.3 Invalidate on Dashboard-Chart Association Change

**File:** `app/api/admin/analytics/dashboards/[dashboardId]/charts/route.ts`

```typescript
// When adding/removing charts from dashboard
await dashboardDataCache.invalidate(dashboardId);
```

---

### Phase 5: Testing (2 hours)

#### Integration Tests

**File:** `tests/integration/cache/dashboard-data-cache.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dashboardDataCache } from '@/lib/cache/dashboard-data-cache';
import type { DashboardRenderResponse } from '@/lib/services/dashboard-renderer';

describe('DashboardDataCache', () => {
  const mockDashboardId = 'test-dashboard-123';
  const mockFilters = { startDate: '2024-01-01', endDate: '2024-12-31' };
  const mockData: DashboardRenderResponse = {
    charts: {},
    metadata: {
      totalQueryTime: 1000,
      cacheHits: 0,
      cacheMisses: 5,
      queriesExecuted: 5,
      chartsRendered: 5,
      dashboardFiltersApplied: ['dateRange'],
      parallelExecution: true,
      deduplication: {
        enabled: true,
        queriesDeduped: 0,
        uniqueQueries: 5,
        deduplicationRate: 0,
      },
    },
  };

  afterEach(async () => {
    // Clean up after each test
    await dashboardDataCache.invalidate(mockDashboardId);
  });

  describe('Basic Operations', () => {
    it('should cache and retrieve dashboard data', async () => {
      // Set cache
      await dashboardDataCache.set(mockDashboardId, mockFilters, mockData);

      // Get from cache
      const cached = await dashboardDataCache.get(mockDashboardId, mockFilters);

      expect(cached).toBeDefined();
      expect(cached?.metadata.chartsRendered).toBe(5);
    });

    it('should return null for cache miss', async () => {
      const cached = await dashboardDataCache.get('non-existent-dashboard', {});

      expect(cached).toBeNull();
    });

    it('should handle different filters as different cache entries', async () => {
      const filters1 = { startDate: '2024-01-01' };
      const filters2 = { startDate: '2024-06-01' };

      // Cache with filters1
      await dashboardDataCache.set(mockDashboardId, filters1, mockData);

      // Should miss with filters2
      const cached = await dashboardDataCache.get(mockDashboardId, filters2);

      expect(cached).toBeNull();
    });
  });

  describe('Invalidation', () => {
    it('should invalidate all cached versions of a dashboard', async () => {
      const filters1 = { startDate: '2024-01-01' };
      const filters2 = { startDate: '2024-06-01' };

      // Cache with two different filter sets
      await dashboardDataCache.set(mockDashboardId, filters1, mockData);
      await dashboardDataCache.set(mockDashboardId, filters2, mockData);

      // Invalidate all
      await dashboardDataCache.invalidate(mockDashboardId);

      // Both should be gone
      const cached1 = await dashboardDataCache.get(mockDashboardId, filters1);
      const cached2 = await dashboardDataCache.get(mockDashboardId, filters2);

      expect(cached1).toBeNull();
      expect(cached2).toBeNull();
    });
  });

  describe('TTL', () => {
    it('should expire cache after TTL', async () => {
      // Cache with 1 second TTL
      await dashboardDataCache.set(mockDashboardId, mockFilters, mockData, 1);

      // Should exist immediately
      const cached1 = await dashboardDataCache.get(mockDashboardId, mockFilters);
      expect(cached1).toBeDefined();

      // Wait 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should be expired
      const cached2 = await dashboardDataCache.get(mockDashboardId, mockFilters);
      expect(cached2).toBeNull();
    }, 10000);
  });
});
```

---

## Cache Key Strategy

### Key Format
```
dashboard:data:{dashboardId}:{filtersHash}
```

### Examples

**Same dashboard, no filters:**
```
dashboard:data:abc123:d41d8cd98f00
```

**Same dashboard, date filter:**
```
dashboard:data:abc123:a1b2c3d4e5f6
```

**Same dashboard, different date filter:**
```
dashboard:data:abc123:9876543210ab
```

**Different dashboard:**
```
dashboard:data:xyz789:d41d8cd98f00
```

### Why Include Filters in Hash?
- Different filters = different data = different cache
- Users with different date ranges see correct cached data
- Organization filters create separate caches per org

---

## TTL Strategy

### Recommended TTLs

| Use Case | TTL | Rationale |
|----------|-----|-----------|
| **Default** | 5 minutes | Balances freshness with performance |
| **Real-time Dashboards** | 1 minute | Frequent updates needed |
| **Executive Dashboards** | 15 minutes | Data changes infrequently |
| **Historical Reports** | 1 hour | Past data doesn't change |

### Configurable TTL

```typescript
// In dashboard definition (layout_config)
{
  "cacheConfig": {
    "enabled": true,
    "ttl": 300  // Override default TTL per dashboard
  }
}
```

---

## Invalidation Strategy

### Automatic Invalidation Triggers

1. **Dashboard Updated**
   - Dashboard name/description changed
   - Dashboard layout changed
   - Charts added/removed from dashboard
   - **Action:** Invalidate all cached versions of that dashboard

2. **Chart Definition Updated**
   - Chart config changed
   - Chart filters changed
   - Chart data source changed
   - **Action:** Invalidate all dashboards using that chart

3. **Data Source Column Updated**
   - Column formatting changed
   - Column metadata changed
   - **Action:** Invalidate all dashboards using charts from that data source

### Manual Invalidation

**Refresh Button with Cache Bypass:**
```typescript
// User clicks "Refresh" → passes nocache=true
const result = await dashboardRenderer.renderDashboard(
  dashboardId,
  filters,
  userContext,
  true // nocache = bypass cache
);
```

**Admin Cache Flush:**
```typescript
// Emergency cache flush (admin only)
await dashboardDataCache.clearAll();
```

---

## Performance Impact Estimates

### Before Redis Caching

```
Dashboard Load (First Request):
├─ Database Queries: 15 queries
├─ Query Time: 1,800ms
├─ Transformation: 300ms
└─ Total: ~2,500ms

Dashboard Load (Subsequent Requests):
└─ Same as first request (NO caching)
    Total: ~2,500ms each time
```

### After Redis Caching

```
Dashboard Load (Cache Miss):
├─ Redis Check: 5ms
├─ Database Queries: 15 queries
├─ Query Time: 1,800ms
├─ Transformation: 300ms
├─ Redis Write: 10ms
└─ Total: ~2,500ms (same as before)

Dashboard Load (Cache Hit):
├─ Redis Get: 50-100ms
└─ Total: ~100ms (95% faster!)
```

### Expected Results

**Assumptions:**
- Popular dashboard loaded 100 times/day
- Cache hit rate: 80% (after warmup)

**Before:**
- 100 loads × 2.5s = 250s total query time
- 1,500 database queries/day

**After:**
- 20 cache misses × 2.5s = 50s query time
- 80 cache hits × 0.1s = 8s Redis time
- **Total: 58s (77% reduction)**
- **300 database queries/day (80% reduction)**

---

## Risk Mitigation

### Risk 1: Stale Data
**Mitigation:**
- Conservative 5-minute TTL
- Automatic invalidation on updates
- Manual refresh button with cache bypass
- Clear cache warnings in UI

### Risk 2: Redis Failures
**Mitigation:**
- Graceful fallback to database
- All cache operations wrapped in try-catch
- Log errors but don't throw
- App continues to function without cache

### Risk 3: Memory Usage
**Mitigation:**
- Monitor cache size with `getStats()`
- Set Redis maxmemory-policy to `allkeys-lru`
- Dashboard data is relatively small (~100KB per dashboard)
- Estimate: 1,000 cached dashboards = ~100MB

### Risk 4: Cache Invalidation Bugs
**Mitigation:**
- Comprehensive test coverage
- Monitoring for cache hit rates
- Admin tools to flush cache
- Pattern-based invalidation reduces complexity

---

## Monitoring & Observability

### Metrics to Track

```typescript
// In dashboard render endpoint logs
log.info('Dashboard render metrics', {
  cached: boolean,
  cacheHitDuration: number, // If cache hit
  cacheMissDuration: number, // If cache miss
  ttl: number,
  filtersHash: string,
});
```

### Dashboard

Create monitoring dashboard with:
- Cache hit rate (target: >70%)
- Average cache hit latency (<100ms)
- Average cache miss latency (~2500ms)
- Cache size (number of entries)
- Invalidations per hour
- Cache errors

### Alerts

- Cache hit rate <50% (investigate)
- Cache latency >500ms (Redis issue?)
- Cache error rate >5% (Redis down?)

---

## Implementation Checklist

### Phase 1: Core Service (4h)
- [ ] Create `lib/cache/dashboard-data-cache.ts`
- [ ] Implement `get()`, `set()`, `invalidate()` methods
- [ ] Add filters hash generation
- [ ] Add TTL support
- [ ] Add graceful error handling

### Phase 2: Integration (2h)
- [ ] Update `DashboardRenderer.renderDashboard()`
- [ ] Add cache check before render
- [ ] Add cache set after render
- [ ] Pass `nocache` parameter through

### Phase 3: API Updates (1h)
- [ ] Update dashboard render endpoint
- [ ] Pass `nocache` from request

### Phase 4: Invalidation (3h)
- [ ] Add invalidation to dashboard PATCH
- [ ] Add invalidation to chart PATCH
- [ ] Add invalidation to dashboard-chart associations
- [ ] Add invalidation to data source columns

### Phase 5: Testing (2h)
- [ ] Unit tests for `DashboardDataCache`
- [ ] Integration tests for cache flow
- [ ] Test invalidation triggers
- [ ] Test TTL expiration

### Phase 6: Documentation (1h)
- [ ] Update API documentation
- [ ] Document cache behavior
- [ ] Add troubleshooting guide
- [ ] Update architecture docs

**Total Estimated Time: 13 hours**

---

## Rollout Plan

### Week 1: Development & Testing
- Implement core service
- Add integration points
- Write comprehensive tests
- Code review

### Week 2: Staging Deployment
- Deploy to staging
- Enable for internal users only
- Monitor metrics closely
- Fix any issues

### Week 3: Production Rollout
- Enable for 25% of users (feature flag)
- Monitor performance and errors
- Increase to 50%, then 75%
- Full rollout after validation

### Week 4: Optimization
- Tune TTL values based on real data
- Optimize invalidation patterns
- Add monitoring dashboards
- Performance analysis

---

## Success Criteria

### Performance
- ✅ Cache hit rate >70%
- ✅ Cache hit latency <100ms
- ✅ 70%+ reduction in dashboard query time (cached)
- ✅ 60%+ reduction in database load

### Reliability
- ✅ Zero cache-related errors causing app failures
- ✅ Graceful degradation on Redis failures
- ✅ No stale data shown to users

### User Experience
- ✅ Dashboard loads feel instant when cached
- ✅ Refresh button works as expected
- ✅ Filters applied correctly

---

## Conclusion

Implementing Redis caching for dashboard data will provide **significant performance improvements** with **minimal risk**. The two-layer caching strategy (in-memory deduplication + Redis persistence) ensures both single-request optimization and cross-request/cross-user caching.

**Key Benefits:**
- 🚀 70-80% faster dashboard loads (cached)
- 💾 80% reduction in database queries
- ⚡ Sub-100ms response times
- 📊 Better scalability for popular dashboards

**Next Steps:**
1. Review and approve this proposal
2. Begin Phase 1 implementation
3. Set up monitoring infrastructure
4. Plan staged rollout

**Estimated ROI:**
- Development time: 13 hours
- Performance gain: 70-80% faster
- Database load reduction: 60-80%
- User satisfaction: Significantly improved

This is a **high-value, low-risk** improvement that will dramatically improve the dashboard experience.

