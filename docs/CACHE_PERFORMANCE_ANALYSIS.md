# Cache Performance Analysis & Optimization Plan

## Executive Summary

The dashboard is taking **30+ seconds** to render despite having a **fully warm Redis cache** with 100% cache hit rate. The root cause is an architectural flaw: we're fetching 150K-280K rows from Redis to ultimately use only 200-300 rows.

**Current state**: 30 seconds for 9 charts
**Expected state**: <1 second for 9 charts

---

## Root Cause Analysis

### 1. Critical Finding: Cache Fetch is 99.9% of Total Time

```
timingBreakdown: {
  cacheFetch: 29,895ms  // <-- 99.9% of time spent here
  rbacFilter: 1ms       // <-- 0.003%
  dateFilter: 22ms      // <-- 0.07%
  total: 29,934ms
}
```

The Redis cache IS being hit. The problem is we're fetching **massive amounts of data we don't need**.

### 2. Row Count Analysis (The Real Problem)

| Measure | Rows from Cache | Rows After RBAC | Waste Ratio |
|---------|-----------------|-----------------|-------------|
| Payments (Monthly) | 281,060 | 318 | 99.89% |
| Charges (Monthly) | 185,857 | 208 | 99.89% |
| Visits (Monthly) | 15,567 | 6 | 99.96% |
| Cash Transfer (Weekly) | 1,411 | 0 | 100% |
| New Infusion Patients | 5,055 | 8 | 99.84% |

**We're fetching 500K+ rows from Redis to use ~500 rows.**

### 3. Redundant Fetches (No Request-Level Caching)

The same data is fetched multiple times per dashboard render:
- "Payments Monthly" fetched **5 times** (281K rows × 5 = 1.4M rows)
- "Charges Monthly" fetched **3 times** (186K rows × 3 = 558K rows)

Total rows transferred from Redis for one dashboard: **~2,000,000 rows**
Total rows actually used: **~1,000 rows**

### 4. Sequential vs Parallel Execution

Charts appear to execute somewhat sequentially, with each cache fetch blocking:
- Chart 1: 16:24:38 (8.2s)
- Chart 2: 16:24:43 (12.7s) 
- Chart 3: 16:24:46 (16.0s)
- ...progressing to 30s

---

## Why This Architecture Exists

The current cache design was built for a different access pattern:

**Design Assumption**: One cache entry per (measure + frequency) enables maximum cache reuse
**Reality**: This forces fetching ALL practices' data to serve ONE user's request

The cache key structure:
```
cache:{ds:2}:{m:Payments}:{f:Monthly}
```

Contains 281,060 rows for ALL practices, ALL date ranges.

---

## Optimization Plan

### Phase 1: Request-Level Deduplication (Quick Win - 50% improvement)

**Problem**: Same (measure + frequency) fetched multiple times per request
**Solution**: In-memory request-scoped cache

```typescript
// In batch-executor or query-orchestrator
class RequestScopedCache {
  private cache = new Map<string, CacheEntry[]>();
  
  async getCached(measure: string, frequency: string): Promise<CacheEntry[] | undefined> {
    const key = `${measure}:${frequency}`;
    return this.cache.get(key);
  }
  
  setCached(measure: string, frequency: string, data: CacheEntry[]): void {
    this.cache.set(`${measure}:${frequency}`, data);
  }
}
```

**Impact**: Reduces fetches from 11 to 5 unique (measure+frequency) combinations
**Effort**: 2 hours
**Risk**: Low

### Phase 2: Practice-Level Cache Granularity (Major Fix - 80% improvement)

**Problem**: Cache key doesn't include practice, forcing full dataset retrieval
**Solution**: Add practice_uid to cache keys

Current key:
```
cache:{ds:2}:{m:Payments}:{f:Monthly}
→ Returns 281,060 rows (all practices)
```

Proposed key:
```
cache:{ds:2}:{m:Payments}:{f:Monthly}:{p:123}
→ Returns ~300 rows (one practice)
```

**Implementation**:
1. Update `CacheKeyComponents` to include `practiceUid`
2. Update cache warming to create per-practice entries
3. Update cache lookup to fetch only relevant practice(s)

**Impact**: 281K rows → 300 rows per fetch (99.9% reduction)
**Effort**: 1-2 days
**Risk**: Medium (cache key migration needed)

### Phase 3: RBAC-Aware Cache Indexing (Ultimate Fix - 95% improvement)

**Problem**: User has access to 107 practices but we fetch ALL data then filter
**Solution**: Use Redis secondary indexes for practice-based filtering

```typescript
// Index structure
idx:ds:2:m:Payments:f:Monthly:p:{practice_uid} → SET of cache entry keys

// Query: Get data for user's 3 accessible practices
const practiceKeys = await redis.sunion(
  'idx:ds:2:m:Payments:f:Monthly:p:101',
  'idx:ds:2:m:Payments:f:Monthly:p:102', 
  'idx:ds:2:m:Payments:f:Monthly:p:103'
);
const data = await redis.mget(...practiceKeys);
```

**Impact**: Fetch only rows matching user's practice access
**Effort**: 3-5 days
**Risk**: Medium-High (significant cache restructuring)

### Phase 4: Parallel Chart Execution (Performance Boost)

**Problem**: Charts execute with blocking waits between them
**Solution**: True parallel execution with Promise.all

**Effort**: 4 hours
**Risk**: Low

---

## Recommended Implementation Order

### Week 1: Quick Wins
1. **Request-level cache deduplication** (Phase 1)
2. **True parallel chart execution** (Phase 4)
3. Expected improvement: 50-60% faster

### Week 2: Core Fix
4. **Practice-level cache granularity** (Phase 2)
5. Expected improvement: Additional 80% faster (combined 90%+)

### Week 3: Optimization
6. **RBAC-aware cache indexing** (Phase 3)
7. Expected improvement: Near-instant dashboard loads

---

## Metrics to Track

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| Dashboard render time | 30s | 15s | 2s | 0.5s |
| Rows fetched per request | 2M | 500K | 5K | 1K |
| Cache fetch time (avg) | 20s | 10s | 0.5s | 0.1s |
| RBAC filter time | 1ms | 1ms | 0ms | 0ms |

---

## Files to Modify

### Phase 1 (Request Deduplication)
- `lib/services/dashboard/batch-executor.ts` - Add request-scoped cache
- `lib/cache/data-source-cache.ts` - Support request context

### Phase 2 (Practice-Level Keys)
- `lib/cache/indexed-analytics/key-generator.ts` - Add practice to keys
- `lib/cache/indexed-analytics/warming-service.ts` - Warm per-practice
- `lib/cache/data-source/cache-operations.ts` - Lookup by practice

### Phase 3 (RBAC Indexing)  
- `lib/cache/indexed-analytics/index.ts` - Practice index management
- `lib/cache/indexed-analytics/query-service.ts` - Index-based queries

### Phase 4 (Parallel Execution)
- `lib/services/dashboard/batch-executor.ts` - True parallel execution
- `lib/services/chart-data-orchestrator.ts` - Remove blocking waits

---

## Immediate Action Items

1. ✅ Diagnostic logging added (complete)
2. 🔄 Implement request-level deduplication (next)
3. 🔜 Add practice-level cache granularity
4. 🔜 Enable true parallel chart execution

