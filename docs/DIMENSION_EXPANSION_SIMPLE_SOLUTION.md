# Dimension Expansion - The Simple Solution

**Date:** November 20, 2025  
**Insight:** Just re-render the base chart multiple times with dimension filter added

---

## The Correct Mental Model

### What We HAVE (Base Chart)
✅ Fully rendered chart with ALL the correct:
- finalChartConfig (includes seriesConfigs, dualAxisConfig, groupBy, colorPalette, EVERYTHING)
- runtimeFilters (resolved dates, resolved practices, all filters)
- Proven to work (it's displaying correctly!)

### What We NEED (Dimension Expansion)
✅ The SAME chart, but filtered by dimension value

**Example:**
- Base chart: All locations combined
- Dimension expansion: Same chart × N (one per location)
  - Location = "Downtown" → same chart config, add location filter
  - Location = "Uptown" → same chart config, add location filter
  - Location = "Westside" → same chart config, add location filter

---

## The Simple Flow

```
1. Base chart renders successfully
   ├─ Frontend has: chartData (rendered output)
   └─ Frontend should ALSO have: finalChartConfig + runtimeFilters used to render it

2. User clicks "Expand by Dimension"
   ├─ Frontend sends:
   │  ├─ finalChartConfig (the EXACT config from step 1)
   │  ├─ runtimeFilters (the EXACT filters from step 1)
   │  └─ dimensionColumn: "location"
   └─ Backend:
       ├─ Gets dimension values: ["Downtown", "Uptown", "Westside"]
       └─ For EACH value:
           ├─ Use finalChartConfig AS-IS (no rebuilding!)
           ├─ Use runtimeFilters + add dimension filter
           ├─ Call chartDataOrchestrator.orchestrate()
           └─ Return chart data

3. Frontend displays N charts side-by-side
```

**NO fetching, NO rebuilding, NO complexity - just REUSE what works!**

---

## What Frontend Needs to Send

```typescript
// The COMPLETE execution context from the base chart render
interface DimensionExpansionRequest {
  // The exact config that rendered the base chart
  finalChartConfig: Record<string, unknown>;  // Has seriesConfigs, dualAxisConfig, everything!
  
  // The exact filters that rendered the base chart
  runtimeFilters: Record<string, unknown>;  // Has resolved dates, practices, everything!
  
  // What dimension to expand by
  dimensionColumn: string;
  
  // Optional limit
  limit?: number;
}
```

**That's it!** No chartDefinitionId needed, no reconstruction, just pass what works!

---

## Where Frontend Gets This Data

The base chart is rendered by BatchChartRenderer which receives:
- `chartData` (from batch API response)
- `chartDefinition` (from database)

**BUT:** Does it receive `finalChartConfig` and `runtimeFilters`?

**Checking batch API response:**

The batch API returns `ChartRenderResult`:
```typescript
{
  chartData: { labels, datasets },
  rawData: [...],
  metadata: { chartType, dataSourceId, ... }
}
```

**PROBLEM:** Batch API doesn't return `finalChartConfig` and `runtimeFilters`!

**SOLUTION:** Batch API should include them!

---

## The Complete Fix

### Backend: Batch API Should Return Config

**File:** `lib/services/dashboard-rendering/batch-executor.ts`

**Current:** Returns only chartData + metadata  
**Should:** Also return finalChartConfig + runtimeFilters

```typescript
const chartResult: ChartRenderResult = {
  chartData: orchestrationResult.chartData,
  rawData: orchestrationResult.rawData,
  metadata: { ... },
  // ADD THESE:
  finalChartConfig: config.finalChartConfig,  // ← Config used to render
  runtimeFilters: config.runtimeFilters,      // ← Filters used to render
};
```

### Frontend: Use What's Returned

**File:** `components/charts/chart-fullscreen-modal.tsx`

**Current:** Tries to reconstruct config  
**Should:** Just pass what it received

```typescript
// Props should include the configs from render
interface ChartFullscreenModalProps {
  finalChartConfig: Record<string, unknown>;  // From batch API
  runtimeFilters: Record<string, unknown>;    // From batch API
  // ... other props
}

// When expanding:
const response = await apiClient.post('/expand', {
  finalChartConfig,      // Just pass it through!
  runtimeFilters,        // Just pass it through!
  dimensionColumn: dimension.columnName,
  limit: 20,
});
```

### Backend: Use What's Provided

**File:** `lib/services/analytics/dimension-expansion-renderer.ts`

**Current:** Has optimized path + legacy path  
**Should:** Just one simple path

```typescript
async renderByDimension(request) {
  const { finalChartConfig, runtimeFilters, dimensionColumn, limit } = request;
  
  // Get dimension values
  const values = await getDimensionValues(...);
  
  // For each value, just add dimension filter and render
  const chartPromises = values.map(async (dimValue) => {
    const result = await chartDataOrchestrator.orchestrate({
      chartConfig: finalChartConfig,  // Use AS-IS!
      runtimeFilters: {
        ...runtimeFilters,  // Use AS-IS!
        advancedFilters: [
          ...(runtimeFilters.advancedFilters || []),
          { field: dimensionColumn, operator: 'eq', value: dimValue.value }
        ]
      }
    }, userContext);
    
    return result;
  });
  
  return await Promise.all(chartPromises);
}
```

**That's it!** No fetching, no rebuilding, no field name normalization - just reuse!

---

## Why This is Better

| Aspect | My Approach | Simple Approach |
|--------|-------------|-----------------|
| **Complexity** | High (reconstruction) | Low (pass-through) |
| **Bugs** | Many (field names, missing config) | None (uses what works) |
| **Performance** | 110ms | ~110ms (same) |
| **Reliability** | Broken for multi-series | Works for ALL types |
| **Maintenance** | Hard (many edge cases) | Easy (one path) |

---

## Implementation Plan

### Step 1: Update Batch API Response Type
Add finalChartConfig + runtimeFilters to response

### Step 2: Update batch-executor to Include Them
Return the configs used to render

### Step 3: Update Frontend to Receive Them
Add props to modals, pass from batch-chart-renderer

### Step 4: Update Frontend to Send Them
Just pass through what was received

### Step 5: Simplify Backend
Remove all the complex logic, just use what's provided

### Estimate: 3-4 hours

---

## This Fixes EVERYTHING

- ✅ Multi-series: multipleSeries field is already in finalChartConfig
- ✅ Dual-axis: dualAxisConfig is already in finalChartConfig
- ✅ Colors: groupBy and colorPalette already in finalChartConfig
- ✅ Filters: runtimeFilters are already resolved
- ✅ All chart types: finalChartConfig has everything needed

**One solution works for ALL chart types!**

---

**Should I implement this simple solution?**

