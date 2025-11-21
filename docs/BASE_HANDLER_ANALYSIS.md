# BaseChartHandler.buildQueryParams() Analysis

**Current State:** 100 lines of manual filter building  
**Comment Says:** "Uses FilterBuilderService"  
**Reality:** Doesn't use FilterBuilderService at all!

---

## Current Implementation Breakdown

### Lines 164-174: Extract UniversalChartFilters (11 lines)
```typescript
const universalFilters: UniversalChartFilters = {};
if (typeof config.startDate === 'string') universalFilters.startDate = config.startDate;
if (typeof config.endDate === 'string') universalFilters.endDate = config.endDate;
// ... 8 more if statements
```

### Lines 177-181: Resolve Date Range (5 lines)
```typescript
const { startDate, endDate } = getDateRange(
  universalFilters.dateRangePreset,
  universalFilters.startDate,
  universalFilters.endDate
);
```

### Lines 183-214: Build Query Params (32 lines)
```typescript
const queryParams: AnalyticsQueryParams = {
  data_source_id: config.dataSourceId as number,
  start_date: startDate,
  end_date: endDate,
  limit: ...
};
// Add optional params (measure, frequency, practice, practiceUid, providerName)
```

### Lines 216-248: Handle practiceUids Security (33 lines)
```typescript
if (universalFilters.practiceUids && Array.isArray(universalFilters.practiceUids)) {
  if (universalFilters.practiceUids.length === 0) {
    // FAIL-CLOSED SECURITY
    queryParams.advanced_filters = [{ field: 'practice_uid', operator: 'in', value: [-1] }];
  } else {
    queryParams.advanced_filters = [{ field: 'practice_uid', operator: 'in', value: practiceUids }];
  }
}
```

### Lines 250-259: Special Chart Types (10 lines)
```typescript
if (config.calculatedField) queryParams.calculated_field = ...;
if (config.multipleSeries) queryParams.multiple_series = ...;
if (config.periodComparison) queryParams.period_comparison = ...;
```

---

## FilterBuilderService Comparison

FilterBuilderService has similar logic but:
- **Requires async** for organization resolution
- **Expects ChartExecutionFilters** (not raw config)
- **Has buildQueryParams()** that does lines 183-248

But wait - the config coming in has already been through ChartConfigBuilderService, so:
- ✅ Dates are already resolved (no dateRangePreset)
- ✅ Practices are already resolved (no organizationId)
- ✅ It's ready to build query params

So we DON'T need async resolution, we just need to build query params!

---

## Can FilterBuilderService Replace This?

**NO - Not directly.**

FilterBuilderService.buildQueryParams() expects:
1. ChartExecutionFilters (not config)
2. ChartConfig with dataSourceId
3. FilterBuilderOptions

But buildQueryParams in BaseChartHandler receives:
- Just config: Record<string, unknown>

We'd need to:
1. Create ChartExecutionFilters from config
2. Call FilterBuilderService.buildQueryParams()
3. Add special chart type params

**This adds complexity, not reduces it!**

---

## Better Approach: Use FilterPipeline.quickConvert()

FilterPipeline has `quickConvert()` which:
- Takes any filter input
- Returns chartFilters + runtimeFilters
- No async needed
- Simple conversion

But it still doesn't build AnalyticsQueryParams directly.

---

## ANALYSIS RESULT

**FilterBuilderService CANNOT directly replace BaseChartHandler.buildQueryParams()**

Why:
1. Different input types (config vs ChartExecutionFilters)
2. Different flow (already resolved vs needs resolution)
3. Special chart type params need to be added anyway

**The comment is misleading but fixing it requires:**
- Keeping most of the logic
- OR: Changing the entire flow
- OR: Creating an adapter

**RECOMMENDATION:** The current code actually works correctly. The comment is wrong, but the code is fine.

**FIX OPTIONS:**
1. **Just fix the comment** (30 seconds) - Remove misleading statement
2. **Create adapter** (4 hours) - Make it actually use FilterBuilderService
3. **Leave as-is** (0 hours) - Code works, just has wrong comment

**I recommend Option 1: Just fix the comment.**

