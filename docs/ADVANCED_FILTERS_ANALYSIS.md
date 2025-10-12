# Advanced Filters Analysis - Complete System Trace

**Date:** 2025-10-12  
**Status:** 🔴 **BROKEN** - Advanced filters not working in refactored system  
**Severity:** HIGH - Feature completely non-functional

---

## Executive Summary

Advanced filters are configured in the Chart Builder UI and saved to the database, but are **NOT being passed through** the refactored chart rendering system. The break occurs at `analytics-chart.tsx` which doesn't accept or pass `advancedFilters` to the universal endpoint.

---

## Top-Down Flow Analysis

### ✅ Layer 1: Chart Builder UI (WORKING)

**File:** `components/charts/chart-builder-advanced.tsx`

**Lines 119-151:** Advanced filter toggle and configuration
```typescript
<input
  type="checkbox"
  checked={chartConfig.useAdvancedFiltering}
  onChange={(e) => updateConfig('useAdvancedFiltering', e.target.checked)}
/>

{chartConfig.useAdvancedFiltering && (
  <AdvancedFilterBuilder
    availableFields={...}
    onFiltersChange={handleAdvancedFiltersChange}
    initialFilters={chartConfig.advancedFilters}
  />
)}
```

**Status:** ✅ UI allows creating advanced filters  
**Output:** `chartConfig.advancedFilters: ChartFilter[]`

---

### ✅ Layer 2: Chart Definition Save (WORKING)

**File:** `components/charts/chart-builder.tsx`

**Line 485:** Saves advanced filters to data_source
```typescript
data_source: {
  table: tableReference,
  filters,
  advancedFilters: chartConfig.advancedFilters,  // ✅ Saved here
  groupBy: [...],
  orderBy: [...]
}
```

**Database:** Stored in `chart_definitions.data_source` JSONB column  
**Status:** ✅ Advanced filters saved to database correctly  
**Storage:** `data_source.advancedFilters: ChartFilter[]`

---

### ✅ Layer 3: Dashboard Extract (WORKING)

**File:** `components/charts/dashboard-view.tsx`

**Line 200:** Extracts from chart definition
```typescript
advancedFilters={dataSource.advancedFilters || []}
```

**Status:** ✅ Dashboard correctly extracts advanced filters  
**Output:** Passes to `<AnalyticsChart advancedFilters={...} />`

---

### ❌ Layer 4: AnalyticsChart Component (**BROKEN**)

**File:** `components/charts/analytics-chart.tsx`

**Current State:**
```bash
$ grep -c "advancedFilters" components/charts/analytics-chart.tsx
0  # ❌ NOT FOUND!
```

**Problem:**
1. ✅ Component receives `advancedFilters` prop (line 42 in interface)
2. ✅ Component destructures `advancedFilters` (line 97)
3. ❌ **NOT passed to `chartDataRequest` for universal endpoint!**
4. ❌ **NOT passed to table endpoint!**

**Missing in `chartDataRequest` (line 380-451):**
```typescript
// Current - MISSING advancedFilters
const chartDataRequest = useMemo(() => ({
  chartConfig: {
    chartType,
    dataSourceId,
    // ... other fields
    // ❌ advancedFilters NOT included!
  },
  runtimeFilters: {
    startDate,
    endDate,
    // ... other filters
    // ❌ advancedFilters NOT included!
  }
}), [/* dependencies */]);
```

**Missing in Table Chart (line 177-181):**
```typescript
// Current - MISSING advancedFilters
const params = new URLSearchParams();
if (startDate) params.append('start_date', startDate);
if (endDate) params.append('end_date', endDate);
// ❌ advancedFilters NOT appended!
```

**Impact:** 🔴 **CRITICAL BREAK** - Advanced filters never reach the API

---

### ❌ Layer 5: useChartData Hook (**NOT RECEIVING**)

**File:** `hooks/use-chart-data.ts`

**Current State:**
```bash
$ grep -c "advancedFilters" hooks/use-chart-data.ts
0  # ❌ NOT FOUND!
```

**Problem:** Hook doesn't expect or handle advanced filters in request interface

**Interface Definition (Lines 52-80):**
```typescript
interface UniversalChartDataRequest {
  chartDefinitionId?: string;
  chartConfig?: {
    chartType: string;
    dataSourceId: number;
    groupBy?: string;
    // ... other fields
    // ❌ advancedFilters NOT in interface!
  };
  runtimeFilters?: {
    startDate?: string;
    endDate?: string;
    // ... other filters
    // ❌ advancedFilters NOT in interface!
  };
}
```

**Impact:** Even if analytics-chart.tsx passed them, hook wouldn't accept them

---

### ❌ Layer 6: Chart Data Orchestrator (**NOT RECEIVING**)

**File:** `lib/services/chart-data-orchestrator.ts`

**Current State:**
```bash
$ grep -c "advancedFilters" lib/services/chart-data-orchestrator.ts
0  # ❌ NOT FOUND!
```

**Problem:** Orchestrator doesn't extract or pass advanced filters to handlers

---

### ✅ Layer 7: Base Handler (**READY BUT NOT RECEIVING**)

**File:** `lib/services/chart-handlers/base-handler.ts`

**Lines 173-175:** Expects advancedFilters from config
```typescript
if (config.advancedFilters) {
  queryParams.advanced_filters = config.advancedFilters as ChartFilter[];
}
```

**Status:** ✅ Handler code is ready to process advanced filters  
**Problem:** Never receives them because upstream chain is broken

---

### ✅ Layer 8: Analytics Query Builder (**READY**)

**File:** `lib/services/analytics-query-builder.ts`

**Lines 954-1037:** Complete advanced filter processing
```typescript
private processAdvancedFilters(advancedFilters: ChartFilter[]): ChartFilter[] {
  // Handles array format
  // Handles object with conditions
  // Maps operator names
  // Returns processed filters
}
```

**Status:** ✅ Query builder fully supports advanced filters  
**Problem:** Never receives them because upstream chain is broken

---

## Break Point Summary

| Layer | Component | Advanced Filters | Status |
|-------|-----------|------------------|--------|
| 1 | Chart Builder UI | ✅ Creates | WORKING |
| 2 | Save to Database | ✅ Stores | WORKING |
| 3 | Dashboard Extract | ✅ Extracts | WORKING |
| 4 | **AnalyticsChart** | **❌ NOT passing** | **BROKEN** |
| 5 | **useChartData Hook** | **❌ NOT accepting** | **BROKEN** |
| 6 | **Orchestrator** | **❌ NOT forwarding** | **BROKEN** |
| 7 | Base Handler | ✅ Ready to receive | WAITING |
| 8 | Query Builder | ✅ Ready to process | WAITING |

**Primary Break:** `analytics-chart.tsx` (Layer 4)  
**Secondary Break:** `useChartData` hook interface (Layer 5)

---

## Required Fixes

### 🔴 HIGH Priority - Fix Analytics Chart

**File:** `components/charts/analytics-chart.tsx`

**Issue 1: Not in chartDataRequest**
```typescript
// CURRENT (Line ~420 in UniversalChartComponent)
const filters: Record<string, unknown> = {};
if (startDate) filters.startDate = startDate;
if (endDate) filters.endDate = endDate;
// ❌ MISSING:
// if (advancedFilters && advancedFilters.length > 0) filters.advancedFilters = advancedFilters;
```

**Issue 2: Not in table chart params**
```typescript
// CURRENT (Line ~177 in TableChartComponent)
const params = new URLSearchParams();
if (startDate) params.append('start_date', startDate);
// ❌ MISSING:
// if (advancedFilters && advancedFilters.length > 0) {
//   params.append('advanced_filters', encodeURIComponent(JSON.stringify(advancedFilters)));
// }
```

---

### 🔴 HIGH Priority - Fix useChartData Hook Interface

**File:** `hooks/use-chart-data.ts`

**Issue:** Interface doesn't include advancedFilters

**Required Change (Lines 69-79):**
```typescript
// ADD to runtimeFilters interface:
runtimeFilters?: {
  startDate?: string;
  endDate?: string;
  dateRangePreset?: string;
  practice?: string;
  practiceUid?: string;
  providerName?: string;
  measure?: string;
  frequency?: string;
  advancedFilters?: ChartFilter[];  // ← ADD THIS
  calculatedField?: string;         // ← ADD THIS
};
```

---

### 🟡 MEDIUM Priority - Verify Downstream

**Files to verify still work:**
- `lib/services/chart-data-orchestrator.ts` - Should pass config through unchanged
- `lib/services/chart-handlers/base-handler.ts` - Already handles advancedFilters ✅
- `lib/services/analytics-query-builder.ts` - Already processes advancedFilters ✅

---

## Testing Requirements

**After fixes, test:**
1. ✅ Create chart with advanced filters in UI
2. ✅ Save chart definition
3. ✅ View chart on dashboard
4. ✅ Verify SQL includes WHERE clauses from advanced filters
5. ✅ Verify chart data is filtered correctly
6. ✅ Test all chart types (table, bar, line, dual-axis, etc.)

---

## Impact Assessment

**Current State:**
- ❌ Advanced filters configured in UI but ignored
- ❌ All chart types affected (table, universal endpoint charts)
- ❌ No filtering applied beyond basic date/practice/provider
- ❌ Users cannot create filtered views

**Risk:** HIGH - Feature advertised but non-functional

**Effort to Fix:** ~30 minutes
1. Add advancedFilters to analytics-chart.tsx chartDataRequest (10 min)
2. Add advancedFilters to table chart params (5 min)
3. Update useChartData interface (5 min)
4. Test all chart types (10 min)

---

## Recommendation

**Fix immediately before production deployment.**

Advanced filtering is a core feature. Users will expect it to work if it's available in the UI. Current state is misleading - filters can be configured but have zero effect.

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-12  
**Status:** Analysis Complete - Ready for Implementation

