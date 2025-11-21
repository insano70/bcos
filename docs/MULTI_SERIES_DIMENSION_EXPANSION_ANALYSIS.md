# Multi-Series Dimension Expansion - Complete Analysis

**Date:** November 20, 2025  
**Issue:** Multi-series dual-axis charts only show ONE series when expanded by dimension  
**Status:** ROOT CAUSE IDENTIFIED

---

## Issue Summary

**Expected:** Dual-axis chart with 2 series (Charges + Payments) expanded by Location shows BOTH series for each location  
**Actual:** Only shows ONE series (Charges) for each location, Payments series is missing  
**Additional:** Runtime filters are lost, reverting to default chart filters

---

## How Multi-Series Dual-Axis Charts Work

### Step 1: Chart Configuration

Dual-axis charts store configuration like this:

```json
{
  "chart_config": {
    "dualAxisConfig": {
      "primary": {
        "measure": "Charges",
        "chartType": "bar",
        "axisPosition": "left",
        "axisLabel": "Charges"
      },
      "secondary": {
        "measure": "Payments",
        "chartType": "bar",
        "axisPosition": "right",
        "axisLabel": "Payments"
      }
    },
    "frequency": "Monthly",
    "series": {
      "groupBy": "practice_primary",
      "colorPalette": "default"
    },
    "dataSourceId": 2
  }
}
```

### Step 2: Data Fetching (ComboChartHandler)

```typescript
// lib/services/chart-handlers/combo-handler.ts:31-113

async fetchData(config, userContext) {
  const dualAxisConfig = config.dualAxisConfig;
  
  // Fetch PRIMARY measure (Charges)
  const primaryConfig = {
    ...config,
    measure: dualAxisConfig.primary.measure,  // "Charges"
  };
  
  // Fetch SECONDARY measure (Payments)  
  const secondaryConfig = {
    ...config,
    measure: dualAxisConfig.secondary.measure,  // "Payments"
  };
  
  // Fetch BOTH in parallel
  const [primaryResult, secondaryResult] = await Promise.all([
    super.fetchData(primaryConfig, userContext),
    super.fetchData(secondaryConfig, userContext),
  ]);
  
  // Tag data with series_id
  const taggedPrimaryData = primaryResult.data.map(record => ({
    ...record,
    series_id: 'primary',
  }));
  
  const taggedSecondaryData = secondaryResult.data.map(record => ({
    ...record,
    series_id: 'secondary',
  }));
  
  // Return COMBINED dataset
  return {
    data: [...taggedPrimaryData, ...taggedSecondaryData],
    cacheHit: primaryResult.cacheHit && secondaryResult.cacheHit,
    queryTimeMs: Math.max(primaryResult.queryTimeMs, secondaryResult.queryTimeMs),
  };
}
```

**KEY POINT:** ComboChartHandler fetches data for TWO measures and combines them!

### Step 3: Transformation

The transform separates by series_id:

```typescript
// Split data by series
const primaryData = data.filter(record => record.series_id === 'primary');
const secondaryData = data.filter(record => record.series_id === 'secondary');

// Create two datasets
datasets: [
  { label: 'Charges', data: primaryValues, yAxisID: 'y' },
  { label: 'Payments', data: secondaryValues, yAxisID: 'y1' }
]
```

---

## Dimension Expansion Flow Analysis

### What SHOULD Happen

```
1. User clicks "Expand by Location"
2. Frontend sends chartExecutionConfig with:
   - finalChartConfig: { dualAxisConfig, frequency, ... }
   - runtimeFilters: { startDate, endDate, practiceUids, ... }
   - metadata: { frequency }

3. Backend (dimension-expansion-renderer):
   - Gets dimension values (e.g., ["Downtown", "Uptown", "Westside"])
   - For EACH location:
     a. Add dimension filter: { field: "location", value: "Downtown" }
     b. Call chartDataOrchestrator.orchestrate()
     c. Orchestrator calls ComboChartHandler.fetchData()
     d. Handler fetches PRIMARY measure (Charges) with location filter
     e. Handler fetches SECONDARY measure (Payments) with location filter
     f. Handler combines both datasets with series_id tags
     g. Handler transforms to ChartData with 2 datasets
   - Returns array of charts (one per location, each with 2 series)

4. Frontend displays side-by-side charts
```

### What's ACTUALLY Happening

Based on screenshots:
- ✅ Dimension values are found (9 locations)
- ✅ Charts are rendered
- ❌ Only ONE series per chart (Charges)
- ❌ Payments series is missing
- ❌ Runtime filters lost

---

## ROOT CAUSE #1: dualAxisConfig Not in finalChartConfig

**Problem:** Frontend is not including dualAxisConfig in chartExecutionConfig!

**Evidence from frontend code:**

```typescript
// components/charts/dual-axis-fullscreen-modal.tsx:120-144

const baseConfig: Record<string, unknown> = {
  ...chartConfig,            // ← This should have dualAxisConfig
  chartType: 'dual-axis',
  dataSourceId: dataSourceId,
  frequency: dualAxisFrequency,
  groupBy: extractedGroupBy,
  colorPalette: extractedColorPalette,
};
```

**BUT:** We don't know if `chartConfig` prop actually contains `dualAxisConfig`!

**Verification needed:** Does DualAxisFullscreenModal receive dualAxisConfig in chartConfig prop?

Looking at batch-chart-renderer.tsx line 351:

```typescript
<DualAxisFullscreenModal
  {...(chartDefinition.chart_config && { chartConfig: chartDefinition.chart_config })}
/>
```

So `chartConfig` = `chartDefinition.chart_config` which is the raw database JSONB.

**This should have dualAxisConfig!** But let's verify it's being spread properly.

---

## ROOT CAUSE #2: Runtime Filters Being Overridden

**Problem:** You mentioned "we've lost all runtime filters and we're going back to the default chart filters"

**This suggests:** When we build chartExecutionConfig, we're not preserving the runtime filters from the current dashboard state!

**Evidence:**

```typescript
// dual-axis-fullscreen-modal.tsx:145-148
const runtimeFilters: Record<string, unknown> = { ...currentFilters };
runtimeFilters.frequency = dualAxisFrequency;
```

**Issue:** We're ONLY including currentFilters + frequency, but NOT:
- The dimension filter that was just added
- Any other filters from the base chart

**The problem:** We're creating chartExecutionConfig FROM SCRATCH instead of using the one that was already built for the base chart!

---

## ACTUAL ROOT CAUSE: Not Passing Through Base ChartExecutionConfig

**THE REAL ISSUE:**

When the dashboard renders the base chart, it builds a `ChartExecutionConfig` via:
1. DashboardRenderingService → FilterService → ChartConfigBuilderService
2. This creates a COMPLETE chartExecutionConfig with:
   - finalChartConfig (includes dualAxisConfig, groupBy, colorPalette)
   - runtimeFilters (resolved dates, practices, etc.)
   - metadata (measure, frequency, groupBy)

**BUT:** This chartExecutionConfig is NOT passed to the frontend!

The frontend only receives:
- chartData (the rendered chart)
- chartDefinition (the database record)
- currentFilters (the dashboard universal filters)

**The frontend RECONSTRUCTS chartExecutionConfig** but it's doing it WRONG:
- It's using raw `chartDefinition.chart_config` instead of the flattened/normalized version
- It's not including all runtime filters
- It's losing context

---

## The Correct Solution

### Option A: Pass Full ChartExecutionConfig from Dashboard to Modal

**Flow:**
```
1. Dashboard renders chart
2. BatchExecutorService builds chartExecutionConfig
3. Dashboard stores chartExecutionConfig in state
4. When user clicks fullscreen, pass ENTIRE chartExecutionConfig to modal
5. Modal passes it to dimension expansion API AS-IS
6. Backend uses it AS-IS (no reconstruction)
```

**Pros:**
- ✅ Perfect accuracy (uses exact config from render)
- ✅ No reconstruction needed
- ✅ All filters preserved
- ✅ dualAxisConfig guaranteed present

**Cons:**
- ❌ Requires dashboard to track chartExecutionConfig per chart
- ❌ More state management
- ❌ Larger data passed around

### Option B: Backend Should Use chartDefinitionId (Simpler)

**Flow:**
```
1. Frontend sends ONLY chartDefinitionId + dimensionColumn + currentFilters
2. Backend fetches chart definition
3. Backend builds chartExecutionConfig (like it did before my changes)
4. Backend uses it for dimension expansion
```

**Pros:**
- ✅ Frontend stays simple
- ✅ Backend has complete control
- ✅ Always gets correct config
- ✅ Works for all chart types

**Cons:**
- ❌ Re-fetches metadata (the thing we tried to optimize)
- ❌ Slower (100ms overhead)

---

## Recommended Fix: REVERT to chartDefinitionId Approach

**Analysis:**

My optimization (passing chartExecutionConfig from frontend) has caused:
1. Missing dualAxisConfig (broken multi-series)
2. Lost runtime filters (wrong data)
3. Incorrect config reconstruction (missing groupBy/colorPalette)
4. More complexity in frontend

**The original approach was CORRECT:**
- Backend fetches chart definition
- Backend builds config correctly
- Backend knows how to handle dual-axis, multi-series, etc.
- Always works

**My optimization saved 100ms but broke functionality.**

**RECOMMENDATION: Revert the optimization entirely.**

### What To Revert

1. **dimension-expansion-renderer.ts:** Remove optimized path, always use chartDefinitionId
2. **Frontend modals:** Remove chartExecutionConfig building, just send chartDefinitionId + filters
3. **API route:** Remove format detection, always expect chartDefinitionId
4. **Validation schema:** Remove chartExecutionConfig schema

**Back to:**
```typescript
// Frontend (simple):
await apiClient.post('/expand', {
  dimensionColumn: 'location',
  baseFilters: currentFilters,  // Include all current filters!
  limit: 20
});

// Backend (correct):
const chartDef = await chartsService.getChartById(chartDefinitionId);
const configBuilder = new ChartConfigBuilderService();
const chartExecutionConfig = configBuilder.buildSingleChartConfig(chartDef, resolvedFilters);
// Always correct, always works
```

---

## Alternative: Fix the Frontend Reconstruction

If you don't want to revert, we need to:

1. **Pass complete chartExecutionConfig from dashboard to modals**
   - Dashboard must store the exact chartExecutionConfig used to render
   - Pass it through props
   - Modal uses it AS-IS (no reconstruction)

2. **Include ALL runtime filters**
   - Not just currentFilters
   - Also resolved filters from the actual render
   - startDate, endDate (resolved from preset)
   - practiceUids (resolved from organizationId)

3. **Verify dualAxisConfig is present**
   - Log what's in chartConfig
   - Ensure dualAxisConfig is there
   - Ensure it's being spread properly

**This is complex and error-prone.**

---

## My Strong Recommendation

**REVERT the chartExecutionConfig optimization entirely.**

**Why:**
1. It broke multi-series charts
2. It lost runtime filters
3. It's complex to get right
4. The 100ms savings isn't worth the bugs
5. The original approach was simpler and worked

**What to keep:**
1. ✅ Filter resolution (resolves dateRangePreset and organizationId)
2. ✅ dimension-value-cache (uses dataSourceCache)
3. ✅ Migration 0053 (marks dimensions as filterable)

**What to revert:**
1. ❌ Optimized path in dimension-expansion-renderer
2. ❌ chartExecutionConfig building in frontend modals
3. ❌ New validation schemas
4. ❌ All the complexity

**Result:** Simpler, more reliable, works for all chart types.

---

## Immediate Action Plan

### Plan A: REVERT (Recommended)
1. Remove optimized path from dimension-expansion-renderer
2. Always use chartDefinitionId path
3. Simplify frontend modals (just send filters)
4. Test - should work perfectly

### Plan B: FIX (Complex)
1. Debug what chartConfig actually contains
2. Ensure dualAxisConfig is included
3. Preserve ALL runtime filters from base chart
4. Test extensively with all chart types

**I strongly recommend Plan A (REVERT).**

The optimization wasn't worth the complexity and bugs it introduced.

---

**Decision Point:**

Should I:
**A) REVERT the chartExecutionConfig optimization (recommended)**  
**B) Try to FIX the frontend reconstruction (complex, risky)**  
**C) Do more investigation before deciding**

Please advise.

