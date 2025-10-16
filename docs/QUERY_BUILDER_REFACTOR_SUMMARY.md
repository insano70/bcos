# Query Builder Refactoring - Plan Evolution Summary

**Date:** 2025-01-15
**Status:** Ready for Implementation

---

## Document Evolution

This document tracks the evolution of the query builder refactoring plan as the Redis cache was implemented.

### Plan Versions

| Version | File | Status | Key Changes |
|---------|------|--------|-------------|
| **v1** | `query_builder_refactor_v1_with_cache.md` | ❌ Obsolete | Original plan WITH query-level caching |
| **v2** | `REFACTOR_DEDUPLICATION_SUMMARY.md` | ❌ Obsolete | Removed caching to avoid duplication with Redis Cache Plan |
| **v3** | (deprecated) | ❌ Obsolete | Post-cache implementation with v2 references |
| **FINAL** | `query_builder_refactor.md` | ✅ **CURRENT** | Updated for actual cache implementation (no v2 refs) |

---

## Current Cache Architecture

**IMPLEMENTED FILES:**
- `lib/cache/data-source-cache.ts` - Main cache service with RBAC filtering
- `lib/cache/indexed-analytics-cache.ts` - Secondary index sets for O(1) lookups

**KEY FEATURES:**
1. **Indexed caching**: Secondary index sets (no SCAN operations)
2. **In-memory RBAC**: Applied after cache fetch for maximum reuse
3. **Dual-path**: Indexed cache path + legacy fallback
4. **O(1) lookups**: Index intersection/union operations
5. **4-hour TTL**: With scheduled cache warming

---

## Cache File Naming

### ❌ OLD NAMES (Don't use these)
- `analytics-cache-v2.ts` ← Renamed
- References to "V2 cache" ← Removed
- References to "V1 fallback" ← Removed

### ✅ CURRENT NAMES (Use these)
- `indexed-analytics-cache.ts` ← Correct
- "Indexed cache" ← Correct
- "IndexedAnalyticsCache" ← Correct class name

---

## Integration Points

### What query-builder.ts Uses

**From DataSourceCacheService:**
```typescript
import { dataSourceCache, type CacheQueryParams } from '@/lib/cache';

// Main entry point
const result = await dataSourceCache.fetchDataSource(
  cacheParams,
  userContext,
  nocache
);
```

**Internally, DataSourceCacheService uses:**
```typescript
import { indexedAnalyticsCache } from './indexed-analytics-cache';

// For O(1) index lookups
const rows = await indexedAnalyticsCache.query(filters);
```

---

## Refactoring Strategy

### What to Extract from data-source-cache.ts

**These methods will be SHARED** (used by cache + legacy path):

1. **validateFilterFields()** → `QueryValidator`
   - Currently in `data-source-cache.ts` lines 240-282
   - Validates filter fields against data source config
   - Security-critical

2. **buildAdvancedFilterClause()** → `QueryBuilder`
   - Currently in `data-source-cache.ts` lines 291-361
   - Builds parameterized SQL for advanced filters
   - Used by cache's `queryDatabase()` method

### What to Keep in data-source-cache.ts

**DO NOT TOUCH** (cache-specific logic):
- `applyRBACFilter()` - In-memory RBAC after fetch
- `applyDateRangeFilter()` - In-memory date filtering
- `getCached()` - Delegates to indexed cache
- `warmDataSource()` - Cache warming with locking
- All secondary index logic

---

## Current State: analytics-query-builder.ts

**Lines of code:** 1,093
**Status:** Working but needs refactoring

### Dual-Path Architecture

```typescript
async queryMeasures(params, contextOrUserContext) {
  // Route to specialized handlers
  if (params.multiple_series) return this.queryMultipleSeries(...);
  if (params.period_comparison) return this.queryWithPeriodComparison(...);

  // Determine context type
  const isUserContext = 'email' in contextOrUserContext;

  // CACHE PATH: UserContext + data_source_id
  if (isUserContext && userContext && params.data_source_id) {
    const result = await dataSourceCache.fetchDataSource(...);
    return result; // ✅ Uses indexed cache with RBAC
  }

  // LEGACY PATH: ChartRenderContext OR missing data_source_id
  // ... 150+ lines of SQL building and execution
  return legacyResult;
}
```

### Problems to Fix

1. ❌ **Duplication**: Cache path + legacy path inline (no extraction)
2. ❌ **No tests**: Zero test coverage
3. ❌ **Mixed responsibilities**: Validation, sanitization, SQL building, execution all mixed
4. ❌ **Hard to maintain**: 1,093 lines in one file

---

## Refactoring Plan Summary

### Phase 1: Extract Shared Modules (Week 1)

Create new modules used by BOTH cache and legacy:

```
lib/services/analytics/
├── query-validator.ts       ← Extract validateFilterFields() from cache
├── query-sanitizer.ts       ← Extract from query builder
├── query-builder.ts         ← Extract buildAdvancedFilterClause() from cache
└── query-types.ts           ← Shared types
```

**Update data-source-cache.ts to use shared modules:**
```typescript
import { queryValidator } from '@/lib/services/analytics/query-validator';
import { queryBuilder } from '@/lib/services/analytics/query-builder';

// Use shared validator
await queryValidator.validateFilterFields(filters, dataSourceId, userContext);

// Use shared builder
const result = await queryBuilder.buildAdvancedFilterClause(...);
```

### Phase 2: Extract Executor & Orchestrator (Week 2)

```
lib/services/analytics/
├── query-executor.ts        ← Legacy path execution only
└── query-orchestrator.ts    ← Main router (cache vs legacy)
```

### Phase 3: Update Imports & Cleanup (Week 3)

- Update all dependent files to import from `@/lib/services/analytics`
- Deprecate old `analytics-query-builder.ts`
- Complete documentation
- Full test coverage

---

## Success Criteria

### Must Preserve

- ✅ Cache integration working
- ✅ Indexed cache with O(1) lookups
- ✅ In-memory RBAC filtering
- ✅ Dual-path architecture
- ✅ Cache warming with locking
- ✅ 4-hour TTL
- ✅ Performance (no regression)

### Must Achieve

- ✅ Lines per file <400 (from 1,093)
- ✅ Test coverage >80% (from 0%)
- ✅ Modular architecture
- ✅ Security validation isolated
- ✅ SQL building isolated
- ✅ Clear separation of concerns

---

## Key Terminology

### ✅ USE THESE TERMS

| Term | Meaning |
|------|---------|
| **Indexed cache** | Secondary index-based caching system |
| **IndexedAnalyticsCache** | Class that manages indexed cache |
| **Cache path** | Code path that uses `dataSourceCache.fetchDataSource()` |
| **Legacy path** | Code path that builds SQL directly |
| **Dual-path** | Architecture with cache + legacy paths |

### ❌ DON'T USE THESE TERMS

| Term | Why Not |
|------|---------|
| V2 cache | File renamed to `indexed-analytics-cache.ts` |
| V1 cache | No longer exists |
| V1/V2 fallback | Simplified to "legacy path" |
| AnalyticsCacheV2 | Class renamed to `IndexedAnalyticsCache` |

---

## Next Steps

1. **Review**: Ensure `query_builder_refactor.md` has no v2 references ✅
2. **Approve**: Get team approval on final plan
3. **Implement**: Follow 3-phase plan in `query_builder_refactor.md`
4. **Test**: Comprehensive test coverage throughout
5. **Deploy**: Gradual rollout with monitoring

---

## References

- [Current Refactoring Plan](./query_builder_refactor.md) - Main implementation plan
- [Redis Cache Implementation](./REDIS_CACHE_IMPLEMENTATION_PLAN.md) - Original cache plan
- [Deduplication Summary](./REFACTOR_DEDUPLICATION_SUMMARY.md) - Historical context

---

*End of Summary*
