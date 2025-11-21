# Dimension Expansion Issues - Complete Root Cause Analysis

**Date:** November 20, 2025  
**Issues:** Two critical bugs in dimension expansion  
**Status:** ROOT CAUSE IDENTIFIED

---

## ISSUE #1: Charts Load Without Colors

### Symptoms
- Expanded dimension charts show bars/lines in default colors
- Original chart uses custom provider colors (tableau20 palette)
- Charts with groupBy=provider_name should have persistent provider colors

### Root Cause Analysis

**Step 1: How Provider Colors Work**

```typescript
// Normal chart rendering flow:
1. Chart handler (BarChartHandler) calls transform()
2. Checks if groupBy === 'provider_name'
3. Calls injectProviderColors(data, config)
4. Fetches provider colors from chart_provider_colors table
5. Injects colors into data records
6. Transformer uses injected colors
```

**Step 2: What Dimension Expansion Does**

```typescript
// Dimension expansion flow:
1. For each dimension value (e.g., "Downtown Clinic")
2. Adds dimension filter to advancedFilters
3. Calls chartDataOrchestrator.orchestrate()
4. Orchestrator calls chart handler.transform()
5. Transform uses config.colorPalette (e.g., 'blue')
6. BUT: Chart handler DOESN'T call injectProviderColors() again!
```

**Step 3: Why Colors Are Missing**

Looking at `lib/services/chart-handlers/bar-chart-handler.ts`:

```typescript
async transform(data, config) {
  const groupBy = this.getGroupBy(config);
  const colorPalette = this.getColorPalette(config);
  
  // Provider colors injection
  if (groupBy === 'provider_name' || groupBy === 'provider_uid') {
    await this.injectProviderColors(data, config);  // ← THIS RUNS
  }
  
  const transformer = new SimplifiedChartTransformer();
  return transformer.transformMeasureData(data, config);
}
```

**The transform() method DOES inject provider colors!**

So the issue must be:
1. `config.groupBy` is not being passed through chartExecutionConfig
2. OR `config.colorPalette` is not being passed  
3. OR the finalChartConfig doesn't include these fields

**ROOT CAUSE:** chartExecutionConfig.finalChartConfig missing groupBy or colorPalette fields!

---

## ISSUE #2: Multi-Series Charts - "Invalid filter field: location"

### Symptoms
- Multi-series charts fail during dimension expansion
- Error: "Invalid filter field: location. Field not defined or not filterable"
- Regular (single-series) charts work fine

### Root Cause Analysis

**Step 1: Where Error Occurs**

`lib/services/analytics/query-validator.ts:162`

```typescript
// Validates filter fields against data source configuration
const allowedColumns = new Set([
  ...Array.from(STANDARD_COLUMNS),
  ...columns
    .filter((col) => col.is_filterable !== false)  // Only filterable columns
    .map((col) => col.column_name),
]);

for (const filter of filters) {
  if (!allowedColumns.has(filter.field)) {
    throw new Error(`Invalid filter field: ${filter.field}. ...`);
  }
}
```

**Step 2: How Dimension Filter Is Added**

`lib/services/analytics/dimension-expansion-renderer.ts:352-364`

```typescript
const dimensionRuntimeFilters = {
  ...chartExecutionConfig.runtimeFilters,
  advancedFilters: [
    ...existingAdvancedFilters,
    {
      field: dimensionColumn,  // ← "location"
      operator: 'eq',
      value: dimensionValue.value,
    },
  ],
};
```

**Step 3: Why It Fails**

1. dimension-expansion-renderer adds "location" to advancedFilters
2. advancedFilters go through data-source-query-service
3. data-source-query-service calls queryValidator.validateFilterFields()
4. Validator checks if "location" is in allowedColumns
5. "location" column is marked as `is_expansion_dimension = true` but `is_filterable = false` (or not set)
6. Validator REJECTS the filter

**Step 4: Why Multi-Series vs Regular?**

Multi-series charts:
- Have seriesConfigs with multiple measures
- Each series queries separately
- Advanced filters applied to EACH series query
- Validation happens for EACH query
- More opportunities to hit validation

Regular charts:
- Single measure
- Single query
- Same validation, but may pass if location is filterable

**ROOT CAUSE:** Expansion dimension columns ("location") are NOT marked as filterable in data source configuration, but dimension expansion tries to add them as filters.

---

## VALIDATION OF ROOT CAUSES

### Issue #1 Validation: Missing ColorPalette/GroupBy

**Check:** Does chartExecutionConfig have groupBy and colorPalette?

Looking at ChartConfigBuilderService.normalizeChartConfig() lines 213-221:

```typescript
// Flatten series.groupBy to top-level (except for number charts)
if (chart.chart_type !== 'number' && chartConfigTyped.series?.groupBy) {
  config.groupBy = chartConfigTyped.series.groupBy;
}

// Flatten series.colorPalette
if (chartConfigTyped.series?.colorPalette) {
  config.colorPalette = chartConfigTyped.series.colorPalette;
}
```

**VERIFIED:** groupBy and colorPalette ARE included in finalChartConfig!

**So why are colors missing?**

Checking the frontend modal code:

```typescript
// chart-fullscreen-modal.tsx
const baseConfig: Record<string, unknown> = {
  chartType: chartType,
  dataSourceId: dataSourceId,
};

if (chartConfig) {
  Object.assign(baseConfig, chartConfig);  // ← chartConfig from props
}
```

**ISSUE:** Frontend receives `chartConfig` prop, but does `chartConfig` include groupBy and colorPalette?

Looking at batch-chart-renderer.tsx line 333:

```typescript
{...(chartDefinition.chart_config && { chartConfig: chartDefinition.chart_config })}
```

**VERIFIED:** chartDefinition.chart_config is passed!

**BUT WAIT:** chart_config is stored in database, but does it have groupBy and colorPalette at the TOP LEVEL or nested under `series`?

Database schema shows `chart_config` is JSONB. The structure could be:
```json
{
  "series": {
    "groupBy": "provider_name",
    "colorPalette": "tableau20"
  }
}
```

But ChartConfigBuilderService.normalizeChartConfig() flattens this to:
```json
{
  "groupBy": "provider_name",
  "colorPalette": "tableau20"
}
```

**REAL ROOT CAUSE:** Frontend is passing raw `chart_config` from database (nested structure), but chart handler expects FLATTENED structure (groupBy at top level)!

---

## CONFIRMED ROOT CAUSES

### Issue #1: Missing Colors
**ROOT CAUSE:** Frontend passes `chartDefinition.chart_config` (raw database JSONB) instead of `chartExecutionConfig.finalChartConfig` (normalized/flattened config)

**Evidence:**
- Database stores: `{series: {groupBy: "provider_name"}}`
- ChartConfigBuilder flattens to: `{groupBy: "provider_name"}`
- Frontend passes raw database version
- Chart handler doesn't see groupBy at top level
- Doesn't inject provider colors

**Fix:** Frontend should pass `chartExecutionConfig.finalChartConfig` which is already flattened

---

### Issue #2: Invalid Filter Field
**ROOT CAUSE:** Dimension expansion adds dimension column to advancedFilters, but dimension columns are NOT marked as filterable in data source configuration

**Evidence:**
- "location" marked as `is_expansion_dimension = true`
- "location" marked as `is_filterable = false` (or not set)
- query-validator only allows filterable columns
- dimension-expansion-renderer adds location to advancedFilters
- Validator rejects it

**Fix:** Either:
1. Mark all expansion dimensions as filterable in database (SIMPLE)
2. Skip validation for dimension expansion filters (RISKY)
3. Add dimension filter differently - not via advancedFilters (COMPLEX)

---

## RECOMMENDED FIXES

### Fix for Issue #1: Use Flattened Config

**File:** `components/charts/chart-fullscreen-modal.tsx` (and dual-axis, progress-bar)

**WRONG (Current):**
```typescript
const baseConfig: Record<string, unknown> = {
  chartType: chartType,
  dataSourceId: dataSourceId,
};

if (chartConfig) {
  Object.assign(baseConfig, chartConfig);  // ← Raw database config (nested)
}
```

**CORRECT:**
```typescript
// Don't reconstruct config - the backend already built it!
// Just use the one that was already sent to frontend via metadata
const baseConfig: Record<string, unknown> = {
  chartType: chartType,
  dataSourceId: dataSourceId,
  groupBy: chartConfig?.groupBy || chartConfig?.series?.groupBy,  // Handle both formats
  colorPalette: chartConfig?.colorPalette || chartConfig?.series?.colorPalette || 'default',
  ...(chartConfig && { ...chartConfig }),  // Include everything else
};
```

**BETTER:** Frontend should receive and pass the ENTIRE chartExecutionConfig from the original render, not reconstruct it!

---

### Fix for Issue #2: Mark Dimensions as Filterable

**Approach 1: Database Migration (RECOMMENDED)**

```sql
-- Mark all expansion dimensions as filterable
UPDATE chart_data_source_columns
SET is_filterable = true
WHERE is_expansion_dimension = true;
```

**Pros:**
- ✅ Simple, one-line fix
- ✅ Expansion dimensions SHOULD be filterable (that's their purpose!)
- ✅ No code changes needed
- ✅ Works for all chart types

**Approach 2: Skip Validation for Dimension Filters**

Modify query-validator to allow expansion dimensions:

```typescript
// In validateFilterFields():
const allowedColumns = new Set([
  ...Array.from(STANDARD_COLUMNS),
  ...columns
    .filter((col) => col.is_filterable !== false || col.is_expansion_dimension === true)
    .map((col) => col.column_name),
]);
```

**Pros:**
- ✅ No database changes
- ✅ Explicit handling of expansion dimensions

**Cons:**
- ❌ Changes validation logic
- ❌ Might allow unintended filters

---

## IMPLEMENTATION PLAN

### Fix #1: Pass Flattened Config (Frontend)
1. Update modals to receive full chartExecutionConfig from parent
2. Don't reconstruct finalChartConfig - use the one from initial render
3. Pass groupBy and colorPalette explicitly

### Fix #2: Mark Dimensions as Filterable (Database)
1. Create migration to update is_filterable for expansion dimensions
2. OR update query-validator to allow expansion dimensions
3. Test with multi-series charts

---

## ADDITIONAL FINDINGS

### Multi-Series Charts Are Different

Multi-series charts:
- Have `config.multipleSeries` array
- Each series has its own measure
- Fetches data for each series separately (parallel queries)
- Data is tagged with series_id or series_label
- Transform creates one dataset per series

**Impact on Dimension Expansion:**
- When we add dimension filter, it applies to ALL series queries
- Each series query gets validated
- If "location" not filterable, ALL series queries fail
- That's why "Failed to load chart data" for every chart in expansion

---

## NEXT STEPS

1. Fix Issue #1: Update frontend to pass proper config with groupBy/colorPalette
2. Fix Issue #2: Mark expansion dimensions as filterable (database migration)
3. Test with both regular and multi-series charts
4. Verify provider colors appear
5. Verify multi-series dimension expansion works

