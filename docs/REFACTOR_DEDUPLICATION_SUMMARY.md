# Query Builder Refactor vs Redis Cache Implementation - Deduplication Summary

**Date:** 2025-01-15
**Status:** Planning Complete

---

## Overview

We identified **significant overlap** between two planned initiatives:
1. **Analytics Query Builder Refactoring** (query_builder_refactor.md)
2. **Redis Cache Implementation** (REDIS_CACHE_IMPLEMENTATION_PLAN.md)

This document summarizes the overlap, decisions made, and implementation sequence.

---

## Identified Overlaps

### ❌ What Was Duplicated (Before Deduplication)

| Feature | Query Builder Refactor (v1) | Redis Cache Plan | Winner |
|---------|----------------------------|------------------|--------|
| **Query Result Caching** | `query-cache.ts` with individual query caching | `DataSourceCacheService` with data source-level caching | **Redis Cache Plan** ✅ |
| **Column Mapping Cache** | Caching in `query-executor.ts` | Integrated in `DataSourceCacheService` | **Redis Cache Plan** ✅ |
| **Cache Key Strategy** | Security context in key | Data source + RBAC filtering after cache | **Redis Cache Plan** ✅ |
| **Cache Warming** | Not planned | Scheduled warming with 4-hour TTL | **Redis Cache Plan** ✅ |
| **Cache Invalidation** | Pattern-based deletion | Comprehensive invalidation API | **Redis Cache Plan** ✅ |
| **RBAC Filtering** | Applied at query level | Applied in-memory after cache hit | **Redis Cache Plan** ✅ |

### ✅ What Was Kept (No Overlap)

| Feature | Included In | Why |
|---------|-------------|-----|
| **Code Organization** | Query Builder Refactor | Redis Cache doesn't address this |
| **Eliminate Duplication** | Query Builder Refactor | `queryMeasures()` vs `executeBaseQuery()` issue |
| **Security Isolation** | Query Builder Refactor | Separate validation module |
| **SQL Building** | Query Builder Refactor | Pure query construction |
| **Testing Infrastructure** | Query Builder Refactor | Unit tests for all modules |

---

## Decisions Made

### 1. Implementation Sequence

**DECISION:** Redis Cache Plan first, then Query Builder Refactor

**Rationale:**
- Redis Cache Plan is more comprehensive for caching
- Query Builder Refactor can leverage completed cache
- Cleaner separation of concerns
- Avoids duplicate work

**Timeline:**
```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: Redis Cache Implementation (2-3 weeks)         │
│ - DataSourceCacheService                                 │
│ - Cache warming                                          │
│ - RBAC filtering                                         │
│ - Integration with queryMeasures()                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: Query Builder Refactor (2-3 weeks)             │
│ - Extract modules (validator, sanitizer, builder)       │
│ - Eliminate duplication                                  │
│ - Testing infrastructure                                 │
│ - NO caching logic (already done)                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: Integration (1-2 days)                          │
│ - Update query-orchestrator to use DataSourceCache      │
│ - Simple one-line change                                 │
└─────────────────────────────────────────────────────────┘

Total: 4-6 weeks (vs 6-8 weeks if done in parallel)
```

### 2. Document Changes

**Original Documents:**
- `query_builder_refactor.md` (v1) → **Backed up** as `query_builder_refactor_v1_with_cache.md`
- `REDIS_CACHE_IMPLEMENTATION_PLAN.md` → **No changes** (remains authoritative for caching)

**Updated Documents:**
- `query_builder_refactor.md` → **Updated to v2** (caching logic removed)
- `REFACTOR_DEDUPLICATION_SUMMARY.md` → **New** (this document)

### 3. Module Responsibilities

**DataSourceCacheService (Redis Cache Plan):**
- ✅ Query result caching
- ✅ Column mapping caching
- ✅ Cache warming
- ✅ Cache invalidation
- ✅ RBAC filtering (in-memory after cache)
- ✅ nocache parameter support

**QueryOrchestrator (Query Builder Refactor):**
- ✅ Code organization
- ✅ Validation
- ✅ Sanitization
- ✅ SQL building
- ✅ Query execution
- ❌ No caching (delegates to DataSourceCacheService)

---

## Integration Points

### How They Work Together

**Before Refactor (Current State):**
```
API Request
  ↓
analyticsQueryBuilder.queryMeasures()
  ↓
Direct database query (no cache)
  ↓
Response
```

**After Redis Cache Only:**
```
API Request
  ↓
DataSourceCacheService.fetchDataSource()
  ├─ Check cache → HIT? → Apply RBAC → Return
  └─ MISS? ↓
  analyticsQueryBuilder.queryMeasures()
  ├─ Database query
  ├─ Cache result
  ├─ Apply RBAC
  └─ Return
```

**After Redis Cache + Refactor:**
```
API Request
  ↓
DataSourceCacheService.fetchDataSource()
  ├─ Check cache → HIT? → Apply RBAC → Return
  └─ MISS? ↓
  QueryOrchestrator.query()  ← Clean, modular interface!
  ├─ Validate (QueryValidator)
  ├─ Sanitize (QuerySanitizer)
  ├─ Build SQL (QueryBuilder)
  ├─ Execute (QueryExecutor)
  └─ Return to cache
```

### Code Changes (Integration)

**In `query-orchestrator.ts` (after both implementations):**

```typescript
import { dataSourceCache } from '@/lib/cache/data-source-cache';

export class QueryOrchestrator {
  // ... existing code ...

  /**
   * Main query method - with caching!
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    // AFTER Redis Cache Plan implemented:
    return dataSourceCache.fetchDataSource(params, context);

    // DataSourceCacheService.fetchDataSource() will:
    // 1. Check cache first
    // 2. On miss, call this.query() internally
    // 3. Cache result
    // 4. Apply RBAC filtering
    // 5. Return filtered data
  }

  // Internal method used by DataSourceCacheService
  async query(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    // Clean execution flow (no caching logic here)
  }
}
```

---

## Benefits of This Approach

### 1. Avoids Duplicate Work
- ❌ Don't implement caching twice
- ❌ Don't test caching twice
- ❌ Don't maintain two caching strategies

### 2. Better Architecture
- ✅ Single responsibility: Cache service caches, query builder queries
- ✅ DataSourceCacheService can cache ANY data source, not just queries
- ✅ Query builder remains pure and testable

### 3. Faster Overall Timeline
- ✅ 4-6 weeks sequential vs 6-8 weeks parallel
- ✅ No merge conflicts
- ✅ No duplicate testing

### 4. Cleaner Code
- ✅ QueryExecutor has no caching concerns
- ✅ DataSourceCacheService handles all cache concerns
- ✅ Clear separation of concerns

---

## Risk Mitigation

### Risk: Refactor Started Before Cache Complete

**Mitigation:**
- ✅ Query Builder Refactor v2 explicitly states dependency
- ✅ Both plans reference each other
- ✅ This summary document exists
- ✅ Implementation sequence documented

### Risk: Integration Issues

**Mitigation:**
- ✅ Simple one-line change to integrate
- ✅ Both modules tested independently
- ✅ Integration tests planned
- ✅ Backward compatibility maintained

### Risk: Timeline Slip

**Mitigation:**
- ✅ Each phase has clear deliverables
- ✅ Phases can be tested independently
- ✅ Rollback plans exist for each phase

---

## Approval Checklist

- [ ] Tech lead agrees with implementation sequence
- [ ] Architecture approved
- [ ] Redis Cache Plan owner notified
- [ ] Query Builder Refactor owner notified
- [ ] Timeline agreed upon
- [ ] Integration approach approved

---

## Next Steps

1. **Immediate:**
   - [ ] Begin Redis Cache Implementation per REDIS_CACHE_IMPLEMENTATION_PLAN.md
   - [ ] Query Builder Refactor team waits for Redis Cache completion

2. **After Redis Cache Complete:**
   - [ ] Begin Query Builder Refactor per query_builder_refactor.md (v2)
   - [ ] Reference Redis Cache Plan for integration points

3. **After Query Builder Refactor Complete:**
   - [ ] Update DataSourceCacheService to use QueryOrchestrator
   - [ ] Run integration tests
   - [ ] Deploy

---

## References

- [Redis Cache Implementation Plan](./REDIS_CACHE_IMPLEMENTATION_PLAN.md) - Authoritative for caching
- [Query Builder Refactor v2](./query_builder_refactor.md) - Current plan (caching removed)
- [Query Builder Refactor v1](./query_builder_refactor_v1_with_cache.md) - Original plan (with caching)
- [Standardization Progress](./services/STANDARDIZATION_PROGRESS.md) - Overall service status

---

*End of Document*
