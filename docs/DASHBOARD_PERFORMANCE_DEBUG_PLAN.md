# Dashboard Performance Debugging Plan

## Current Understanding

### The Issue
- 6.7 second delay occurs specifically for data source 1 (Practice Analytics)
- Delay happens AFTER query initiation but BEFORE index lookup
- No logs during the 6.7 second gap
- Data source 3 queries execute immediately without delay

### Key Observations
1. Query initiated at ~22:14:12.108 (calculated from duration)
2. First log appears at 22:14:20.936 showing "Index lookup completed" with duration=8828ms
3. Actual index lookup only takes 47ms
4. The delay is ~8.7 seconds BEFORE any Redis operations

## Debugging Strategy

### 1. Add Timing Logs to Identify Exact Blocking Point

Add these log statements to trace the exact blocking location:

#### In `/lib/cache/data-source-cache.ts`
```typescript
// Line 119, before getCached call
log.info('Cache lookup starting', {
  dataSourceId: params.dataSourceId,
  measure: keyComponents.measure,
  timestamp: new Date().toISOString()
});

const cached = await cacheOperations.getCached(keyComponents);

log.info('Cache lookup completed', {
  dataSourceId: params.dataSourceId,
  measure: keyComponents.measure,
  timestamp: new Date().toISOString()
});
```

#### In `/lib/cache/data-source/cache-operations.ts`
```typescript
// Line 71, start of getCached method
log.info('getCached starting', {
  datasourceId,
  timestamp: new Date().toISOString()
});

// Line 75, before isCacheWarm
log.info('Checking if cache is warm', {
  datasourceId,
  timestamp: new Date().toISOString()
});

const isWarm = await indexedAnalyticsCache.isCacheWarm(datasourceId);

log.info('Cache warm check completed', {
  datasourceId,
  isWarm,
  timestamp: new Date().toISOString()
});
```

#### In `/lib/cache/indexed-analytics/index.ts`
```typescript
// Line 96, in isCacheWarm method
log.info('isCacheWarm starting', {
  datasourceId,
  timestamp: new Date().toISOString()
});

const stats = await this.statsCollector.getCacheStats(datasourceId);

log.info('isCacheWarm completed', {
  datasourceId,
  isWarm: stats.isWarm,
  timestamp: new Date().toISOString()
});
```

#### In `/lib/cache/indexed-analytics/stats-collector.ts`
```typescript
// Line 55, start of getCacheStats
log.info('getCacheStats starting', {
  datasourceId,
  timestamp: new Date().toISOString()
});

// Line 56, before scard
log.info('Getting master index cardinality', {
  datasourceId,
  masterIndex,
  timestamp: new Date().toISOString()
});

const totalKeys = await this.client.scard(masterIndex);

log.info('Master index cardinality retrieved', {
  datasourceId,
  totalKeys,
  timestamp: new Date().toISOString()
});
```

### 2. Check Redis Connection State

Add logging to verify Redis connection state:

#### In `/lib/cache/indexed-analytics/cache-client.ts`
```typescript
// In scard method, line 182
log.info('SCARD operation starting', {
  setKey,
  hasClient: !!client,
  timestamp: new Date().toISOString()
});

const result = await client.scard(setKey);

log.info('SCARD operation completed', {
  setKey,
  result,
  timestamp: new Date().toISOString()
});
```

### 3. Monitor Redis Client Acquisition

#### In `/lib/redis.ts`
```typescript
// In getClient method, add timing
log.info('Redis client requested', {
  hasClient: !!this.client,
  isConnected: this.isConnected,
  isConnecting: this.isConnecting,
  timestamp: new Date().toISOString()
});
```

### 4. Check for Concurrent Access Issues

Add a counter to track concurrent Redis operations:

```typescript
// In cache-client.ts at class level
private concurrentOps = 0;

// In each Redis operation
this.concurrentOps++;
log.info('Redis operation started', {
  operation: 'scard',
  concurrentOps: this.concurrentOps,
  timestamp: new Date().toISOString()
});

try {
  // ... operation ...
} finally {
  this.concurrentOps--;
}
```

## Hypotheses to Test

### 1. Redis Connection Pool Exhaustion
- Data source 1 has 33x more data than data source 3
- Multiple parallel queries might exhaust connection pool
- Test: Monitor concurrent Redis operations

### 2. Master Index Size Issue
- Data source 1 might have a massive master index set
- SCARD operation might be slow on very large sets
- Test: Log the totalKeys value for each data source

### 3. Redis Client Initialization
- First access to Redis for data source 1 might trigger initialization
- Connection might be timing out and retrying
- Test: Log Redis client state on each request

### 4. Synchronous Blocking in Stats Collection
- Something in getCacheStats might be blocking
- Possibly related to metadata retrieval
- Test: Add timing logs around each operation

## Quick Test Commands

### 1. Check Master Index Sizes
```bash
redis-cli SCARD "idx:{ds:1}:master"
redis-cli SCARD "idx:{ds:3}:master"
```

### 2. Check Redis Connection Count
```bash
redis-cli CLIENT LIST | wc -l
```

### 3. Monitor Redis Operations
```bash
redis-cli MONITOR | grep -E "SCARD|GET.*meta"
```

## Expected Outcome

After adding these logs, we should see exactly where the 6.7 second delay occurs:
1. If delay is before "Checking if cache is warm" - issue is in initial setup
2. If delay is between "Checking if cache is warm" and "Cache warm check completed" - issue is in isCacheWarm
3. If delay is in SCARD operation - Redis performance issue
4. If delay is in client acquisition - connection pool issue

## Next Steps

1. Implement the logging additions
2. Run the dashboard load test
3. Analyze the new logs to pinpoint exact blocking location
4. Based on findings, implement targeted fix:
   - Increase connection pool size
   - Add timeout to blocking operations
   - Cache the warm check result
   - Optimize master index structure
