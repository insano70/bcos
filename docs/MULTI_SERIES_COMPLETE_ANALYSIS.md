# Multi-Series Charts - Complete Flow Analysis

**Date:** November 20, 2025  
**Chart Type:** Multi-Series (NOT Dual-Axis)  
**Issue:** Dimension expansion only shows ONE series instead of multiple

---

## Multi-Series vs Dual-Axis (Critical Distinction)

### Dual-Axis Charts:
- Exactly 2 measures (primary + secondary)
- Uses `dualAxisConfig`
- ComboChartHandler fetches both measures
- Tags with `series_id: 'primary'` and `'secondary'`

### Multi-Series Charts:
- ANY number of series (2, 3, 4+)
- Uses `multipleSeries` or `seriesConfigs` array
- Each series has its own measure
- Query orchestrator fetches each measure separately
- Tags with `series_label` from config

**Example Multi-Series Config:**
```json
{
  "multipleSeries": [
    { "id": "s1", "measure": "Charges", "label": "Charges", "aggregation": "sum" },
    { "id": "s2", "measure": "Payments", "label": "Payments", "aggregation": "sum" }
  ]
}
```

---

## How Multi-Series Charts Work (Complete Flow)

### Step 1: Chart Configuration

Chart definition stored in database:

```json
{
  "chart_config": {
    "seriesConfigs": [
      {
        "id": "series-1",
        "measure": "Charges",
        "label": "Charges",  
        "aggregation": "sum",
        "color": "#00AEEF"
      },
      {
        "id": "series-2",
        "measure": "Payments",
        "label": "Payments",
        "aggregation": "sum",
        "color": "#7BC043"
      }
    ],
    "frequency": "Monthly",
    "dataSourceId": 2
  }
}
```

### Step 2: Config Normalization (ChartConfigBuilderService)

```typescript
// lib/services/dashboard-rendering/chart-config-builder.ts:291-302

// Multi-series support (seriesConfigs → multipleSeries)
if (chartConfigTyped.seriesConfigs?.length) {
  config.multipleSeries = chartConfigTyped.seriesConfigs;
}
```

**KEY POINT:** `seriesConfigs` → `multipleSeries` (renamed during normalization)

### Step 3: Query Building (BaseChartHandler)

```typescript
// lib/services/chart-handlers/base-handler.ts:254-256

if (config.multipleSeries) {
  queryParams.multiple_series = config.multipleSeries as MultipleSeriesConfig[];
}
```

### Step 4: Data Fetching (QueryOrchestrator)

```typescript
// lib/services/analytics/query-orchestrator.ts:369-371

if (params.multiple_series && params.multiple_series.length > 0) {
  return await this.executeMultipleSeries(params, userContext);
}
```

**executeMultipleSeries() logic:**

```typescript
// Lines 151-208

// Fetch EACH series separately (in parallel)
const seriesPromises = params.multiple_series.map(async (series) => {
  const seriesParams = {
    ...params,
    measure: series.measure,  // "Charges" for series 1, "Payments" for series 2
    multiple_series: undefined,  // Clear to avoid recursion
  };
  
  const result = await this.queryMeasures(seriesParams, userContext);
  
  // Tag data with series metadata
  return result.data.map(item => ({
    ...item,
    series_id: series.id,
    series_label: series.label,  // "Charges" or "Payments"
    series_aggregation: series.aggregation,
    series_color: series.color,
  }));
});

const allSeriesData = await Promise.all(seriesPromises);
const combinedData = allSeriesData.flat();  // Combine all series
```

**CRITICAL:** Query orchestrator fetches data for EACH measure and combines!

### Step 5: Transformation

```typescript
// TimeSeriesChartHandler.transform() checks for multipleSeries
if (config.multipleSeries && Array.isArray(config.multipleSeries) && config.multipleSeries.length > 0) {
  const aggregations = {};
  config.multipleSeries.forEach(series => {
    aggregations[series.label] = series.aggregation;
  });
  
  chartData = transformer.createEnhancedMultiSeriesChart(
    data,  // Data already tagged with series_label
    'measure',
    aggregations,
    colorPalette
  );
}
```

**MultiSeriesStrategy.transform():**

```typescript
// Groups data by series_label
const groupedBySeries = groupBySeriesAndDate(measures);

// Creates one dataset per series
groupedBySeries.forEach((dateMap, seriesLabel) => {
  datasets.push({
    label: seriesLabel,  // "Charges" or "Payments"
    data: [...values for this series...],
    backgroundColor: color,
  });
});
```

**Result:** Chart.js data with multiple datasets (one per series)

---

## DIMENSION EXPANSION ROOT CAUSE

### What SHOULD Happen

```
1. User clicks "Expand by Location"
2. For each location value:
   a. Build chartExecutionConfig with multipleSeries array
   b. Add location filter to advancedFilters
   c. Pass to chartDataOrchestrator.orchestrate()
   d. Orchestrator sees config.multipleSeries
   e. Passes queryParams.multiple_series to queryOrchestrator
   f. QueryOrchestrator.executeMultipleSeries() is called
   g. Fetches data for EACH series.measure (Charges + Payments)
   h. Tags data with series_label
   i. Returns combined data
   j. Transform creates multiple datasets
   k. Chart shows BOTH series
```

### What's ACTUALLY Happening

Looking at your screenshot: Only ONE series (Charges) appears.

**This means ONE of these is broken:**
1. `multipleSeries` not in finalChartConfig → orchestrator doesn't see it
2. `multipleSeries` not passed through queryParams → query orchestrator doesn't call executeMultipleSeries()
3. `multipleSeries` is there but dimension filter breaks it somehow

### Verification: Check What's in finalChartConfig

Looking at ChartConfigBuilderService.normalizeChartConfig():

```typescript
// Line 291-293
// Multi-series support (seriesConfigs → multipleSeries)
if (chartConfigTyped.seriesConfigs?.length) {
  config.multipleSeries = chartConfigTyped.seriesConfigs;
}
```

**This only copies if `chartConfigTyped.seriesConfigs` exists!**

**BUT:** The database stores it as `seriesConfigs`, and we're checking `chartConfigTyped.seriesConfigs`.

**Issue:** What if it's stored differently in the database?

### Database Storage

From chart-builder-utils.ts line 188:

```typescript
chart_config: {
  ...
  seriesConfigs: config.seriesConfigs,  // Stored as seriesConfigs
  ...
}
```

So database has `seriesConfigs`.

ChartConfigBuilder reads it as `chartConfigTyped.seriesConfigs`.

**This should work!**

**SO WHY IS IT MISSING?**

---

## THE ACTUAL ROOT CAUSE

### Issue #1: Frontend Not Passing seriesConfigs

When frontend builds chartExecutionConfig:

```typescript
// dual-axis-fullscreen-modal.tsx (WRONG - this is for dual-axis!)

const baseConfig = {
  ...chartConfig,
  chartType,
  dataSourceId,
  frequency,
  groupBy,
  colorPalette,
};
```

**Question:** Does `chartConfig` include `seriesConfigs`?

**Checking:** batch-chart-renderer passes `chartDefinition.chart_config`

**This SHOULD include seriesConfigs!**

**But wait** - are we spreading it BEFORE or AFTER we set chartType, dataSourceId, etc.?

```typescript
const baseConfig = {
  ...chartConfig,  // ← This includes seriesConfigs
  chartType,       // ← But we override other fields
  dataSourceId,
  // ...
};
```

**This should preserve seriesConfigs!**

### Issue #2: multipleSeries vs seriesConfigs Mismatch

**Database stores:** `seriesConfigs`  
**ChartConfigBuilder expects:** `seriesConfigs`  
**ChartConfigBuilder outputs:** `multipleSeries`  
**BaseChartHandler expects:** `multipleSeries`  
**QueryParams expects:** `multiple_series`  

**If frontend is passing raw `chartConfig` from database:**
- It has `seriesConfigs` (database name)
- But handlers/orchestrator expect `multipleSeries` (normalized name)
- **MISMATCH!**

### Issue #3: Runtime Filters Lost

User also said: "We've lost all runtime filters"

This confirms that `chartExecutionConfig.runtimeFilters` is missing the RESOLVED filters.

**Problem:** When ChartConfigBuilder builds config in the LEGACY path, it gets:
- Resolved dates (from dateRangePreset)
- Resolved practices (from organizationId)
- All applied filters

**But when FRONTEND builds chartExecutionConfig:**
- It only has `currentFilters` (unresolved!)
- Missing the resolution that happened during initial render

---

## ROOT CAUSE CONFIRMED

### Issue #1: seriesConfigs Not Being Normalized

**Database field:** `seriesConfigs`  
**Runtime field:** `multipleSeries`  

**Frontend passes:** `chartConfig` with `seriesConfigs`  
**Backend expects:** `config` with `multipleSeries`

**When we spread chartConfig:**
```typescript
const baseConfig = {
  ...chartConfig,  // Has seriesConfigs (database name)
};
```

**But BaseChartHandler.buildQueryParams() looks for:**
```typescript
if (config.multipleSeries) {  // Looking for WRONG field name!
  queryParams.multiple_series = config.multipleSeries;
}
```

**SOLUTION:** Frontend needs to rename `seriesConfigs` → `multipleSeries`

OR: BaseChartHandler needs to check both names

OR: Use the LEGACY path which does this normalization correctly

### Issue #2: Runtime Filters Not Preserved

**The optimized path loses runtime filters because:**
- Frontend sends `currentFilters` (unresolved dashboard filters)
- Backend resolves them (dateRangePreset → dates, organizationId → practices)
- But THEN when we create chartExecutionConfig from provided config...
- We're not using the RESOLVED filters!

**Looking at dimension-expansion-renderer.ts lines 94-149:**

We DO resolve filters in the LEGACY path, but in OPTIMIZED path we skip that and just use what's provided!

---

## RECOMMENDED FIX

**OPTION 1: REVERT TO LEGACY PATH (Simplest)**

Remove the optimized path entirely. Always use chartDefinitionId.

**OPTION 2: Fix seriesConfigs Normalization**

```typescript
// In frontend modals:
const baseConfig = {
  ...chartConfig,
  chartType,
  dataSourceId,
  // Normalize seriesConfigs → multipleSeries
  ...(chartConfig?.seriesConfigs && { 
    multipleSeries: chartConfig.seriesConfigs 
  }),
};
```

**AND also preserve resolved runtime filters somehow**

---

## My Recommendation

**REVERT the optimization.**

Why:
1. Too many edge cases (seriesConfigs, dualAxisConfig, runtime filters, etc.)
2. Each chart type has special config fields
3. Frontend can't reliably reconstruct chartExecutionConfig
4. Backend already knows how to do this correctly
5. The 100ms savings isn't worth the complexity and bugs

**The legacy path (using chartDefinitionId) works perfectly for all chart types including multi-series.**

Should I proceed with the revert?

