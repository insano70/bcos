# Phase 6: Unified Caching Strategy - Implementation Plan

**Date:** 2025-10-12  
**Status:** Ready for Implementation  
**Prerequisites:** ✅ Phase 3, 4, 5 Complete  
**Priority:** MEDIUM (Performance Enhancement)

---

## Phase 4 & 5 Completion Summary

### ✅ Phase 3: Server-Side Transformation (100% Complete)
- ✅ Number charts - MetricChartHandler
- ✅ Table charts - TableChartHandler
- ✅ Dual-axis charts - ComboChartHandler
- ✅ Progress bar charts - ProgressBarChartHandler

### ✅ Phase 4: Component Simplification (100% Complete)
- ✅ useChartData hook created (211 lines)
- ✅ ChartRenderer component created (287 lines)
- ✅ ChartHeader component created (181 lines)
- ✅ ChartError component created (135 lines)
- ✅ AnalyticsChart refactored (628 lines, down from 843 lines - 25% reduction)
- ✅ Component presets extracted (72 lines)

### ✅ Phase 5: Chart Type Migration (100% Complete)
- ✅ All 7 remaining chart types migrated to universal endpoint
- ✅ line, area - TimeSeriesChartHandler
- ✅ bar, stacked-bar, horizontal-bar - BarChartHandler  
- ✅ pie, doughnut - DistributionChartHandler
- ✅ Chart type registry enhanced (multi-type handler support)
- ✅ All 11 chart types using universal endpoint

**Result:** 100% of chart types (11/11) now use `/api/admin/analytics/chart-data/universal`

---

## Current State Analysis

### What's Working ✅

**Architecture:**
- ✅ Single API gateway (`/api/admin/analytics/chart-data/universal`)
- ✅ 100% server-side transformation (all handlers)
- ✅ Pluggable chart type system (7 handlers registered)
- ✅ Type-safe configurations (Zod validation)
- ✅ No hard-coding (0 instances found)
- ✅ Standards compliant (CLAUDE.md, STANDARDS.md, universal_analytics.md)

**Performance:**
- ✅ Parallel fetching (dual-axis charts ~50% faster)
- ✅ Code splitting (lazy-loaded modals)
- ✅ Memoization (proper dependency management)
- ✅ Duplicate fetch prevention (React 19 compatibility)

**Code Quality:**
- ✅ Zero `any` types in handlers (1 documented exception in ChartRenderer)
- ✅ Zero `console.*` direct usage (migrated to `log`)
- ✅ Zero security vulnerabilities
- ✅ Comprehensive error handling

### What's Missing (Phase 6)

**Caching:**
- ❌ No server-side caching for chart data
- ❌ Client-side React state cache only (lost on unmount)
- ❌ No unified caching strategy
- ❌ Each endpoint has different caching approach

**Performance Opportunities:**
- ❌ Dashboard loads charts sequentially
- ❌ No query batching
- ❌ No cache warming
- ❌ No stale-while-revalidate pattern

---

## Phase 6: Unified Caching Strategy

### Goals

1. **Redis-Backed Caching** - 5-minute TTL for all chart data
2. **Cache Invalidation** - On chart/data source updates
3. **Cache Keys** - Deterministic generation from chart config
4. **Stale-While-Revalidate** - Return cached + fetch fresh
5. **Manual Refresh** - Bypass cache on demand

---

## Implementation Todos

### Phase 6.1: Create Cache Layer ⏱️ 2 hours

#### 6.1.1: Create ChartDataCache Service
**File:** `lib/cache/chart-data-cache.ts` (NEW)

**Requirements:**
- Class-based cache service
- `get(key)` - Retrieve cached chart data
- `set(key, data, ttl)` - Store chart data with expiration
- `invalidate(pattern)` - Remove cache by pattern (e.g., "chart:bar:*")
- `invalidateByDataSource(dataSourceId)` - Remove all charts for data source
- Use existing Redis client from `lib/redis.ts`
- Proper error handling (cache failures shouldn't break charts)
- Comprehensive logging

**Deliverables:**
- ChartDataCache class
- Unit tests for cache operations
- Error handling for Redis failures

---

#### 6.1.2: Create Cache Key Generator
**File:** `lib/utils/cache-key-generator.ts` (NEW)

**Requirements:**
- `generateCacheKey(config)` - Deterministic key from chart config
- Hash chart config (chartType, dataSourceId, filters, groupBy, etc.)
- Exclude UI-only properties (width, height, responsive, etc.)
- Handle complex objects (dualAxisConfig, multipleSeries, periodComparison)
- Use stable JSON.stringify ordering
- Prefix with chart type for pattern invalidation

**Key Format:**
```
chart:{chartType}:{dataSourceId}:{configHash}
Example: chart:dual-axis:3:a1b2c3d4e5f6
```

**Deliverables:**
- generateCacheKey function
- Unit tests with various config combinations
- Hash collision prevention

---

### Phase 6.2: Integrate Caching into Universal Endpoint ⏱️ 1.5 hours

#### 6.2.1: Update Universal Endpoint Route
**File:** `app/api/admin/analytics/chart-data/universal/route.ts`

**Changes:**
```typescript
// 1. Check cache before fetching
const cacheKey = generateCacheKey(mergedConfig);
const cached = await chartDataCache.get(cacheKey);

if (cached && !request.nocache) {
  return createSuccessResponse({
    ...cached,
    metadata: { ...cached.metadata, cacheHit: true }
  });
}

// 2. Fetch and transform (existing logic)
const result = await chartDataOrchestrator.orchestrate(...);

// 3. Set cache after transformation
await chartDataCache.set(cacheKey, result, 300); // 5 minutes

// 4. Return with cache metadata
return createSuccessResponse({
  ...result,
  metadata: { ...result.metadata, cacheHit: false }
});
```

**Requirements:**
- Check cache before orchestration
- Support `?nocache=true` query param (manual refresh)
- Set cache after successful orchestration
- Add `cacheHit` flag to response metadata
- Handle cache errors gracefully (continue without cache)
- Log cache hits/misses

**Deliverables:**
- Cache integration in universal endpoint
- Cache bypass mechanism
- Proper error handling

---

#### 6.2.2: Update Table Endpoint Route (Optional)
**File:** `app/api/admin/data-sources/[id]/query/route.ts`

**Decision:** Skip for now
- Table charts use different endpoint
- Can be added in future iteration
- Focus on universal endpoint first (covers 10/11 chart types)

---

### Phase 6.3: Add Cache Invalidation ⏱️ 1 hour

#### 6.3.1: Chart Definition Updates
**File:** `app/api/admin/analytics/charts/[chartId]/route.ts`

**Changes:**
```typescript
// On PATCH (update chart)
const updated = await service.updateChart(chartId, data);

// Invalidate cache for this chart's data source
await chartDataCache.invalidateByDataSource(updated.data_source_id);

return createSuccessResponse(updated);
```

**Also Update:**
- DELETE endpoint - invalidate on chart deletion
- POST endpoint - no invalidation needed (new chart, no cache)

---

#### 6.3.2: Data Source Column Updates
**File:** `app/api/admin/data-sources/[id]/columns/[columnId]/route.ts`

**Changes:**
```typescript
// On PATCH (update column metadata)
const updated = await service.updateColumn(columnId, data);

// Invalidate all charts using this data source
await chartDataCache.invalidateByDataSource(dataSourceId);

return createSuccessResponse(updated);
```

---

### Phase 6.4: Add Manual Refresh Support ⏱️ 30 minutes

#### 6.4.1: Update ChartHeader Component
**File:** `components/charts/chart-header.tsx`

**Changes:**
- Pass `bypassCache` parameter to refresh callback
- Add visual indicator for cache status (optional)

**Current:**
```typescript
onRefresh={() => refetch()}
```

**Enhanced:**
```typescript
onRefresh={() => refetch(true)} // true = bypass cache
```

---

#### 6.4.2: Update useChartData Hook
**File:** `hooks/use-chart-data.ts`

**Changes:**
```typescript
const refetch = useCallback(async (bypassCache = false) => {
  if (bypassCache) {
    // Add nocache flag to request
    const cachedRequest = { ...request, nocache: true };
    await apiClient.post('/api/admin/analytics/chart-data/universal', cachedRequest);
  } else {
    await fetchData();
  }
}, [fetchData, request]);
```

---

### Phase 6.5: Testing & Validation ⏱️ 2 hours

#### 6.5.1: Unit Tests

**Files to create:**
- `tests/unit/cache/chart-data-cache.test.ts`
- `tests/unit/utils/cache-key-generator.test.ts`

**Test coverage:**
- Cache get/set/invalidate operations
- Cache key generation (deterministic, collision-free)
- Redis connection failures (graceful degradation)
- TTL expiration
- Pattern-based invalidation

---

#### 6.5.2: Integration Tests

**Files to create:**
- `tests/integration/cache/chart-caching-flow.test.ts`

**Test scenarios:**
- First request (cache miss) → Second request (cache hit)
- Cache invalidation on chart update
- Manual refresh bypasses cache
- Different chart types use different cache keys
- Cache failures don't break charts

---

#### 6.5.3: Performance Benchmarks

**Metrics to measure:**
- P50, P95, P99 latency (cached vs uncached)
- Cache hit rate over time
- Memory usage in Redis
- Time to first byte improvement

**Target:**
- Cached response: <100ms (from ~500-1000ms)
- Cache hit rate: >80% after warmup
- Zero chart failures from cache errors

---

## Phase 6 Task List

### 🔴 HIGH Priority

1. ✅ **Phase 6.1.1:** Create ChartDataCache service class
   - Redis get/set/del operations
   - Error handling
   - Logging

2. ✅ **Phase 6.1.2:** Create cache key generator
   - Deterministic hashing
   - Config serialization
   - Unit tests

3. ✅ **Phase 6.2.1:** Integrate caching into universal endpoint
   - Check cache before orchestration
   - Set cache after success
   - Cache bypass support

### 🟡 MEDIUM Priority

4. ⚠️ **Phase 6.3.1:** Chart definition cache invalidation
   - PATCH endpoint
   - DELETE endpoint

5. ⚠️ **Phase 6.3.2:** Data source column cache invalidation
   - Column updates invalidate related charts

6. ⚠️ **Phase 6.4.1:** Manual refresh cache bypass
   - Update ChartHeader
   - Update useChartData hook

### 🟢 LOW Priority

7. 📊 **Phase 6.5.1:** Unit tests
   - Cache operations
   - Key generation

8. 📊 **Phase 6.5.2:** Integration tests
   - End-to-end caching flow
   - Invalidation scenarios

9. 📊 **Phase 6.5.3:** Performance benchmarks
   - Before/after metrics
   - Production load testing

---

## Success Metrics

**Before Phase 6:**
- ❌ No server-side caching
- ❌ Every request hits database
- ❌ Dashboard with 10 charts = 10+ DB queries
- ❌ Average response time: 500-1000ms

**After Phase 6:**
- ✅ Redis-backed caching
- ✅ 80%+ cache hit rate (after warmup)
- ✅ Dashboard with 10 charts = 2-3 DB queries (cache hits)
- ✅ Cached response: <100ms
- ✅ 30-50% faster dashboard loads

---

## Risk Assessment

### Risk 1: Cache Invalidation Bugs 🟡 MEDIUM

**Scenario:** Stale data shown after updates

**Mitigation:**
- Conservative 5-minute TTL
- Comprehensive invalidation on updates
- Manual refresh always bypasses cache
- Cache versioning (future: increment on schema change)

**Rollback:** Disable caching via feature flag

---

### Risk 2: Redis Failures 🟡 MEDIUM

**Scenario:** Redis unavailable breaks charts

**Mitigation:**
- **Graceful degradation** - Cache failures don't throw
- Fall through to direct DB query on cache errors
- Comprehensive error logging
- Health checks for Redis connection

**Rollback:** Works without Redis (degrades to current state)

---

### Risk 3: Cache Stampede 🟢 LOW

**Scenario:** Many requests for expired key hit DB simultaneously

**Mitigation:**
- Request coalescing (future enhancement)
- Stale-while-revalidate (Phase 6.5+)
- Reasonable TTL (5 minutes prevents frequent expiration)

---

## Timeline Estimate

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 6.1.1 | ChartDataCache service | 1.5 hours |
| 6.1.2 | Cache key generator | 30 minutes |
| 6.2.1 | Universal endpoint integration | 1 hour |
| 6.3.1 | Chart invalidation | 30 minutes |
| 6.3.2 | Column invalidation | 30 minutes |
| 6.4.1 | Manual refresh | 30 minutes |
| 6.5 | Testing & benchmarks | 2 hours |
| **Total** | **Phase 6 Complete** | **~6.5 hours** |

---

## Dependencies

**Required:**
- ✅ Redis client (`lib/redis.ts`) - Already exists
- ✅ Universal endpoint operational - Already working
- ✅ Chart type handlers complete - All 7 handlers done
- ✅ Orchestrator functional - Working correctly

**No blockers - ready to implement immediately**

---

## Future Enhancements (Phase 7+)

### Phase 7: Dashboard Batch Rendering
- Batch API for multiple charts
- Single round-trip for entire dashboard
- Parallel query execution
- Shared connection pooling

### Phase 8: Advanced Caching
- Stale-while-revalidate pattern
- Request coalescing
- Cache warming on deploy
- Predictive prefetching

---

## Acceptance Criteria

**Must Have:**
- [ ] Cache hit/miss rate tracked in logs
- [ ] Cached responses <100ms P95
- [ ] Cache failures don't break charts
- [ ] Manual refresh bypasses cache
- [ ] Cache invalidates on updates
- [ ] No memory leaks in Redis

**Nice to Have:**
- [ ] Cache hit rate dashboard
- [ ] Cache size monitoring
- [ ] TTL tuning based on usage patterns
- [ ] Per-user cache (future)

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-12  
**Status:** Ready for Implementation

