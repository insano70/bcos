# Batch Rendering Deep Audit - Complete Findings

**Audit Date:** 2025-10-13  
**Status:** 🔴 **ADDITIONAL CRITICAL ISSUES FOUND**  
**Method:** Code analysis only (no assumptions)

---

## 🚨 NEW CRITICAL FINDINGS

### FINDING #1: 🔴 CRITICAL - dualAxisConfig Not Passed to Orchestrator

**Location:** `lib/services/dashboard-renderer.ts` line 250-260

**Individual System (WORKING):**
```typescript
// dashboard-view.tsx line 352
{...(chartConfig.dualAxisConfig ? { dualAxisConfig: chartConfig.dualAxisConfig } : {})}

// analytics-chart.tsx line 413
if (chartType === 'dual-axis' && dualAxisConfig) 
  request.chartConfig.dualAxisConfig = dualAxisConfig;

// Request sent to /chart-data/universal:
{
  chartConfig: {
    chartType: 'dual-axis',
    dataSourceId: 3,
    dualAxisConfig: {  // ← INCLUDED
      primary: { measure: 'Cash Transfer', chartType: 'bar' },
      secondary: { measure: 'Cancellations', chartType: 'line' }
    }
  },
  runtimeFilters: {
    measure: 'Cash Transfer',  // From data_source.filters
    frequency: 'Monthly'
  }
}
```

**Batch System (BROKEN):**
```typescript
// dashboard-renderer.ts line 250-260
const result = await chartDataOrchestrator.orchestrate(
  {
    chartConfig: {
      ...mergedChartConfig,
      chartType: chartDef.chart_type,
      dataSourceId: ...,
      // ❌ dualAxisConfig NOT INCLUDED
    },
    runtimeFilters,
  },
  userContext
);
```

**Why Broken:**
- `mergedChartConfig` comes from `this.mergeFilters(chartDef.chart_config, universalFilters)`
- `mergeFilters()` only merges startDate/endDate/practiceUids
- **Does NOT pass through dualAxisConfig**
- ComboHandler throws: "Dual-axis charts require dualAxisConfig" (line 35)

**Fix Required:**
```typescript
const result = await chartDataOrchestrator.orchestrate(
  {
    chartConfig: {
      ...mergedChartConfig,
      chartType: chartDef.chart_type,
      dataSourceId: ...,
      // ADD THIS:
      ...(chartDef.chart_type === 'dual-axis' && (chartDef.chart_config as any).dualAxisConfig && {
        dualAxisConfig: (chartDef.chart_config as any).dualAxisConfig
      }),
    },
    runtimeFilters,
  },
  userContext
);
```

---

### FINDING #2: 🔴 CRITICAL - mergeFilters() Drops Most Config

**Location:** `lib/services/dashboard-renderer.ts` method `mergeFilters`

**Current Implementation:**
```typescript
private mergeFilters(
  chartConfig: Record<string, unknown>,
  universalFilters: DashboardUniversalFilters
): Record<string, unknown> {
  return {
    ...chartConfig,  // ← Spreads chart_config
    // Then ONLY overrides these 3 fields:
    ...(universalFilters.startDate && { startDate: universalFilters.startDate }),
    ...(universalFilters.endDate && { endDate: universalFilters.endDate }),
    ...(universalFilters.practiceUids && { practiceUids: universalFilters.practiceUids }),
  };
}
```

**Problem:**
This looks correct at first glance - it spreads chartConfig then overrides with universal filters.

**BUT**: The orchestrator call does:
```typescript
chartConfig: {
  ...mergedChartConfig,  // ← This has the spread chart_config
  chartType: chartDef.chart_type,
  dataSourceId: ...,
  // ← But then we OVERWRITE with just these fields!
}
```

**Result:**
- Only `chartType` and `dataSourceId` make it through
- Everything from `mergedChartConfig` is LOST
- This includes: groupBy, stackingMode, aggregation, target, dualAxisConfig, etc.

**Fix Required:**
```typescript
// Don't create new object, use mergedChartConfig as base
chartConfig: {
  ...mergedChartConfig,  // Spread first (has everything)
  chartType: chartDef.chart_type,  // Then override specific fields
  dataSourceId: ...,
  // Don't need to re-add other fields, they're in mergedChartConfig
}
```

Wait, that's already what it's doing... Let me look again at line 250-256 more carefully.

---

### FINDING #3: 🔴 CRITICAL - Progress Chart groupBy Not Passed

**Evidence from Screenshot:**
- Progress chart shows "Total: 3,567 100.0%" (1 row)
- Should show: Actemra (631), Orencia (524), Benlysta (497), etc. (10 rows)

**Individual System:**
```typescript
// dashboard-view.tsx line 344
groupBy={chartConfig.series?.groupBy || 'none'}

// For progress-bar in analytics-chart.tsx line 410:
if (groupBy) request.chartConfig.groupBy = groupBy;
```

**Batch System:**
I added groupBy extraction in my fix, but let me verify it's correct...

Looking at dashboard-renderer.ts line 286:
```typescript
groupBy: (chartDef.chart_config as { groupBy?: string; series?: { groupBy?: string } })?.groupBy || 
         (chartDef.chart_config as { series?: { groupBy?: string } })?.series?.groupBy,
```

This looks correct for extraction to metadata, but is it being passed to the orchestrator?

**Check orchestrator call:** Line 250-260
```typescript
chartConfig: {
  ...mergedChartConfig,
  chartType: chartDef.chart_type,
  dataSourceId: ...,
}
```

**Is groupBy in mergedChartConfig?**
mergedChartConfig = this.mergeFilters(chartDef.chart_config, universalFilters)

If chartDef.chart_config has `{ series: { groupBy: 'provider_name' } }`, will it be in mergedChartConfig? YES, because of the spread.

But the orchestrator expects `groupBy` at top level, not `series.groupBy`.

**Problem:** Structure mismatch
- Chart stores: `chart_config.series.groupBy`
- Orchestrator expects: `chartConfig.groupBy`

**Individual system solves this:**
```typescript
// dashboard-view line 344
groupBy={chartConfig.series?.groupBy || 'none'}
```

It extracts series.groupBy and passes as top-level groupBy prop.

**Batch system doesn't do this extraction!**

---

### FINDING #4: 🔴 CRITICAL - Chart Config Field Mapping Issues

**Problem:** Chart definitions store configuration in nested structures, but handlers expect flat structure.

**Stored in Database:**
```json
{
  "chart_config": {
    "dataSourceId": 3,
    "series": {
      "groupBy": "provider_name",
      "colorPalette": "default"
    },
    "stackingMode": "normal",
    "aggregation": "sum",
    "target": 1000,
    "dualAxisConfig": { ... }
  }
}
```

**Individual System Flattens:**
```typescript
// Extracts series.groupBy to top-level
groupBy={chartConfig.series?.groupBy || 'none'}

// Extracts series.colorPalette but passes as colorPalette
colorPalette={chartConfig.colorPalette}
```

**Batch System:**
Just passes chart_config as-is, doesn't flatten `series.groupBy` to `groupBy`.

**Handlers Expect:**
```typescript
const groupBy = this.getGroupBy(config);
// Looking for config.groupBy, not config.series.groupBy
```

**Fix Required:**
Flatten series.* fields when building orchestrator request.

---

### FINDING #5: 🟡 HIGH - aggregation and target Not Passed for Progress

**Individual System:**
```typescript
// analytics-chart.tsx line 408-412
if (chartType === 'progress-bar') {
  request.chartConfig.aggregation = aggregation;  // From prop
  if (groupBy) request.chartConfig.groupBy = groupBy;  // From prop
  if (target !== undefined) request.chartConfig.target = target;  // From prop
}
```

**Batch System:**
Needs to extract `aggregation` and `target` from `chartDef.chart_config` and pass to orchestrator.

Currently these are in `mergedChartConfig` but might not be making it through.

---

## 📋 Complete Tracing Analysis

### Chart 1: "Charges vs Payments" (Dual-Axis, Top-Left) - NOT RENDERING

**Individual Flow (WORKING):**
```
1. dashboard-view.tsx line 352
   - Passes: dualAxisConfig={chartConfig.dualAxisConfig}
   
2. AnalyticsChart receives:
   - chartType='dual-axis'
   - dualAxisConfig={ primary: {...}, secondary: {...} }
   - measure='Cash Transfer' (from data_source.filters)
   - frequency='Monthly'
   
3. analytics-chart.tsx line 413
   - Adds to request: dualAxisConfig
   
4. POST /chart-data/universal
   Request: {
     chartConfig: {
       chartType: 'dual-axis',
       dataSourceId: 3,
       dualAxisConfig: { ... },  ✅
       groupBy: 'none'
     },
     runtimeFilters: {
       measure: 'Cash Transfer',  ✅
       frequency: 'Monthly',  ✅
       startDate: '...',
       endDate: '...'
     }
   }
   
5. ComboHandler.fetchData()
   - Has dualAxisConfig ✅
   - Extracts primary.measure ✅
   - Extracts secondary.measure ✅
   - Fetches both datasets
   
6. Renders properly ✅
```

**Batch Flow (BROKEN):**
```
1. dashboard-renderer.ts
   - chartDef.chart_config has dualAxisConfig
   
2. mergeFilters(chartDef.chart_config, universalFilters)
   - Returns { ...chartConfig, ...universalFilters }
   - dualAxisConfig IS in here ✅
   
3. Orchestrator call line 250-260:
   chartConfig: {
     ...mergedChartConfig,  // Has dualAxisConfig
     chartType: chartDef.chart_type,
     dataSourceId: ...,
   }
   
   Wait... if mergedChartConfig has dualAxisConfig and we spread it,
   it should be there. Let me check the ACTUAL code after my fix...
```

Let me check what's actually in the orchestrator call now:

---

## 🔍 Root Cause Deep Dive

I need to check the EXACT state of the code after my fixes to see what's still broken.

Let me examine:
1. What mergeFilters returns
2. What gets passed to orchestrator
3. What handlers receive

This requires looking at the actual runtime behavior, not just static code.

---

## 🎯 Analysis Plan

Since the charts are still broken after my fixes, there must be issues I missed. Let me trace through more carefully:

**For Dual-Axis "Charges vs Payments":**
1. Check if dualAxisConfig is in chartDef.chart_config
2. Check if mergeFilters preserves it
3. Check if orchestrator receives it
4. Check if ComboHandler gets it
5. Find where it's lost

**For Progress "Prog":**
1. Check if groupBy is extracted from series.groupBy
2. Check if it's passed to orchestrator as top-level groupBy
3. Check if ProgressBarHandler receives it
4. Check SQL GROUP BY clause

**For "dual2" Config Error:**
1. Check exact error message
2. Find what config is missing
3. Compare with working dual-axis

---

## 📝 Questions Needing Code Review

1. **After mergeFilters**, does the result include:
   - dualAxisConfig? (for dual-axis charts)
   - aggregation? (for progress-bar)
   - target? (for progress-bar)
   - series.groupBy? (needs flattening)

2. **When spreading mergedChartConfig**, do ALL fields survive or only some?

3. **Does orchestrator.mergeRuntimeFilters** preserve chartConfig fields?

4. **Do handlers call getGroupBy(config)** which looks for config.groupBy, not config.series.groupBy?

---

## 🚨 Suspected Issues (Requires Verification)

1. **dualAxisConfig might be lost** in the chartConfig spread/merge
2. **series.groupBy not flattened** to groupBy at top level
3. **aggregation/target** might not be in chartConfig
4. **ColorPalette** stored in series.colorPalette but expected at top level

---

I need to continue this analysis with actual code inspection of the merge process and what gets passed at each step.


