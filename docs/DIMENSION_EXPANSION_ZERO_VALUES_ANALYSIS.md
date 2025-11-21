# Dimension Expansion "0 Values" Root Cause Analysis

**Date:** November 20, 2025  
**Issue:** Dimension expansion returns 0 values when using optimized path  
**Status:** IDENTIFIED - Filter resolution missing

---

## Issue Summary

**Symptom:** Clicking "Expand by Dimension" returns "Expanded by Location • 0 values"

**Logs Show:**
```json
{
  "message": "Dimension values discovered via optimized cache",
  "valueCount": 0,
  "cacheHit": true,
  "queryTimeMs": 32
}
```

**Cache hit with 0 values** = Filters are too restrictive or not being applied correctly

---

## Root Cause Analysis

### Data Flow Trace

```
1. FRONTEND (ChartFullscreenModal)
   Sends:
   {
     chartExecutionConfig: {
       runtimeFilters: {
         dateRangePreset: "last_6_full_months",  // ← UNRESOLVED!
         organizationId: "[UUID]",                // ← UNRESOLVED!
         frequency: "Monthly",
         measure: "Charges"
       }
     }
   }

2. BACKEND (dimension-expansion-renderer.ts lines 192-230)
   Extracts filters from runtimeFilters:
   
   if (typeof runtimeFilters.startDate === 'string') {  // ← FAILS (no startDate!)
     filtersForDimensionDiscovery.startDate = runtimeFilters.startDate;
   }
   
   Result: filtersForDimensionDiscovery has NO date filters!

3. BACKEND (FilterBuilderService.toChartFilterArray)
   Converts to ChartFilter array:
   
   if (universalFilters.startDate) {  // ← UNDEFINED!
     filters.push({ field: 'date', operator: 'gte', value: startDate });
   }
   
   Result: NO date filters in array!

4. BACKEND (dimension-discovery-service.ts lines 212-243)
   Extracts parameters:
   
   const startDateFilter = filters.find((f) => f.field === 'date' && f.operator === 'gte');
   // ← Returns UNDEFINED (no date filters)
   
   const queryParams = {
     dataSourceId,
     dimensionColumn,
     measure: "Charges",
     frequency: "Monthly",
     // NO startDate ❌
     // NO endDate ❌
     // NO practiceUids ❌ (organizationId not resolved)
   };

5. BACKEND (dimension-value-cache.ts)
   Queries cache:
   
   await dataSourceCache.fetchDataSource({
     dataSourceId: 2,
     measure: "Charges",
     frequency: "Monthly",
     // NO startDate - fetches ALL time!
     // NO practiceUids - fetches ALL practices (but RBAC filters in-memory)
   });

6. RESULT
   Cache returns data, but when extracting unique values for "location" column:
   - Data might not have "location" column populated
   - Or all location values are NULL
   - Returns 0 values
```

---

## The Core Problem

**Issue:** `runtimeFilters` in chartExecutionConfig contains **UNRESOLVED** filters:
- `dateRangePreset` instead of `startDate`/`endDate`
- `organizationId` instead of `practiceUids`

**Why:** When the dashboard initially renders the chart, it resolves these filters. But it stores the UNRESOLVED values in the chartExecutionConfig that's sent to the frontend.

**Impact:** When dimension expansion extracts filters from runtimeFilters, it gets unresolved values that are ignored.

---

## Verification

Looking at the log you provided:
```json
{
  "runtimeFilters": {
    "dateRangePreset": "last_6_full_months",  // Should be: startDate, endDate
    "organizationId": "[UUID]",                // Should be: practiceUids: [100, 101, ...]
    "frequency": "Monthly",                     // ✓ OK
    "measure": "Charges"                        // ✓ OK
  }
}
```

**Confirmed:** The runtimeFilters have unresolved filters!

---

## Two Possible Fixes

### Option 1: Resolve Filters on Backend (RECOMMENDED)

**Where:** dimension-expansion-renderer.ts when using optimized path

**Fix:** When chartExecutionConfig is provided, resolve the filters before using them:

```typescript
// OPTIMIZED PATH
if (providedConfig) {
  chartExecutionConfig = providedConfig;
  dataSourceId = providedConfig.finalChartConfig.dataSourceId;
  
  // NEW: Resolve unresolved filters from runtimeFilters
  const runtimeFilters = chartExecutionConfig.runtimeFilters;
  
  // Check if filters need resolution
  if (runtimeFilters.dateRangePreset || runtimeFilters.organizationId) {
    log.info('Resolving unresolved filters in optimized path', {
      hasDatePreset: !!runtimeFilters.dateRangePreset,
      hasOrgId: !!runtimeFilters.organizationId,
      component: 'dimension-expansion',
    });
    
    // Use FilterPipeline to resolve
    const pipeline = createFilterPipeline(userContext);
    const result = await pipeline.process(runtimeFilters, {
      component: 'dimension-expansion',
      dataSourceId,
      enableOrgResolution: true,
    });
    
    // Update chartExecutionConfig with RESOLVED filters
    chartExecutionConfig = {
      ...chartExecutionConfig,
      runtimeFilters: result.runtimeFilters, // Now has startDate, endDate, practiceUids
    };
  }
}
```

**Pros:**
- ✅ Backend can always resolve filters correctly
- ✅ Frontend doesn't need to change
- ✅ Works for both resolved and unresolved filters
- ✅ Backwards compatible

**Cons:**
- ❌ Adds back some of the resolution overhead we tried to eliminate
- ❌ But only when needed (if filters already resolved, skip this)

---

### Option 2: Resolve Filters on Frontend (CLEANER)

**Where:** ChartFullscreenModal, DualAxisFullscreenModal, ProgressBarFullscreenModal

**Fix:** Resolve filters before sending to backend:

```typescript
// In modal's handleDimensionSelect
const chartExecutionConfig = {
  chartId,
  chartName,
  chartType,
  finalChartConfig: { ... },
  runtimeFilters: {
    startDate: currentFilters.startDate,      // ← Use RESOLVED values
    endDate: currentFilters.endDate,          // ← Already resolved by dashboard
    practiceUids: currentFilters.practiceUids, // ← Already resolved
    frequency,
    measure,
  },
  metadata: { measure, frequency, groupBy },
};
```

**But wait** - looking at the frontend code, `currentFilters` also has `dateRangePreset` and `organizationId`:

```typescript
currentFilters?: {
  startDate?: string | null;
  endDate?: string | null;
  organizationId?: string | null;    // ← Still unresolved!
  practiceUids?: number[];
  providerName?: string | null;
}
```

So the frontend is receiving unresolved filters from the dashboard!

**Pros:**
- ✅ Cleaner separation (frontend handles resolution)
- ✅ Backend only deals with resolved filters

**Cons:**
- ❌ Requires dashboard to pass RESOLVED filters to modals
- ❌ Frontend needs access to resolution logic
- ❌ More complex frontend code

---

## Recommended Fix: Option 1 (Backend Resolution)

**Implement filter resolution in the optimized path:**

1. Detect if runtimeFilters have unresolved filters (dateRangePreset, organizationId)
2. If yes, use FilterPipeline to resolve them
3. Update chartExecutionConfig with resolved filters
4. Continue with dimension discovery

**This maintains the optimization benefits:**
- ✅ Still skips chart definition fetch
- ✅ Still skips data source config fetch  
- ✅ Still skips ChartConfigBuilderService
- ✅ Only adds resolution when needed (~10ms)

**Net savings:** Still 90ms faster than original (was 100ms savings, minus 10ms for resolution)

---

## Alternative Investigation

**Could the issue be with the "location" column itself?**

Let me check if the cache query is actually returning data but location column is NULL/empty:

From logs: `"cacheHit": true, "queryTimeMs": 32, "valueCount": 0"`

This suggests:
1. Cache was hit successfully
2. Query was fast
3. But returned 0 rows OR rows have no location values

**Need to verify:**
- Does the cache actually have data for this measure/frequency?
- Does that data have the "location" column populated?
- Is the RBAC filtering too restrictive?

---

## Immediate Debug Steps

Add logging to see what the cache is returning:

```typescript
// In dimension-value-cache.ts
log.info('Cache result analysis', {
  totalRows: cacheResult.rows.length,
  sampleRows: cacheResult.rows.slice(0, 3),
  hasLocationColumn: cacheResult.rows.length > 0 && 
                     'location' in cacheResult.rows[0],
  locationValues: cacheResult.rows
    .slice(0, 10)
    .map(r => r[dimensionColumn]),
  component: 'dimension-value-cache',
});
```

This will show:
- How many rows the cache returned
- Sample data structure
- Whether location column exists
- What values are in location column

---

## Recommendation

**Immediate Fix (Option 1):**
Add filter resolution to optimized path to handle dateRangePreset and organizationId.

**Then Debug:**
Add logging to see what cache is returning to verify location column has data.

**Should I proceed with implementing Option 1?**

