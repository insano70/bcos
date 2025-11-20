# Charting System Cache Architecture

**Last Updated:** November 19, 2025  
**Version:** 2.0 (Post Phase 1 Consolidation)  
**Status:** Production Ready

---

## Overview

The charting system uses a **single-layer caching strategy** with Redis-backed data source caching and in-memory RBAC filtering for maximum cache reuse across users.

---

## Cache Architecture

```
┌────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                      │
│         /api/admin/analytics/chart-data/universal      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│             Chart Data Orchestrator                    │
│  - Validates request                                   │
│  - Loads chart definition (if chartDefinitionId)       │
│  - Merges runtime filters                              │
│  - Routes to chart type handler                        │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│             Chart Type Handler                         │
│  (Bar, Line, Table, Number, Dual-Axis, etc.)          │
│  - Builds query parameters                             │
│  - Calls analyticsQueryBuilder                         │
│  - Transforms raw data → Chart.js format (2-5ms)       │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│             Query Orchestrator                         │
│  - Validates data_source_id                            │
│  - Resolves table/schema names                         │
│  - Delegates to data-source-cache                      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│          Data Source Cache (Primary Cache)             │
│  Purpose: Cache raw database query results             │
│  TTL: 48 hours (172800 seconds)                        │
│  Key Format: datasource:{id}:m:{measure}:p:{p}:...    │
└────────────────────────────────────────────────────────┘
                         ↓
                ┌────────┴────────┐
                │                 │
         [CACHE HIT]         [CACHE MISS]
                │                 │
                │                 ↓
                │     ┌────────────────────────┐
                │     │ Data Source Query Svc  │
                │     │ - Builds SQL           │
                │     │ - Executes on DB       │
                │     │ - Returns raw rows     │
                │     └────────────────────────┘
                │                 │
                └────────┬────────┘
                         ↓
            ┌─────────────────────────┐
            │  In-Memory Filtering    │
            │  1. RBAC Filter         │
            │  2. Date Range Filter   │
            │  3. Advanced Filters    │
            └─────────────────────────┘
                         ↓
                 [FILTERED DATA]
```

---

## Cache Layers

### Layer 1: Data Source Cache (Primary)
**File:** `lib/cache/data-source-cache.ts`  
**Purpose:** Cache raw database query results  
**Backend:** `indexed-analytics-cache` (O(1) lookups)

**Key Format:**
```
Measure-based:
datasource:{id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}

Table-based:
datasource:{id}:table:p:{practice_uid}:prov:{provider_uid}

Examples:
- datasource:1:m:Revenue:p:114:prov:501:freq:monthly
- datasource:388:table:p:123:prov:*
```

**Features:**
- ✅ 48-hour TTL (data updates 1-2x daily)
- ✅ In-memory RBAC filtering (cache reuse across users)
- ✅ In-memory date range filtering
- ✅ In-memory advanced filters
- ✅ Automatic cache warming with distributed locking
- ✅ Secondary index sets for O(1) lookups
- ✅ Pattern-based invalidation

**Cache Key Components:**
- `dataSourceId` - Required (identifies data source)
- `measure` - Required for measure-based sources
- `frequency` - Required for measure-based sources
- `practiceUid` - Optional (explicit chart filter)
- `providerUid` - Optional (explicit chart filter)

**NOT in Cache Key:**
- ❌ User ID (filtering done in-memory)
- ❌ Organization ID (filtering done in-memory)
- ❌ Date range (filtering done in-memory)
- ❌ Advanced filters (filtering done in-memory)

This design **maximizes cache reuse** - same data serves all users with different permissions.

---

### Layer 2: Indexed Analytics Cache (Backend)
**File:** `lib/cache/indexed-analytics/` (modular)  
**Purpose:** Provide O(1) lookups and cache management

**Modules:**
- `cache-client.ts` - Redis operations
- `query-service.ts` - Index-based queries
- `warming-service.ts` - Distributed cache warming
- `invalidation-service.ts` - Pattern-based cleanup
- `stats-collector.ts` - Cache statistics
- `key-generator.ts` - Cache key building

**Secondary Indices:**
```
datasource:{id}:measures → Set of all measures for data source
datasource:{id}:practices → Set of all practices for data source  
datasource:{id}:frequencies → Set of all frequencies for data source
```

**Features:**
- ✅ O(1) cache lookups via index sets
- ✅ Distributed locking for cache warming (prevents race conditions)
- ✅ Rate limiting (6-minute cooldown per data source trigger)
- ✅ Automatic staleness detection (triggers warming at 4 hours)
- ✅ Comprehensive statistics (by data source, memory usage, largest entries)

---

## Cache Warming Strategy

### Automatic Warming (Self-Healing)
```typescript
// Triggered when stale cache detected (>4 hours old)
cacheWarmingService.triggerAutoWarmingIfNeeded(dataSourceId);

// Rate Limited: max 1 trigger per 6 minutes per data source
// Aggressive: Warms ALL data sources (not just the stale one)
```

**Warming Process:**
1. Acquire distributed lock (5-minute expiration)
2. Query all active data sources from database
3. For each data source, generate cache keys for all combinations
4. Execute queries in parallel (max 10 concurrent)
5. Store results with 48-hour TTL
6. Build secondary index sets
7. Release lock

**Rate Limiting:**
- Per-data-source cooldown: 6 minutes
- Global limit: 10 triggers per hour (distributed across all data sources)
- Lock expiration: 5 minutes (prevents deadlocks)

### Manual Warming
```typescript
// API endpoint: POST /api/admin/analytics/cache/warm
await cacheWarmingService.warmAllDataSources();

// Or single data source:
await cacheWarmingService.warmDataSource(dataSourceId);
```

---

## In-Memory Filtering Architecture

### Why Filter In-Memory?

**Alternative 1: Cache Per User**
```
❌ Cache key: datasource:1:m:Revenue:USER:123:p:114:prov:501
   - Explodes cache (N users × M charts)
   - Memory inefficient
   - Low cache hit rate
```

**Alternative 2: Cache Unfiltered, Filter In-Memory (CHOSEN)**
```
✅ Cache key: datasource:1:m:Revenue:p:*:prov:*
   - Single cache entry serves all users
   - High cache hit rate (85-95%)
   - RBAC applied server-side before client response
```

### Filter Execution Order

**CRITICAL: Order matters for security**

```typescript
// 1. RBAC Filtering (SECURITY CRITICAL - always first)
filteredRows = rbacFilterService.applyRBACFilter(rows, context, userContext);

// 2. Date Range Filtering (performance optimization)
if (startDate || endDate) {
  filteredRows = inMemoryFilterService.applyDateRangeFilter(
    filteredRows, dataSourceId, startDate, endDate
  );
}

// 3. Advanced Filters (dashboard universal filters)
if (advancedFilters?.length > 0) {
  filteredRows = inMemoryFilterService.applyAdvancedFilters(
    filteredRows, advancedFilters
  );
}
```

**Security Model:**
- **Fail-closed**: Empty `accessible_practices` for non-admin → NO DATA
- **Permission-based**: Validates scope against actual permissions (not roles)
- **Server-side**: RBAC filtering before sending to client
- **Audit logging**: Comprehensive security event logging

---

## Cache Invalidation Strategy

### Simplified Invalidation (Post Phase 1)

**Data Source Changes:**
```typescript
// When data source config changes
await chartConfigCache.invalidateDataSource(dataSourceId);

// Data is cached at data-source layer, config at chart-config layer
// No need to invalidate chart-data-cache (eliminated)
```

**Chart Definition Changes:**
```typescript
// When chart definition updated/deleted
await analyticsCache.invalidate('chart', chartId);
await analyticsCache.invalidate('chart'); // Invalidate list cache

// Data cache invalidation handled transparently at data-source layer
```

**Column Configuration Changes:**
```typescript
// When column metadata changes
await chartConfigCache.invalidateDataSource(dataSourceId);

// Automatic - no manual intervention needed
```

### Pattern-Based Invalidation
```typescript
// Invalidate all caches for a data source
await dataSourceCache.invalidate(dataSourceId);

// Invalidate specific measure
await dataSourceCache.invalidate(dataSourceId, 'Revenue');

// Invalidate by type
await dataSourceCache.invalidate(dataSourceId, undefined, 'measure-based');
```

---

## Cache Hit Scenarios

### Scenario 1: Same Chart, Multiple Users
```
User A (Admin) → Chart #1 → Cache MISS → Query DB → Cache (full dataset)
User B (Provider) → Chart #1 → Cache HIT → Filter in-memory → Return subset
User C (Org Admin) → Chart #1 → Cache HIT → Filter in-memory → Return org data
```

**Result:** 2 cache hits, 1 query (67% cache hit rate)

### Scenario 2: Dashboard with 10 Charts
```
Chart 1-10 → All share same data source → Single cache entry
             → Each chart transforms data differently
             → Total: 1 cache entry serves 10 charts
```

**Result:** Massive cache efficiency for dashboards

### Scenario 3: Dimension Expansion (5 Values)
```
Chart expanded by location (5 values):
  - Location A: Cache HIT (filtered to location=A)
  - Location B: Cache HIT (filtered to location=B)
  - Location C: Cache HIT (filtered to location=C)
  - Location D: Cache HIT (filtered to location=D)
  - Location E: Cache HIT (filtered to location=E)
```

**Result:** Single cache entry serves 5 dimension-expanded charts

---

## Configuration Cache (Metadata)

### Chart Config Cache
**File:** `lib/cache/chart-config-cache.ts`  
**Purpose:** Cache universal metadata (not practice-specific)  
**TTL:** 24 hours (rarely changes)

**What's Cached:**
- Data source configurations (table metadata, columns)
- Display configurations (chart display settings)
- Color palettes (color schemes)

**Key Formats:**
```
chartconfig:datasource:{dataSourceId}
chartconfig:display:{chartType}:{frequency}
chartconfig:palette:{paletteId}
```

**Separation of Concerns:**
- chart-config-cache: Universal metadata
- data-source-cache: Practice-specific data
- Clear boundary: Configuration vs Data

---

## Performance Characteristics

### Latency Breakdown (Typical Chart Request)

```
Total Request Time: ~205ms

├─ API Middleware (RBAC): ~20ms
├─ Chart Orchestration: ~5ms
├─ Query Orchestration: ~5ms
├─ Cache Lookup: ~5ms
│
├─ [CACHE HIT PATH - 85-95% of requests]
│  ├─ Redis fetch: ~3ms
│  ├─ RBAC filtering: ~1ms
│  ├─ Date filtering: ~1ms
│  ├─ Transformation: ~5ms
│  └─ Total: ~15ms ✅
│
└─ [CACHE MISS PATH - 5-15% of requests]
   ├─ Database query: ~150ms
   ├─ RBAC filtering: ~2ms
   ├─ Date filtering: ~2ms
   ├─ Transformation: ~5ms
   └─ Total: ~180ms
```

### Memory Usage (Production Estimate)

```
Data Source Cache:
├─ 5 active data sources
├─ ~50 unique measure/practice/provider combinations per source
├─ ~1,000 rows per cache entry
├─ ~50KB per cache entry
└─ Total: ~12.5MB (5 × 50 × 50KB)

Chart Config Cache:
├─ 5 data source configs × 5KB = 25KB
├─ 10 display configs × 1KB = 10KB
├─ 3 color palettes × 500B = 1.5KB
└─ Total: ~37KB

Grand Total: ~13MB (efficient!)
```

**Compare to Dual Cache (Before Phase 1):**
- Before: ~20MB (data + transformed)
- After: ~13MB (data only)
- **Savings: 35%**

---

## Cache TTL Strategy

| Cache Type | TTL | Rationale |
|------------|-----|-----------|
| Data Source | 48 hours | Data updates 1-2x daily, 24-hour staleness acceptable |
| Chart Config | 24 hours | Metadata rarely changes |
| Display Config | 24 hours | UI settings rarely change |
| Color Palettes | 24 hours | Color schemes rarely change |

**Automatic Warming:**
- Triggered when cache age > 4 hours
- Rate limited: max 1 trigger per 6 minutes per data source
- Warms ALL data sources (aggressive strategy)

---

## Security Model

### RBAC Filtering

**Fail-Closed Security:**
```typescript
// Non-admin with empty accessible_practices = NO DATA
if (!context.accessible_practices || context.accessible_practices.length === 0) {
  log.security('RBAC filter: Empty accessible_practices - blocking all data', 'critical');
  return []; // Fail closed
}
```

**Permission Scope Validation:**
```typescript
// Super admin: scope = 'all' (no filtering)
if (context.permission_scope === 'all') {
  return rows; // No filtering
}

// Organization admin: scope = 'organization'
// Filters to accessible_practices only

// Provider: scope = 'own'
// Filters to accessible_providers only
```

**Security Audit Logging:**
- Every RBAC filter operation logged with security level
- Tracks: rows blocked, practices filtered, suspicious activity
- Alerts on: all data blocked, permission scope mismatches

---

## Cache Key Design Principles

### Granular Keys for Maximum Reuse

**Good (Current Design):**
```
datasource:1:m:Revenue:p:*:prov:*:freq:monthly
└─ Wildcard (*) allows maximum reuse
└─ Single entry serves all practices/providers
└─ Filtering done in-memory
```

**Bad (Alternative - Rejected):**
```
datasource:1:m:Revenue:p:114:prov:501:freq:monthly
└─ Specific practice/provider in key
└─ Requires separate cache entry per combination
└─ Cache explosion
```

### Structured Keys vs Hash Keys

**Structured Keys (Used):**
```
Pros:
✅ Human-readable
✅ Pattern-based invalidation
✅ Easy debugging
✅ Can parse components

Cons:
❌ Longer keys
❌ Must handle wildcards
```

**Hash Keys (Rejected):**
```
Pros:
✅ Short keys
✅ Handles complex configs

Cons:
❌ Not human-readable
❌ Can't do pattern invalidation
❌ Hard to debug
❌ Potential collisions
```

**Decision:** Structured keys better for operational simplicity

---

## Cache Operations

### Read Path (fetchDataSource)

```typescript
import { dataSourceCache } from '@/lib/cache';

const result = await dataSourceCache.fetchDataSource(
  {
    dataSourceId: 1,
    schema: 'ih',
    table: 'agg_app_measures',
    measure: 'Revenue',
    frequency: 'monthly',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    practiceUids: [114, 115], // Advanced filter
  },
  userContext,
  nocache // Optional: bypass cache for previews
);

// Returns: { rows: [...], cacheHit: true/false }
// Rows are already filtered by RBAC, date, and advanced filters
```

### Invalidation

```typescript
import { dataSourceCache } from '@/lib/cache';

// Invalidate entire data source
await dataSourceCache.invalidate(dataSourceId);

// Invalidate specific measure
await dataSourceCache.invalidate(dataSourceId, 'Revenue');

// Invalidate by type
await dataSourceCache.invalidate(dataSourceId, undefined, 'measure-based');
```

### Statistics

```typescript
const stats = await dataSourceCache.getStats();

/*
Returns:
{
  totalKeys: 250,
  totalMemoryMB: 12.5,
  keysByLevel: {
    'datasource': 200,
    'measure': 50
  },
  byDataSource: {
    1: { keys: 50, memoryMB: 2.5, measures: ['Revenue', 'Charges'] },
    3: { keys: 100, memoryMB: 5.0, measures: ['Payments'] }
  },
  largestEntries: [
    { key: 'datasource:1:m:Revenue:...', sizeMB: 0.5, rowCount: 10000 }
  ]
}
*/
```

---

## Monitoring & Observability

### Key Metrics to Monitor

**Cache Performance:**
```typescript
log.info('Data source served from cache', {
  cacheKey: 'datasource:1:m:Revenue:p:*:prov:*:freq:monthly',
  cacheLevel: 'datasource',
  cachedRowCount: 5000,
  afterRBAC: 2500,
  finalRowCount: 1200,
  duration: 15,
  userId: context.user_id,
  permissionScope: 'organization',
});
```

**Metrics to Track:**
- Cache hit rate (target: 85-95%)
- RBAC filtering ratio (rows blocked %)
- Query latency (cache hit vs miss)
- Transform duration (<10ms)
- Cache memory usage (<20MB)

### Alerts

**Critical Alerts:**
- Cache hit rate < 70% (sustained for 10+ minutes)
- RBAC blocking 100% of data (potential permission issue)
- Cache warming failures (distributed lock timeouts)
- Memory usage > 50MB (cache growth issue)

**Warning Alerts:**
- Transform duration > 10ms (potential performance issue)
- Date filter removing > 90% rows (potential date range issue)
- Cache warming triggered > 15 times/hour (thrashing)

---

## API Endpoints

### Chart Data Fetching
```
POST /api/admin/analytics/chart-data/universal
Permission: analytics:read:organization or analytics:read:all

Body: {
  chartDefinitionId?: string,  // Option 1: Use existing chart
  chartConfig?: {              // Option 2: Inline config
    chartType: 'bar',
    dataSourceId: 1,
    groupBy: 'provider_name',
    ...
  },
  runtimeFilters?: {           // Override chart filters
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    organizationId: 'org-123',
    ...
  },
  nocache?: boolean            // Bypass cache (previews)
}

Response: {
  chartData: { labels: [...], datasets: [...] },
  rawData: [...],
  metadata: {
    chartType: 'bar',
    dataSourceId: 1,
    queryTimeMs: 15,
    cacheHit: true,
    recordCount: 1200
  }
}
```

### Cache Management
```
POST /api/admin/analytics/cache/warm
Permission: system:admin

Body: {
  dataSourceId?: number  // Optional: warm specific source
}

Response: {
  dataSourcesWarmed: 5,
  totalEntriesCached: 250,
  totalRows: 125000,
  duration: 1500
}
```

```
POST /api/admin/analytics/cache/invalidate
Permission: system:admin

Body: {
  dataSourceId?: number,
  measure?: string
}

Response: {
  keysDeleted: 50,
  success: true
}
```

```
GET /api/admin/analytics/cache/stats
Permission: system:admin

Response: {
  totalKeys: 250,
  totalMemoryMB: 12.5,
  byDataSource: {...},
  largestEntries: [...]
}
```

---

## Comparison: Before vs After Phase 1

### Before (Dual Cache Layer)

**Problems:**
- 2 cache layers (chart-data-cache + data-source-cache)
- Memory duplication (same data cached twice)
- Complex invalidation (must invalidate both)
- Different TTLs (1hr vs 48hr)
- Different key formats (hash vs structured)

**Code:**
```typescript
// Check chart-data-cache
const cacheKey = generateCacheKey(config);
const cached = await chartDataCache.get(cacheKey);
if (cached) return cached;

// Miss - fetch from orchestrator
const result = await orchestrator.fetch(...);

// Store in chart-data-cache
await chartDataCache.set(cacheKey, result);

// Also stored in data-source-cache (by orchestrator)
```

### After (Single Cache Layer)

**Benefits:**
- ✅ 1 cache layer (data-source-cache only)
- ✅ No memory duplication
- ✅ Simple invalidation strategy
- ✅ Single TTL (48 hours)
- ✅ Single key format (structured)

**Code:**
```typescript
// Direct orchestration - caching transparent
const result = await chartDataOrchestrator.orchestrate(request, context);

// Data source cache handles everything automatically
// Transformation runs on every request (~5ms)
return result;
```

**Trade-off:** +5ms latency for 35% memory savings and 50% code reduction

---

## Best Practices

### For Chart Developers

**DO:**
- ✅ Always pass `data_source_id` in chart configs
- ✅ Use `nocache=true` for chart builder previews
- ✅ Rely on data-source-cache for performance
- ✅ Let RBAC filtering happen in-memory

**DON'T:**
- ❌ Add user-specific data to cache keys
- ❌ Cache transformed data (transformation is fast)
- ❌ Manually invalidate caches (handled automatically)
- ❌ Query database directly (always go through query orchestrator)

### For Cache Administrators

**DO:**
- ✅ Monitor cache hit rates (target: 85-95%)
- ✅ Run cache warming during low-traffic periods
- ✅ Set up alerts for cache thrashing
- ✅ Review cache stats weekly

**DON'T:**
- ❌ Manually clear cache unless emergency
- ❌ Reduce TTL below 24 hours (defeats purpose)
- ❌ Add new cache layers without architectural review
- ❌ Cache per-user data (use in-memory filtering instead)

---

## Future Optimizations

### Potential Phase 2+ Improvements

1. **Batch Cache Warming**
   - Current: Sequential warming
   - Future: Parallel batch queries for multiple cache keys
   - Impact: 2-3x faster warming

2. **Predictive Cache Warming**
   - Current: Reactive (on staleness detection)
   - Future: Proactive (based on access patterns)
   - Impact: Higher cache hit rates

3. **Compression**
   - Current: JSON stringified data
   - Future: LZ4/Snappy compression
   - Impact: 50-70% memory savings

4. **Cache Tiering**
   - Current: Redis only
   - Future: Redis + in-process LRU for frequently-accessed entries
   - Impact: Sub-millisecond cache hits

**Note:** Do NOT implement these until proven necessary by production metrics

---

## Troubleshooting

### Low Cache Hit Rate (<70%)

**Possible Causes:**
1. Cache not warmed (check warming logs)
2. TTL too short (increase to 72 hours if needed)
3. Highly dynamic filters (expected for user-specific queries)

**Solution:**
```bash
# Force cache warming
curl -X POST http://localhost:4001/api/admin/analytics/cache/warm \
  -H "Authorization: Bearer $TOKEN"

# Check stats
curl http://localhost:4001/api/admin/analytics/cache/stats \
  -H "Authorization: Bearer $TOKEN"
```

### High Memory Usage (>50MB)

**Possible Causes:**
1. Too many data sources active
2. Large row counts per cache entry
3. No cache expiration (Redis config issue)

**Solution:**
```bash
# Check stats to find largest entries
curl http://localhost:4001/api/admin/analytics/cache/stats

# Selectively invalidate large entries
curl -X POST http://localhost:4001/api/admin/analytics/cache/invalidate \
  -d '{"dataSourceId": 1, "measure": "LargeMeasure"}'
```

### Stale Data

**Possible Causes:**
1. Cache not invalidating on data updates
2. TTL too long (48 hours)
3. Cache warming disabled

**Solution:**
```bash
# Force invalidation
curl -X POST http://localhost:4001/api/admin/analytics/cache/invalidate \
  -d '{"dataSourceId": 1}'

# Immediate warming
curl -X POST http://localhost:4001/api/admin/analytics/cache/warm \
  -d '{"dataSourceId": 1}'
```

---

## Related Documentation

- `docs/CACHE_CONSOLIDATION_ANALYSIS.md` - Detailed analysis and decision rationale
- `docs/PHASE_1_CACHE_CONSOLIDATION_CHANGELOG.md` - Complete change log
- `lib/cache/data-source-cache.ts` - Primary cache implementation
- `lib/cache/indexed-analytics/` - Backend cache services

---

**Last Review:** November 19, 2025  
**Next Review:** After Phase 2 completion (Filter Pipeline Consolidation)

