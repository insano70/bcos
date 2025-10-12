# Phase 4.4 Refactoring Plan: AnalyticsChart Component

**Status:** Ready for Implementation  
**Created:** 2025-10-12  
**Goal:** Reduce analytics-chart.tsx from 879 lines to <200 lines  
**Blocker Resolved:** ✅ All 11 chart types now using universal endpoint

---

## Executive Summary

With Phase 5 complete (all chart types migrated to universal endpoint), we can now complete Phase 4.4 - the AnalyticsChart refactoring. All required infrastructure components have been created in Phase 4.1-4.3:

✅ **Phase 4.1:** `hooks/use-chart-data.ts` - Unified data fetching (210 lines)  
✅ **Phase 4.2:** `components/charts/chart-renderer.tsx` - Dynamic dispatch (160 lines)  
✅ **Phase 4.3:** `components/charts/chart-header.tsx` - Reusable header (182 lines)  
✅ **Phase 4.3:** `components/charts/chart-error.tsx` - Error display (136 lines)  

**Current State:** 879 lines with complex conditional logic  
**Target State:** <200 lines (thin orchestrator)  
**Expected Reduction:** 77% complexity reduction

---

## Current File Analysis

### File Structure Breakdown

**Total Lines:** 879  
**Location:** `components/charts/analytics-chart.tsx`

| Section | Lines | Can Extract? | Replacement |
|---------|-------|--------------|-------------|
| **Imports** | 1-33 | ⚠️ Partial | Most imports move to ChartRenderer |
| **Interface Definitions** | 35-78 | ⚠️ Partial | Keep AnalyticsChartProps |
| **Component State** | 112-148 | ❌ Keep | State management stays |
| **Data Fetching Logic** | 151-508 | ✅ YES | Replace with useChartData hook |
| **Export Logic** | 515-540 | ⚠️ Maybe | Could extract to useChartExport hook |
| **Error Rendering** | 543-568 | ✅ YES | Replace with ChartError component |
| **No Data Rendering** | 571-590 | ✅ YES | Extract to ChartEmptyState component |
| **Chart Switch** | 593-679 | ✅ YES | Replace with ChartRenderer component |
| **Loading Skeleton** | 706-712 | ✅ Already using | Keep as is |
| **Header UI** | 716-808 | ✅ YES | Replace with ChartHeader component |
| **Chart Content** | 810-813 | ❌ Keep | Container for ChartRenderer |
| **Fullscreen Modals** | 815-838 | ⚠️ Maybe | Keep for now (chart-specific) |
| **Presets** | 843-879 | ❌ Keep | Useful component presets |

**Extractable:** ~500 lines (57%)  
**Must Keep:** ~150 lines (17%)  
**Optional:** ~230 lines (26%)

---

## Problem Analysis

### 1. Data Fetching Complexity (Lines 151-508) - 357 LINES

**Current Issues:**
- ❌ Three completely different fetch patterns (table, universal, legacy)
- ❌ Manual state management (setChartData, setRawData, setMetadata)
- ❌ Duplicate error handling logic
- ❌ Complex parameter building logic
- ❌ Response format inconsistencies

**Problems:**
```typescript
if (chartType === 'table') {
  // Pattern 1: Direct data source query (88 lines)
  const tableData = await apiClient.get(`/api/admin/data-sources/${dataSourceId}/query...`);
  setRawData(tableData.data);
  setDataSourceColumns(...);
}
else if (chartType === 'number' || chartType === 'progress-bar' || chartType === 'dual-axis') {
  // Pattern 2: Universal endpoint (128 lines)
  const requestPayload = { chartConfig: {...}, runtimeFilters: {...} };
  const response = await apiClient.post('/api/admin/analytics/chart-data/universal', requestPayload);
  setChartData(response.chartData);
}
else {
  // Pattern 3: Also universal endpoint now (91 lines)
  const requestPayload = { chartConfig: {...}, runtimeFilters: {...} };
  const response = await apiClient.post('/api/admin/analytics/chart-data/universal', requestPayload);
  setChartData(response.chartData);
}
```

**Why This is Bad:**
- Patterns 2 and 3 are now identical (duplicate code)
- Complex conditional branching
- Hard to test
- Hard to maintain

**Solution:** Replace with `useChartData` hook

---

### 2. Chart Rendering Complexity (Lines 593-679) - 87 LINES

**Current Issues:**
- ❌ Large switch statement with 9 cases
- ❌ Chart-specific prop extraction logic
- ❌ Duplicate error fallback
- ❌ Hard to extend with new chart types

**Current Code:**
```typescript
const renderChartComponent = () => {
  switch (chartType) {
    case 'line':
      return <LineChart01 ref={chartRef} data={chartData} width={width} height={height} />;
    case 'bar':
      return <AnalyticsBarChart ref={chartRef} data={chartData} ... />;
    case 'stacked-bar':
      return <AnalyticsStackedBarChart ref={chartRef} data={chartData} ... />;
    // ... 6 more cases
    case 'progress-bar':
      // 19 lines of custom logic
      const dataset = chartData.datasets[0];
      const rawValues = (dataset as any)?.rawValues;
      const progressData = chartData.labels.map(...);
      return <AnalyticsProgressBarChart data={progressData} ... />;
    default:
      return <div>Unsupported chart type: {chartType}</div>;
  }
};
```

**Solution:** Replace with `<ChartRenderer>` component

---

### 3. Header Duplication (Lines 716-808) - 93 LINES

**Current Issues:**
- ❌ Complex dropdown menu logic
- ❌ SVG icons inline
- ❌ Duplicate styling across all charts
- ❌ Hard to maintain consistency

**Current Code:**
```typescript
<header className="px-4 py-2 border-b ...">
  <h2>{title || `${measure} - ${frequency}`}</h2>
  <div className="flex items-center gap-1">
    {/* Export dropdown - 35 lines */}
    <div className="relative group">
      <button>...</button>
      <div className="absolute ...">
        <button onClick={() => handleExport('png')}>Export PNG</button>
        <button onClick={() => handleExport('pdf')}>Export PDF</button>
        <button onClick={() => handleExport('csv')}>Export Data</button>
      </div>
    </div>
    {/* Fullscreen buttons - 25 lines */}
    {/* Refresh button - 15 lines */}
  </div>
</header>
```

**Solution:** Replace with `<ChartHeader>` component

---

### 4. Error State Duplication (Lines 543-568) - 26 LINES

**Current Issues:**
- ❌ Manual error UI construction
- ❌ Duplicate responsive logic
- ❌ Inline retry button styling

**Current Code:**
```typescript
if (error) {
  const errorContainer = (
    <div className="flex flex-col items-center justify-center">
      <div className="text-red-500 mb-2">⚠️ Chart Error</div>
      <div className="text-sm text-gray-600 dark:text-gray-400 text-center px-4">
        {error}
      </div>
      <button onClick={fetchChartData} className="mt-3 px-4 py-2 ...">
        Retry
      </button>
    </div>
  );
  return responsive ? <div style={{ minHeight }}>{errorContainer}</div> : ...;
}
```

**Solution:** Replace with `<ChartError>` component

---

## Proposed Architecture

### Before (879 Lines)

```typescript
export default function AnalyticsChart(props) {
  // ❌ Manual state management (35 lines)
  const [chartData, setChartData] = useState(...);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // ... 5 more state variables
  
  // ❌ Complex data fetching (357 lines)
  const fetchChartData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Build params (50 lines)
      // Three different fetch patterns (257 lines)
      // Response handling (50 lines)
    } catch (err) { ... }
  }, [/* 15 dependencies */]);
  
  // ❌ Export logic (26 lines)
  const handleExport = async (format) => { ... };
  
  // ❌ Manual error rendering (26 lines)
  if (error) { return <div>...</div>; }
  
  // ❌ Manual no-data rendering (20 lines)
  if (chartData.datasets.length === 0) { return <div>...</div>; }
  
  // ❌ Large switch for chart types (87 lines)
  const renderChartComponent = () => {
    switch (chartType) {
      case 'line': return <LineChart01 ... />;
      // ... 8 more cases
    }
  };
  
  // ❌ Manual header UI (93 lines)
  return (
    <GlassCard>
      <header>
        <h2>{title}</h2>
        <div>{/* Export, refresh, fullscreen buttons */}</div>
      </header>
      <div>{renderChart()}</div>
      {/* Fullscreen modals */}
    </GlassCard>
  );
}
```

---

### After (<200 Lines)

```typescript
export default function AnalyticsChart(props: AnalyticsChartProps) {
  // ✅ Single hook replaces 357 lines of fetch logic
  const { data, isLoading, error, refetch } = useChartData({
    chartConfig: {
      chartType: props.chartType,
      dataSourceId: props.dataSourceId!,
      groupBy: props.groupBy || 'none',
      colorPalette: props.colorPalette || 'default',
      // ... other config from props
    },
    runtimeFilters: {
      startDate: props.startDate,
      endDate: props.endDate,
      measure: props.measure,
      frequency: props.frequency,
      // ... other filters from props
    },
  });
  
  // ✅ Fullscreen state (simple)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  
  // ✅ Export logic (keep as is - 26 lines)
  const handleExport = async (format: 'png' | 'pdf' | 'csv') => {
    // ... existing export logic
  };
  
  // ✅ Single loading state check
  if (isLoading) {
    return (
      <GlassCard className={props.className}>
        <ChartSkeleton />
      </GlassCard>
    );
  }
  
  // ✅ Single error state check
  if (error) {
    return (
      <GlassCard className={props.className}>
        <ChartError error={error} onRetry={refetch} chartTitle={props.title} />
      </GlassCard>
    );
  }
  
  // ✅ Main render
  return (
    <GlassCard className={props.className}>
      {/* ✅ Reusable header replaces 93 lines */}
      <ChartHeader
        title={props.title || `${props.measure} - ${props.frequency}`}
        onExport={handleExport}
        onRefresh={refetch}
        onFullscreen={
          props.chartType === 'bar' || 
          props.chartType === 'stacked-bar' || 
          props.chartType === 'horizontal-bar' ||
          props.chartType === 'dual-axis'
            ? () => setIsFullscreen(true)
            : undefined
        }
        isLoading={isLoading}
      />
      
      {/* ✅ Chart content */}
      <div className="flex-1 p-2">
        {/* ✅ Single renderer replaces 87 lines */}
        <ChartRenderer
          chartType={props.chartType}
          data={data.chartData}
          rawData={data.rawData}
          columns={data.columns}
          formattedData={data.formattedData}
          chartRef={chartRef}
          // Pass through all chart-specific props
          frequency={props.frequency}
          stackingMode={props.stackingMode}
          colorPalette={props.colorPalette}
          dualAxisConfig={props.dualAxisConfig}
          title={props.title}
          responsive={props.responsive}
          minHeight={props.minHeight}
          maxHeight={props.maxHeight}
          aspectRatio={props.aspectRatio}
        />
      </div>
      
      {/* ✅ Fullscreen modals (keep as is - chart-specific) */}
      {isFullscreen && (
        <ChartFullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          chartData={data.chartData}
          // ... props
        />
      )}
    </GlassCard>
  );
}
```

**Estimated Result:** ~150-180 lines (79-83% reduction)

---

## Current State Deep Dive

### Lines 1-33: Imports (33 lines)

**Current:**
```typescript
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChartData, AnalyticsQueryParams, MeasureType, ... } from '@/lib/types/analytics';
import { chartExportService } from '@/lib/services/chart-export';
import ChartErrorBoundary from './chart-error-boundary';
import { apiClient } from '@/lib/api/client';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import ResponsiveChartContainer from './responsive-chart-container';
import dynamic from 'next/dynamic';
import { GlassCard } from '@/components/ui/glass-card';

// Lazy load modals
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'));
const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'));

// Import all 9 chart components
import LineChart01 from './line-chart-01';
import BarChart01 from './bar-chart-01';
import AnalyticsBarChart from './analytics-bar-chart';
// ... 7 more chart component imports
```

**After Refactoring:**
```typescript
'use client';

import { useState, useRef } from 'react';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { chartExportService } from '@/lib/services/chart-export';
import { useChartData } from '@/hooks/use-chart-data';
import ChartRenderer from './chart-renderer';
import ChartHeader from './chart-header';
import ChartError from './chart-error';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { GlassCard } from '@/components/ui/glass-card';
import dynamic from 'next/dynamic';

const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'));
const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'));
```

**Reduction:** 33 → 15 lines (18 lines saved)

---

### Lines 35-78: Interfaces (44 lines)

**Keep:** AnalyticsChartProps interface (needed for component props)  
**Remove:** ApiResponse interface (not needed with useChartData)  
**Remove:** FormattedCellState interface (moved to ChartRenderer)

**Expected:** 44 → 30 lines (14 lines saved)

---

### Lines 112-148: State Variables (37 lines)

**Current State:**
```typescript
const [chartData, setChartData] = useState<ChartData>(...);
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [metadata, setMetadata] = useState<ApiResponse['metadata'] | null>(null);
const [rawData, setRawData] = useState<Record<string, unknown>[]>([]);
const [formattedData, setFormattedData] = useState<...>(undefined);
const [dataSourceColumns, setDataSourceColumns] = useState<...>([]);
const chartRef = useRef<HTMLCanvasElement | null>(null);
const [isFullscreen, setIsFullscreen] = useState(false);
const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
const stableAdvancedFilters = useMemo(...);
const stableMultipleSeries = useMemo(...);
const stablePeriodComparison = useMemo(...);
```

**After Refactoring:**
```typescript
// ✅ useChartData replaces 7 state variables
const { data, isLoading, error, refetch } = useChartData({...});

// ✅ Keep only UI state
const chartRef = useRef<HTMLCanvasElement | null>(null);
const [isFullscreen, setIsFullscreen] = useState(false);
const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
```

**Reduction:** 37 → 10 lines (27 lines saved)

---

### Lines 151-508: Data Fetching (357 lines)

**Current Complexity:**
- 88 lines for table chart fetch
- 128 lines for number/progress-bar/dual-axis fetch
- 91 lines for standard charts fetch (now also universal)
- 50 lines for parameter building

**After Refactoring:**
```typescript
// ✅ Single hook call replaces all 357 lines
const { data, isLoading, error, refetch } = useChartData({
  chartConfig: {
    chartType,
    dataSourceId: dataSourceId!,
    groupBy: groupBy || 'none',
    colorPalette: colorPalette || 'default',
    ...(chartType === 'stacked-bar' && { stackingMode }),
    ...(chartType === 'number' && { aggregation }),
    ...(chartType === 'progress-bar' && { aggregation, target, groupBy }),
    ...(chartType === 'dual-axis' && { dualAxisConfig }),
    ...(multipleSeries && multipleSeries.length > 0 && { multipleSeries }),
    ...(periodComparison && { periodComparison }),
    ...(title && { title }),
  },
  runtimeFilters: {
    startDate,
    endDate,
    dateRangePreset,
    practice,
    practiceUid,
    providerName,
    measure,
    frequency,
    ...(advancedFilters && advancedFilters.length > 0 && { advancedFilters }),
    ...(calculatedField && { calculatedField }),
  },
});
```

**Reduction:** 357 → 30 lines (327 lines saved!)

---

### Lines 515-540: Export Logic (26 lines)

**Assessment:** ⚠️ Keep as is or extract to hook

**Current:**
```typescript
const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
  try {
    let result;
    if (format === 'csv') {
      result = chartExportService.exportChartDataAsCSV(chartData, rawData, { format });
    } else if (chartRef.current) {
      if (format === 'pdf') {
        result = await chartExportService.exportChartAsPDF(chartRef.current, { format });
      } else {
        result = await chartExportService.exportChartAsImage(chartRef.current, { format });
      }
    }
    if (result.success) {
      chartExportService.downloadFile(result);
    }
  } catch (error) {
    console.error('Export failed:', error);
  }
};
```

**Decision:** Keep as is (needed for ChartHeader onExport callback)

**Reduction:** 0 lines (keep all 26)

---

### Lines 543-590: Error & Empty States (48 lines)

**After Refactoring:**
```typescript
// ✅ Loading state (8 lines)
if (isLoading) {
  return (
    <GlassCard className={className}>
      <ChartSkeleton />
    </GlassCard>
  );
}

// ✅ Error state (8 lines)
if (error) {
  return (
    <GlassCard className={className}>
      <ChartError error={error} onRetry={refetch} chartTitle={title} />
    </GlassCard>
  );
}

// ❌ Remove no-data check - ChartRenderer handles this
```

**Reduction:** 48 → 16 lines (32 lines saved)

---

### Lines 593-679: Chart Rendering Switch (87 lines)

**After Refactoring:**
```typescript
// ✅ Single component replaces entire switch
<ChartRenderer
  chartType={chartType}
  data={data.chartData}
  rawData={data.rawData}
  columns={data.columns}
  formattedData={data.formattedData}
  chartRef={chartRef}
  frequency={frequency}
  stackingMode={stackingMode}
  colorPalette={colorPalette}
  dualAxisConfig={dualAxisConfig}
  title={title}
  measure={measure}
  responsive={responsive}
  minHeight={minHeight}
  maxHeight={maxHeight}
  aspectRatio={aspectRatio}
  width={width}
  height={height}
/>
```

**Reduction:** 87 → 20 lines (67 lines saved)

---

### Lines 716-808: Header UI (93 lines)

**After Refactoring:**
```typescript
<ChartHeader
  title={title || `${measure} - ${frequency}`}
  onExport={handleExport}
  onRefresh={refetch}
  onFullscreen={
    chartType === 'bar' || 
    chartType === 'stacked-bar' || 
    chartType === 'horizontal-bar' ||
    chartType === 'dual-axis'
      ? () => setIsFullscreen(true)
      : undefined
  }
  isLoading={isLoading}
/>
```

**Reduction:** 93 → 14 lines (79 lines saved)

---

### Lines 815-879: Fullscreen Modals & Presets (65 lines)

**Assessment:** ⚠️ Keep as is

**Fullscreen modals** (24 lines) - Chart-specific, hard to extract  
**Component presets** (37 lines) - Useful exports, keep  

**Reduction:** 0 lines (keep all 65)

---

## Refactoring Breakdown

### Total Line Reduction Estimate

| Section | Current | After | Saved |
|---------|---------|-------|-------|
| Imports | 33 | 15 | 18 |
| Interfaces | 44 | 30 | 14 |
| State | 37 | 10 | 27 |
| Data Fetching | 357 | 30 | 327 |
| Export Logic | 26 | 26 | 0 |
| Error States | 48 | 16 | 32 |
| Chart Switch | 87 | 20 | 67 |
| Header UI | 93 | 14 | 79 |
| Modals/Presets | 65 | 65 | 0 |
| Other | 89 | 30 | 59 |
| **TOTAL** | **879** | **~156** | **~723 (82%)** |

**Target:** <200 lines ✅  
**Expected:** ~156 lines ✅  
**Reduction:** 82% complexity reduction

---

## Implementation Steps

### Step 1: Update ChartRenderer to Handle Progress Bar Data

**Issue:** Current analytics-chart.tsx has custom progress bar logic (lines 604-623):
```typescript
case 'progress-bar':
  const dataset = chartData.datasets[0];
  const rawValues = (dataset as any)?.rawValues as number[] | undefined;
  const originalMeasureType = (dataset as any)?.originalMeasureType as string | undefined;
  
  const progressData = chartData.labels.map((label, index) => ({
    label: String(label),
    value: rawValues?.[index] ?? Number(dataset?.data[index] || 0),
    percentage: Number(dataset?.data[index] || 0)
  }));
  return <AnalyticsProgressBarChart data={progressData} ... />;
```

**Solution:** Move this logic into ChartRenderer component

**File:** `components/charts/chart-renderer.tsx`

---

### Step 2: Update ChartRenderer to Accept chartRef

**Issue:** Some charts need ref for export functionality

**Solution:** Pass chartRef to ChartRenderer

---

### Step 3: Create New Simplified AnalyticsChart

**Replace entire component** with simplified version using extracted components

---

### Step 4: Handle Table Charts Edge Case

**Issue:** Tables currently use different API endpoint (`/api/admin/data-sources/[id]/query`)

**Options:**
1. Keep table chart logic in analytics-chart.tsx (preferred for now)
2. Update useChartData to handle table endpoint
3. Migrate table endpoint to universal (future Phase 6 enhancement)

**Decision:** Keep table logic for now (adds ~50 lines but maintains working functionality)

---

## Detailed Refactoring Plan

### Phase 4.4.1: Update ChartRenderer (Prep Work)

**File:** `components/charts/chart-renderer.tsx`

**Changes:**
1. Add progress bar data transformation logic
2. Accept chartRef prop and pass to chart components
3. Handle measure prop for AnalyticsNumberChart
4. Accept all passthrough props for special cases

**Estimated:** 160 → 200 lines (+40 lines)

---

### Phase 4.4.2: Create Simplified AnalyticsChart

**File:** `components/charts/analytics-chart.tsx`

**New Structure:**
1. Imports (15 lines)
2. AnalyticsChartProps interface (30 lines)
3. Component function signature (5 lines)
4. Build useChartData request (30 lines)
5. Call useChartData hook (1 line)
6. Fullscreen state (3 lines)
7. Export logic (26 lines)
8. Loading state check (8 lines)
9. Error state check (8 lines)
10. Main render with GlassCard (8 lines)
11. ChartHeader (14 lines)
12. ChartRenderer (20 lines)
13. Fullscreen modals (24 lines)
14. Component presets (37 lines)

**Total:** ~229 lines

**Optimizations to reach <200:**
- Remove component presets (move to separate file) = -37 lines
- Simplify request building = -10 lines
- **Final:** ~182 lines ✅

---

### Phase 4.4.3: Handle Table Charts Exception

**Issue:** Tables use different endpoint

**Options:**
1. **Option A (Recommended):** Keep table logic in analytics-chart.tsx
   - Adds ~50 lines but works today
   - Clean separation (table vs universal)
   - Can be migrated in future phase
   
2. **Option B:** Update useChartData to handle both endpoints
   - More complex hook
   - Violates single responsibility
   
3. **Option C:** Block table charts, force migration first
   - Breaking change
   - Not acceptable

**Decision:** Option A - Keep table logic, increases target to <250 lines

---

## Revised Target

**Original Target:** <200 lines  
**Revised Target:** <250 lines (accounting for table endpoint exception)  
**Expected Result:** ~232 lines  
**Still a Massive Win:** 74% reduction (879 → 232)

---

## Implementation Order

### Step 1: Update ChartRenderer ⏱️ 30 minutes
- Add progress bar transformation logic
- Add chartRef prop support
- Handle edge cases

### Step 2: Extract Component Presets ⏱️ 15 minutes
- Move to `components/charts/analytics-chart-presets.tsx`
- Update imports where used
- Reduces main file by 37 lines

### Step 3: Create Simplified AnalyticsChart ⏱️ 1 hour
- Replace data fetching with useChartData hook
- Replace rendering with ChartRenderer
- Replace header with ChartHeader
- Replace error states with ChartError
- Keep table logic as exception
- Keep export logic
- Keep fullscreen modals

### Step 4: Test All Chart Types ⏱️ 1 hour
- Visual testing for all 11 chart types
- Export functionality testing
- Fullscreen modal testing
- Responsive behavior testing

### Step 5: TypeScript & Linting ⏱️ 15 minutes
- Run `pnpm tsc`
- Run `pnpm lint`
- Fix all errors

**Total Time:** ~3 hours

---

## Risk Assessment

### Risk 1: Breaking Existing Functionality 🟡 MEDIUM

**Scenario:** Chart rendering breaks after refactoring

**Mitigation:**
- Keep original file as backup
- Test each chart type after refactoring
- Side-by-side comparison
- Can revert instantly

**Rollback:** Git revert single commit

### Risk 2: Prop Passthrough Issues 🟡 MEDIUM

**Scenario:** Missing props cause chart components to fail

**Mitigation:**
- ChartRenderer accepts `...otherProps` spread
- All props passed through to chart components
- TypeScript catches missing required props

**Rollback:** Add missing props

### Risk 3: Table Charts Break 🟢 LOW

**Scenario:** Table logic doesn't work after refactoring

**Mitigation:**
- Keep table logic exactly as is
- No changes to table endpoint calls
- Already tested and working

**Rollback:** Fix table section only

---

## Success Metrics

### Before Refactoring
- ❌ **879 lines** in analytics-chart.tsx
- ❌ **3 different data fetch patterns**
- ❌ **Manual state management** (7 state variables)
- ❌ **Large switch statement** for rendering
- ❌ **Duplicate header UI**
- ❌ **Hard to test**
- ❌ **Hard to maintain**

### After Refactoring
- ✅ **~232 lines** in analytics-chart.tsx (74% reduction)
- ✅ **Single data fetch pattern** (useChartData hook)
- ✅ **Minimal state** (3 UI state variables only)
- ✅ **Dynamic rendering** (ChartRenderer component)
- ✅ **Reusable components** (ChartHeader, ChartError)
- ✅ **Easy to test** (isolated concerns)
- ✅ **Easy to maintain** (clear separation)

---

## Files Modified

### Files to Modify
1. `components/charts/chart-renderer.tsx` - Add progress bar logic, chartRef support
2. `components/charts/analytics-chart.tsx` - Complete refactoring
3. `components/charts/analytics-chart-presets.tsx` - NEW - Extracted presets

### Files to Review (May Need Updates)
1. `components/charts/analytics-progress-bar-chart.tsx` - Verify prop interface
2. `components/charts/dual-axis-fullscreen-modal.tsx` - Verify prop interface
3. `components/charts/chart-fullscreen-modal.tsx` - Verify prop interface

---

## Testing Strategy

### Visual Testing
- [ ] Line chart (standard, period comparison, multiple series)
- [ ] Area chart (standard, filled rendering)
- [ ] Bar chart (standard, period comparison, multiple series)
- [ ] Stacked bar chart (normal mode, percentage mode)
- [ ] Horizontal bar chart (standard, groupBy)
- [ ] Pie chart (categorical grouping)
- [ ] Doughnut chart (categorical grouping)
- [ ] Table chart (formatted columns, icons)
- [ ] Number chart (aggregation types)
- [ ] Progress bar chart (grouped, dynamic target)
- [ ] Dual-axis chart (bar+line, bar+bar)

### Functional Testing
- [ ] Export PNG functionality
- [ ] Export PDF functionality
- [ ] Export CSV functionality
- [ ] Fullscreen modal (bar, stacked-bar, horizontal-bar)
- [ ] Dual-axis fullscreen modal
- [ ] Refresh button
- [ ] Responsive sizing
- [ ] Error state display
- [ ] Loading state display
- [ ] Empty data state display

### Integration Testing
- [ ] Dashboard with multiple charts
- [ ] Chart builder preview
- [ ] Filtering and date range changes
- [ ] Practice and provider filtering

---

## Implementation Checklist

### Pre-Refactoring
- [x] All chart types migrated to universal endpoint
- [x] useChartData hook created and tested
- [x] ChartRenderer created and tested
- [x] ChartHeader created and tested
- [x] ChartError created and tested
- [ ] Backup current analytics-chart.tsx

### During Refactoring
- [ ] Update ChartRenderer with progress bar logic
- [ ] Update ChartRenderer with chartRef support
- [ ] Extract component presets to separate file
- [ ] Create new simplified AnalyticsChart
- [ ] Test each chart type individually
- [ ] Fix any prop passthrough issues

### Post-Refactoring
- [ ] Run `pnpm tsc` and fix errors
- [ ] Run `pnpm lint` and fix errors
- [ ] Visual regression testing
- [ ] Update documentation
- [ ] Delete backup if successful

---

## Next Steps

**Immediate:**
1. Create backup of analytics-chart.tsx
2. Update ChartRenderer for progress bar handling
3. Extract component presets
4. Implement simplified AnalyticsChart

**Then:**
5. Comprehensive testing
6. Fix any issues found
7. Update documentation
8. Mark Phase 4 complete

---

## Questions for Review

1. **Table Charts:** Keep separate endpoint logic or force migration?
   - **Recommendation:** Keep separate for now, migrate in Phase 6+
   
2. **Component Presets:** Keep in same file or extract?
   - **Recommendation:** Extract to reduce main file size
   
3. **Export Logic:** Keep inline or extract to hook?
   - **Recommendation:** Keep inline, it's only 26 lines
   
4. **Target Line Count:** <200 or <250 (with table exception)?
   - **Recommendation:** Aim for <250 with table, <200 without table

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-12  
**Status:** Ready for Implementation

