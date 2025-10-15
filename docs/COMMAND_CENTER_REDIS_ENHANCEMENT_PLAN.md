# Command Center Redis Cache Enhancement Plan

**Date:** October 15, 2025  
**Status:** Planning  
**Version:** 1.0  

---

## Executive Summary

Enhance the Command Center Redis cache management UI to provide comprehensive visibility into the new **Analytics Cache V2** (Secondary Index Sets) architecture and enable zero-downtime cache warming/refreshing.

---

## Current State Analysis

### ✅ What We Have

**Components:**
- `/app/(default)/admin/command-center/components/redis-admin-tabs.tsx` - Tab navigation
- `/app/(default)/admin/command-center/components/redis-cache-stats.tsx` - Basic Redis stats
- `/app/(default)/admin/command-center/components/redis-key-browser.tsx` - Key browsing
- `/app/(default)/admin/command-center/components/redis-purge-tools.tsx` - Key deletion
- `/app/(default)/admin/command-center/components/redis-key-inspector.tsx` - Key inspection

**APIs:**
- `GET /api/admin/redis/stats` - Generic Redis statistics
- `GET /api/admin/redis/keys?pattern=*` - Key search
- `GET /api/admin/redis/inspect?key=...` - Key details
- `POST /api/admin/redis/purge` - Delete keys by pattern
- `POST /api/admin/redis/ttl` - Update TTL

**Current Metrics (Generic Redis):**
- Hit rate (overall)
- Memory usage (overall)
- Total keys
- Ops/sec
- Connected clients
- Evicted keys
- Key distribution by pattern

### ❌ What's Missing

**Analytics Cache V2 Specific:**
- ❌ Per-datasource cache statistics
- ❌ Cache warming status and history
- ❌ Index health metrics (master index, secondary indexes)
- ❌ Cache key granularity breakdown
- ❌ Warming progress indicators
- ❌ Concurrent refresh/warm capability
- ❌ Cache quality metrics (staleness, coverage)
- ❌ Performance impact visualization

**User Experience:**
- ❌ No way to trigger cache warming from UI
- ❌ No visibility into when cache was last warmed
- ❌ No indication of which datasources are cached
- ❌ No way to refresh cache without downtime
- ❌ Limited actionable insights

---

## Target Architecture

### New Components

#### 1. **Analytics Cache Dashboard**
**Location:** New tab in `redis-admin-tabs.tsx`

**Features:**
- Overview of all data sources with cache status
- Per-datasource metrics cards
- Visual indicators for cache health
- Quick actions (warm, refresh, invalidate)

**Metrics per Datasource:**
```typescript
interface DatasourceCacheMetrics {
  datasourceId: number;
  datasourceName: string;
  
  // Cache Status
  isWarm: boolean;
  lastWarmed: string | null; // ISO timestamp
  ageMinutes: number;
  
  // Size Metrics
  totalEntries: number;       // Cache keys (granular entries)
  indexCount: number;         // Secondary indexes
  estimatedMemoryMB: number;
  
  // Coverage Metrics
  uniqueMeasures: number;
  uniquePractices: number;
  uniqueProviders: number;
  uniqueFrequencies: string[];
  
  // Performance Metrics
  avgQueryTimeMs: number;     // Average query time against this cache
  cacheHitRate: number;       // Hit rate for this datasource
  totalQueries: number;       // Total queries since last warm
  
  // Health Indicators
  health: 'excellent' | 'good' | 'degraded' | 'stale' | 'cold';
  warnings: string[];
}
```

#### 2. **Cache Warming Control Panel**
**Location:** New tab in `redis-admin-tabs.tsx`

**Features:**
- Start warming for specific datasource
- Warm all datasources
- Schedule automatic warming
- Monitor warming progress
- View warming history

**UI Design:**
```
┌─────────────────────────────────────────────────────────┐
│ Cache Warming Control                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Warm All Datasources]  [Schedule Auto-Warm]          │
│                                                          │
│  Individual Datasources:                                │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │ DS #1: Revenue Analytics                 │          │
│  │ Status: ✓ Warm (2 hours ago)            │          │
│  │ Entries: 12,458 | Memory: 45.2 MB       │          │
│  │ [Refresh] [Invalidate]                  │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │ DS #3: Operational Metrics               │          │
│  │ Status: ⚠ Stale (6 hours ago)           │          │
│  │ Entries: 8,234 | Memory: 28.7 MB        │          │
│  │ [Refresh] [Invalidate]                  │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
│  Active Warming Jobs:                                   │
│  ┌──────────────────────────────────────────┐          │
│  │ DS #5: Clinical Data                     │          │
│  │ ████████████░░░░░░░░░░ 60%              │          │
│  │ 145,234 / 242,000 rows processed         │          │
│  │ ETA: 45 seconds                          │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

#### 3. **Enhanced Statistics Panel**
**Location:** Enhance existing `redis-cache-stats.tsx`

**New Metrics:**
- Analytics Cache V2 section (separate from general Redis)
- Total datasources cached
- Total cache entries (granular keys)
- Total secondary indexes
- Average cache age
- Recommended actions

---

## New API Endpoints

### 1. Analytics Cache Statistics
```typescript
GET /api/admin/analytics/cache/stats

Response: {
  summary: {
    totalDatasources: number;
    warmDatasources: number;
    coldDatasources: number;
    totalCacheEntries: number;
    totalIndexes: number;
    totalMemoryMB: number;
    overallCacheHitRate: number;
  },
  datasources: DatasourceCacheMetrics[]
}
```

### 2. Warm Cache (Concurrent)
```typescript
POST /api/admin/analytics/cache/warm

Body: {
  datasourceId?: number;  // Omit to warm all
  force?: boolean;        // Force rewarm even if recently warmed
}

Response: {
  jobId: string;
  datasourcesQueued: number[];
  estimatedDuration: number;
}
```

### 3. Warming Status
```typescript
GET /api/admin/analytics/cache/warming/status

Response: {
  activeJobs: Array<{
    jobId: string;
    datasourceId: number;
    datasourceName: string;
    startedAt: string;
    progress: number;        // 0-100
    rowsProcessed: number;
    rowsTotal: number;
    etaSeconds: number;
  }>,
  recentJobs: Array<{
    jobId: string;
    datasourceId: number;
    datasourceName: string;
    startedAt: string;
    completedAt: string;
    duration: number;
    entriesCached: number;
    success: boolean;
    error?: string;
  }>
}
```

### 4. Invalidate Cache
```typescript
POST /api/admin/analytics/cache/invalidate

Body: {
  datasourceId: number;
}

Response: {
  keysDeleted: number;
  indexesDeleted: number;
  memoryFreedMB: number;
}
```

### 5. Cache Health Check
```typescript
GET /api/admin/analytics/cache/health

Response: {
  overall: 'excellent' | 'good' | 'degraded' | 'critical';
  issues: Array<{
    datasourceId: number;
    datasourceName: string;
    severity: 'warning' | 'error';
    issue: string;
    recommendation: string;
  }>;
  recommendations: string[];
}
```

---

## Concurrent Cache Warming Strategy

### Problem Statement
Current warming strategy uses distributed locks to prevent concurrent warming, which means:
- ❌ If warming is in progress, subsequent requests are skipped
- ❌ No ability to "refresh" cache without invalidating first
- ❌ Risk of stale data during long warm operations

### Solution: Shadow Warming
**Strategy:** Write new cache entries to new keys, then atomically swap.

#### Implementation Approach

**Step 1: Generate Shadow Keys**
```typescript
// Instead of:
cache:{ds:1}:m:Charges:p:114:prov:5:freq:Monthly

// Write to shadow keys during warming:
cache:shadow:{ds:1}:m:Charges:p:114:prov:5:freq:Monthly
idx:shadow:{ds:1}:master
idx:shadow:{ds:1}:m:Charges:freq:Monthly
// etc.
```

**Step 2: Warm to Shadow Keys**
```typescript
async warmCacheConcurrent(datasourceId: number): Promise<WarmResult> {
  const shadowPrefix = 'shadow:';
  
  // 1. Warm data to shadow keys (same logic as warmCache but with prefix)
  //    This can happen in parallel with live cache serving requests
  
  // 2. After warming completes, use Redis transactions to swap
  const multi = this.redis.multi();
  
  // For each cache key: RENAME shadow key to production key
  // For each index key: SUNIONSTORE shadow into production
  
  await multi.exec();
  
  // 3. Update metadata
  await this.redis.set(`cache:meta:{ds:${datasourceId}}:last_warm`, now);
  
  // 4. Clean up any remaining shadow keys
  await this.deletePattern(`*:shadow:{ds:${datasourceId}}:*`);
}
```

**Benefits:**
- ✅ Zero downtime - old cache serves requests during warming
- ✅ Atomic swap - either all new data or all old data, never mixed
- ✅ Rollback capable - keep shadow keys if swap fails
- ✅ Safe concurrent operations

#### Edge Case Handling

**1. Warming already in progress:**
```typescript
// Check for existing warming job
const existingJob = await this.redis.get(`lock:shadow:warm:${datasourceId}`);
if (existingJob) {
  return { status: 'already_warming', jobId: existingJob };
}
```

**2. Failed warming:**
```typescript
// If warming fails, shadow keys remain
// Next warming attempt can either:
// - Clean up and restart
// - Resume from shadow keys if partially complete
```

**3. Cache invalidation during warming:**
```typescript
// Invalidate both production AND shadow keys
await this.deletePattern(`cache:{ds:${datasourceId}}:*`);
await this.deletePattern(`cache:shadow:{ds:${datasourceId}}:*`);
```

---

## Implementation Phases

### Phase 1: Enhanced Statistics (Week 1)
**Goal:** Visibility into Analytics Cache V2

**Tasks:**
1. Create `GET /api/admin/analytics/cache/stats` endpoint
2. Implement `DatasourceCacheMetrics` aggregation logic
3. Create `analytics-cache-dashboard.tsx` component
4. Add new "Analytics Cache" tab to `redis-admin-tabs.tsx`
5. Display per-datasource metrics cards
6. Add cache health indicators

**Deliverables:**
- ✅ Per-datasource cache visibility
- ✅ Cache health scoring
- ✅ Memory and coverage metrics

### Phase 2: Concurrent Cache Warming (Week 2)
**Goal:** Zero-downtime cache refresh

**Tasks:**
1. Implement shadow key warming in `analytics-cache-v2.ts`
2. Create `POST /api/admin/analytics/cache/warm` endpoint
3. Implement job tracking and progress monitoring
4. Create `GET /api/admin/analytics/cache/warming/status` endpoint
5. Build `cache-warming-control-panel.tsx` component
6. Add progress bars and ETA calculations
7. Implement warming history tracking

**Deliverables:**
- ✅ Concurrent warming capability
- ✅ Progress monitoring UI
- ✅ Warming history

### Phase 3: Cache Management Actions (Week 3)
**Goal:** Admin tools for cache operations

**Tasks:**
1. Create `POST /api/admin/analytics/cache/invalidate` endpoint
2. Add "Refresh" buttons to datasource cards
3. Implement "Warm All" bulk operation
4. Create scheduled warming configuration UI
5. Add warming automation (cron-like scheduling)
6. Implement cache health alerts

**Deliverables:**
- ✅ Quick action buttons
- ✅ Bulk operations
- ✅ Scheduling capability

### Phase 4: Advanced Analytics (Week 4)
**Goal:** Performance insights and optimization

**Tasks:**
1. Track per-datasource query performance
2. Calculate cache hit rates per datasource
3. Create performance trend charts
4. Implement cache quality scoring
5. Add optimization recommendations
6. Create cache efficiency report

**Deliverables:**
- ✅ Performance analytics
- ✅ Trend visualization
- ✅ Actionable insights

---

## UI Mockups

### Analytics Cache Dashboard
```
┌───────────────────────────────────────────────────────────────┐
│ Analytics Cache V2 Overview                      [Warm All]   │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ 8 / 10  │ │ 42.3k   │ │ 186 MB  │ │ 98.5%   │           │
│  │ Warm    │ │ Entries │ │ Memory  │ │ Hit Rate│           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                                │
│  Data Sources:                                                 │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🟢 DS #1: Revenue Analytics              ⚡ Excellent  │  │
│  │ Last warmed: 1 hour ago                                │  │
│  │ 12,458 entries • 45.2 MB • 4 measures • 8 practices  │  │
│  │ Hit Rate: 99.2% • Avg Query: 2.1ms                    │  │
│  │ [🔄 Refresh] [🗑️ Invalidate] [📊 Details]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🟡 DS #3: Operational Metrics            ⚠️  Stale     │  │
│  │ Last warmed: 6 hours ago (TTL: 4 hours)               │  │
│  │ 8,234 entries • 28.7 MB • 3 measures • 12 practices  │  │
│  │ Hit Rate: 87.4% • Avg Query: 3.8ms                    │  │
│  │ [🔄 Refresh] [🗑️ Invalidate] [📊 Details]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔴 DS #5: Clinical Data                  ❌ Cold       │  │
│  │ Never warmed                                           │  │
│  │ No cache entries                                       │  │
│  │ [🔥 Warm Now] [📋 Configure]                          │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Cache Warming Progress
```
┌───────────────────────────────────────────────────────────────┐
│ Active Warming Operations                                      │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ DS #1: Revenue Analytics                               │  │
│  │ ████████████████████░░░░░░ 75%                        │  │
│  │ 183,458 / 245,012 rows • ETA: 32 seconds              │  │
│  │ Started: 2 minutes ago                                 │  │
│  │ [⏸️ Pause] [❌ Cancel]                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ DS #3: Operational Metrics                             │  │
│  │ ███████░░░░░░░░░░░░░░░░░░░ 35%                        │  │
│  │ 42,123 / 120,456 rows • ETA: 1 minute 15 seconds     │  │
│  │ Started: 45 seconds ago                                │  │
│  │ [⏸️ Pause] [❌ Cancel]                                 │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## Cache Health Scoring Algorithm

```typescript
function calculateCacheHealth(metrics: DatasourceCacheMetrics): HealthScore {
  const now = Date.now();
  const ageMinutes = metrics.ageMinutes;
  const hitRate = metrics.cacheHitRate;
  
  // Age scoring (0-40 points)
  let ageScore = 0;
  if (ageMinutes < 60) ageScore = 40;
  else if (ageMinutes < 120) ageScore = 35;
  else if (ageMinutes < 240) ageScore = 30;  // TTL threshold
  else if (ageMinutes < 360) ageScore = 20;
  else if (ageMinutes < 720) ageScore = 10;
  else ageScore = 0;
  
  // Hit rate scoring (0-40 points)
  let hitRateScore = 0;
  if (hitRate >= 95) hitRateScore = 40;
  else if (hitRate >= 90) hitRateScore = 35;
  else if (hitRate >= 80) hitRateScore = 30;
  else if (hitRate >= 70) hitRateScore = 20;
  else if (hitRate >= 50) hitRateScore = 10;
  else hitRateScore = 0;
  
  // Coverage scoring (0-20 points)
  const hasMeasures = metrics.uniqueMeasures > 0 ? 10 : 0;
  const hasPractices = metrics.uniquePractices > 0 ? 10 : 0;
  const coverageScore = hasMeasures + hasPractices;
  
  const totalScore = ageScore + hitRateScore + coverageScore;
  
  if (totalScore >= 90) return { health: 'excellent', score: totalScore };
  if (totalScore >= 75) return { health: 'good', score: totalScore };
  if (totalScore >= 50) return { health: 'degraded', score: totalScore };
  if (totalScore >= 25) return { health: 'stale', score: totalScore };
  return { health: 'cold', score: totalScore };
}
```

---

## Security Considerations

### RBAC Protection
All new endpoints protected by:
```typescript
permission: 'settings:write:all'  // Cache warming/invalidation
permission: 'settings:read:all'   // Cache statistics
```

### Audit Logging
All cache operations logged:
```typescript
{
  action: 'cache_warm_initiated',
  datasourceId: 1,
  userId: '[UUID]',
  concurrent: true,
  timestamp: '2025-10-15T20:00:00.000Z'
}
```

### Rate Limiting
```typescript
// Prevent abuse
warming: '10/hour/user',   // Max 10 warming operations per hour
invalidate: '20/hour/user', // Max 20 invalidations per hour
```

---

## Testing Strategy

### Unit Tests
- Shadow key generation
- Concurrent warming logic
- Health scoring algorithm
- Atomic swap operations

### Integration Tests
- Warm cache while serving requests
- Verify zero downtime
- Test rollback scenarios
- Concurrent warming multiple datasources

### Load Tests
- Warming performance with large datasets
- Cache serving during warming
- Memory usage during shadow warming

---

## Success Metrics

### Performance
- ⚡ Cache hit rate ≥ 95% (currently 100% ✅)
- ⚡ Average query time < 5ms
- ⚡ Warming completes < 2 minutes per datasource

### User Experience
- 🎯 Clear visibility into cache status
- 🎯 One-click cache refresh
- 🎯 Zero-downtime operations
- 🎯 Actionable health recommendations

### System Health
- 📊 <30% Redis memory usage
- 📊 No cache-related errors
- 📊 Automatic warming success rate > 99%

---

## Future Enhancements (Phase 5+)

1. **Predictive Warming**
   - ML model to predict cache usage patterns
   - Auto-warm before peak hours

2. **Smart Invalidation**
   - Selective invalidation by measure/practice/frequency
   - Partial cache updates instead of full rewarm

3. **Multi-Region Support**
   - Cache replication across regions
   - Geo-distributed warming

4. **Performance Insights**
   - Query pattern analysis
   - Cache optimization recommendations
   - Cost-benefit analysis of caching strategies

5. **Alerting Integration**
   - Slack/email alerts for cache health issues
   - Auto-remediation workflows

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shadow warming doubles memory usage | High | Monitor memory during warming, pause if threshold exceeded |
| Atomic swap fails mid-operation | High | Use Redis transactions (MULTI/EXEC), rollback on failure |
| Warming takes too long | Medium | Batch processing, progress monitoring, timeout handling |
| Concurrent warming overwhelms Redis | Medium | Queue warming jobs, rate limiting, max concurrent limit |
| Stale cache served during warming | Low | Shadow keys ensure old cache serves until new is ready |

---

## Conclusion

This enhancement plan provides:
1. ✅ **Complete visibility** into Analytics Cache V2 performance
2. ✅ **Zero-downtime** cache refresh capability
3. ✅ **Actionable insights** for optimization
4. ✅ **Admin-friendly tools** for cache management
5. ✅ **Production-ready** concurrent warming

Estimated implementation time: **4 weeks**  
Priority: **High** (enables production confidence in caching system)

---

**Next Steps:**
1. Review and approve plan
2. Create implementation tickets
3. Begin Phase 1 development
4. Iterate based on feedback

