# Dashboard Performance Regression Analysis

**Date:** October 19, 2025  
**Issue:** Dashboard load time increased from ~1 second to ~10 seconds  
**Severity:** Critical

## Executive Summary

The dashboard performance regression is caused by a **6.7 second blocking delay** that occurs specifically when querying data source 1 (Practice Analytics). This is NOT a Redis query performance issue, but rather appears to be a concurrency/parallelization problem in the dashboard rendering pipeline.

## Key Findings

### 1. The 6.7 Second Gap
- **Location:** Between timestamp 22:14:14.228 and 22:14:20.936 in the logs
- **Characteristic:** Complete silence in logs - no operations are being performed
- **Impact:** This gap alone accounts for most of the 10-second load time

### 2. Data Volume Differences
- **Data Source 1 (Practice Analytics):** Returns 1,501-1,580 rows
- **Data Source 3 (App Measures with Entities):** Returns 46-48 rows
- **Ratio:** Data source 1 has ~33x more data

### 3. Redis Performance is NOT the Issue
- Index lookups are fast: 47-66ms for data source 1
- Cache hits are successful with `warmingNeeded: false`
- The actual Redis operations complete quickly

### 4. Sequential vs Parallel Execution
Despite the dashboard renderer claiming "Parallel query execution (10x faster than sequential)", the logs show:
- All data source 3 queries complete first (timestamps 22:14:12 - 22:14:14)
- Then a 6.7 second gap
- Then data source 1 queries begin (timestamp 22:14:20+)

## Root Cause Analysis

### Evidence Points to Sequential Execution
1. **Pattern in logs:** Charts are processed in groups by data source
2. **Blocking behavior:** Data source 1 queries don't start until ALL other queries complete
3. **No concurrent timestamps:** Never see data source 1 and 3 queries running simultaneously

### Possible Causes
1. **Promise.all() not being used correctly** in the dashboard batch renderer
2. **Connection pool exhaustion** - Redis client might have a connection limit
3. **Resource lock/mutex** preventing concurrent access to data source 1
4. **Synchronous operation** in the data source 1 query path

## Immediate Investigation Areas

### 1. Dashboard Renderer Implementation
Check `/lib/services/dashboard-renderer.ts` line 195:
```typescript
const fullChartDefs = await Promise.all(fullChartDefsPromises);
```
While chart definitions are loaded in parallel, the actual chart data fetching might not be.

### 2. Redis Connection Pool
The Redis configuration shows:
- `maxRetriesPerRequest: 3`
- `enableOfflineQueue: true`
- No explicit connection pool size configured

Default ioredis behavior might be limiting concurrent operations.

### 3. Data Source Query Path
The 6.7 second gap with NO logs suggests:
- A synchronous blocking operation
- A timeout waiting for a resource
- An unlogged error/retry loop

## Recommendations

### Immediate Actions
1. **Add timing logs** at the start of each chart data fetch to identify sequencing
2. **Check Promise.all() usage** in dashboard chart rendering
3. **Monitor Redis connection count** during dashboard load
4. **Add logs before/after** any potentially blocking operations

### Code Areas to Investigate
1. `/lib/services/dashboard-renderer.ts` - Chart rendering loop
2. `/lib/services/analytics/query-orchestrator.ts` - Query routing logic  
3. `/lib/cache/indexed-analytics/query-service.ts` - Cache query implementation
4. `/lib/redis.ts` - Redis client configuration

### Potential Quick Fixes
1. **Increase Redis connection pool size** (if that's the bottleneck)
2. **Ensure Promise.all()** is used for parallel chart data fetching
3. **Add timeout logging** to identify where the 6.7 second delay occurs

## Performance Metrics

### Current State
- Total dashboard load: ~10 seconds
- Data source 3 queries: 68-104ms each
- Data source 1 queries: 513-765ms each (actual query time)
- Unexplained gap: 6.7 seconds

### Expected State
- Total dashboard load: ~1 second
- All queries running in parallel
- No unexplained gaps in execution

## Additional Findings

### Code Analysis Results
1. **Dashboard renderer IS using Promise.all()** correctly at line 436 of dashboard-renderer.ts
2. **Query deduplication cache** (Phase 7 feature) is working correctly and shouldn't cause delays
3. **The 6.7 second gap has NO logs**, suggesting:
   - A synchronous blocking operation
   - A timeout or retry loop without logging
   - Resource contention (e.g., Redis connection pool exhaustion)

### Most Likely Root Causes

1. **Redis Connection Pool Limit**
   - Default ioredis may have a connection pool limit
   - Data source 1 queries (1500+ rows) might exhaust available connections
   - Other queries have to wait for connections to be released

2. **Hidden Blocking Operation**
   - Something in the data source 1 query path is synchronous
   - Possibly in the indexed analytics cache query service
   - The 6.7 second delay matches typical connection timeout values

3. **Resource Lock/Mutex**
   - Possible exclusive lock on data source 1 resources
   - Query deduplication or cache warming might be holding a lock

## Conclusion

The performance regression is caused by a blocking operation that prevents true parallel execution, despite the code being structured for parallelism. The 6.7 second gap with no logs is the key indicator - this is NOT a slow query issue but rather a resource availability/blocking issue.

### Immediate Next Steps
1. **Add detailed timing logs** before and after each Redis operation
2. **Check Redis connection pool configuration** and monitor active connections
3. **Add timeout handlers** with logging to identify where the 6.7 second delay occurs
4. **Test with increased Redis connection pool size**
5. **Profile the indexed analytics cache query** for data source 1

### Likely Fix
Increase the Redis connection pool size or identify and remove the blocking operation in the data source 1 query path. The code structure supports parallelism, but a resource constraint is forcing sequential execution.

## Detailed Analysis Findings

### The Blocking Operation Location
Through code analysis, I've identified that the 6.7 second delay occurs:
1. **After** the query is initiated (`Building analytics query with caching` at 22:14:12)
2. **Before** the actual cache index lookup starts (which only takes 47ms)
3. **Inside** the `getCached` operation in `cache-operations.ts`
4. Most likely **during** the `isCacheWarm` check that calls `getCacheStats`

### Code Path
```
DataSourceCacheService.fetchDataSource()
  └─> CacheOperations.getCached()
      └─> indexedAnalyticsCache.isCacheWarm()
          └─> statsCollector.getCacheStats()
              └─> client.scard(masterIndex) // <-- Likely blocking here
```

### Why Data Source 1 is Different
- Data source 1 returns 1,501-1,580 rows (33x more than data source 3)
- The master index `idx:{ds:1}:master` might be significantly larger
- First access to data source 1 might trigger some initialization

### Most Probable Causes
1. **Redis Connection Issue**: The Redis client might be blocking while establishing a connection or waiting for an available connection from the pool
2. **Large Set Cardinality**: The SCARD operation on a very large master index might be slow
3. **Synchronous Initialization**: Some initialization code might be running synchronously on first access

## Debug Plan Created

I've created a comprehensive debugging plan at `/docs/DASHBOARD_PERFORMANCE_DEBUG_PLAN.md` that includes:
- Specific logging statements to add at each step of the code path
- Commands to check Redis state
- Hypotheses to test
- Expected outcomes from the debugging

The plan will help identify the exact location and cause of the 6.7 second delay.
