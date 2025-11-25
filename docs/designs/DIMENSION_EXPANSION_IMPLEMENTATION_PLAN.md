# Dimension Expansion 2.0: Implementation Plan

> **Branch**: `feat/newchart`  
> **Created**: 2025-11-25  
> **Status**: Planning

## Overview

This document outlines the phased implementation plan for improving the dimension expansion functionality in our charting system. The goal is to deliver the same analytical capability with a significantly better user experience while addressing the "combinatorial explosion" problem.

---

## Problem Statement

Current dimension expansion generates all possible combinations when users select multiple dimensions:
- 3 dimensions × 10 values each = 1,000 possible charts
- This overwhelms both the system (many parallel queries) and the user (too many charts to navigate)
- Users cannot focus on specific dimension values of interest

---

## Implementation Phases

### Phase 1: Value-Level Selection (Quick Win)
**Effort**: Low | **Impact**: High | **Target**: Week 1

#### 1.1 Goal
Replace dimension-column checkboxes with value-level selection, allowing users to pick specific dimension values instead of "all values for this dimension."

#### 1.2 Current State
```tsx
// DimensionCheckboxes currently shows:
[x] Location (5 values)      ← Selects ALL locations
[x] Line of Business (4 values)  ← Selects ALL LOBs
// Result: 5 × 4 = 20 charts
```

#### 1.3 Target State
```tsx
// New component shows expandable dimension groups:
▼ Location
  [x] Downtown Clinic
  [x] Uptown Clinic  
  [ ] West Side
  [ ] East Side
  
▼ Line of Business
  [x] Physical Therapy
  [x] Occupational Therapy
  [ ] Sports Medicine
  
// Result: 2 × 2 = 4 charts (user-controlled)
```

#### 1.4 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 1.4.1 | `components/charts/dimension-value-selector.tsx` | Create new component with expandable dimension groups and value checkboxes |
| 1.4.2 | `hooks/useDimensionExpansion.ts` | Add `selectedValues: Record<string, (string\|number)[]>` state |
| 1.4.3 | `lib/types/dimensions.ts` | Add `ValueLevelSelection` interface |
| 1.4.4 | `lib/services/analytics/dimension-expansion-renderer.ts` | Modify to accept specific value selections instead of full cartesian product |
| 1.4.5 | `components/charts/chart-fullscreen-modal.tsx` | Replace `DimensionCheckboxes` with new `DimensionValueSelector` |
| 1.4.6 | Unit tests | Test value selection state management |

#### 1.5 API Changes

```typescript
// Current request
interface MultiDimensionExpansionRequest {
  dimensionColumns: string[];  // ["location", "line_of_business"]
  // Fetches ALL values for each dimension
}

// New request
interface ValueLevelExpansionRequest {
  dimensionSelections: {
    column: string;
    values: (string | number)[];  // Specific values to expand
  }[];
}
```

#### 1.6 Acceptance Criteria
- [ ] Users can expand dimension groups to see available values
- [ ] Users can select/deselect individual values
- [ ] Only selected value combinations are queried
- [ ] "Select All" / "Clear All" shortcuts per dimension
- [ ] Chart count preview updates in real-time

---

### Phase 2: Combination Preview & Budget
**Effort**: Low | **Impact**: Medium | **Target**: Week 1

#### 2.1 Goal
Show users exactly what they're about to generate before executing, with clear guidance on performance implications.

#### 2.2 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 2.2.1 | `components/charts/expansion-preview.tsx` | Create preview component showing combination breakdown |
| 2.2.2 | `lib/constants/dimension-expansion.ts` | Add `CHART_BUDGET` constants (soft limit: 12, hard limit: 50) |
| 2.2.3 | `components/charts/dimension-value-selector.tsx` | Integrate preview into selector UI |

#### 2.3 UI Design

```tsx
<ExpansionPreview selections={selectedValues}>
  {/* When count <= 12 (green) */}
  <div className="bg-green-50 border-green-200">
    <p>✓ Generating 4 charts (2 locations × 2 LOBs)</p>
  </div>
  
  {/* When count 13-30 (amber) */}
  <div className="bg-amber-50 border-amber-200">
    <p>⚠ Generating 24 charts</p>
    <p className="text-sm">Consider reducing selections for better performance</p>
  </div>
  
  {/* When count > 30 (red) */}
  <div className="bg-red-50 border-red-200">
    <p>⛔ 60 charts exceeds recommended limit</p>
    <p className="text-sm">Please reduce to 30 or fewer</p>
  </div>
</ExpansionPreview>
```

#### 2.4 Acceptance Criteria
- [ ] Preview shows exact combination count
- [ ] Preview shows breakdown formula (e.g., "3 × 4 × 2 = 24")
- [ ] Color-coded feedback (green/amber/red)
- [ ] Hard limit prevents submission above threshold

---

### Phase 3: Primary Dimension Grouping
**Effort**: Medium | **Impact**: High | **Target**: Week 2

#### 3.1 Goal
Group expanded charts by the first selected dimension, creating collapsible sections for better navigation.

#### 3.2 Current State
```
[Chart 1] [Chart 2] [Chart 3] [Chart 4] [Chart 5] ... ← Flat horizontal scroll
```

#### 3.3 Target State
```
┌─ Downtown Clinic ────────────────────────────────┐
│ [PT Chart] [OT Chart] [Sports Chart]             │ ← Horizontal scroll within group
└──────────────────────────────────────────────────┘
┌─ Uptown Clinic ──────────────────────────────────┐
│ [PT Chart] [OT Chart] [Sports Chart]             │
└──────────────────────────────────────────────────┘
```

#### 3.4 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 3.4.1 | `components/charts/grouped-dimension-view.tsx` | Create new grouped view component |
| 3.4.2 | `lib/utils/dimension-combinations.ts` | Add `groupCombinationsByPrimary()` utility |
| 3.4.3 | `components/charts/dimension-group-card.tsx` | Create collapsible group card |
| 3.4.4 | `components/charts/dimension-comparison-view.tsx` | Integrate grouped view as layout option |
| 3.4.5 | `hooks/useDimensionExpansion.ts` | Add `layoutMode: 'flat' | 'grouped'` state |

#### 3.5 Data Structure

```typescript
interface GroupedExpansionResult {
  primaryDimension: ExpansionDimension;
  groups: {
    primaryValue: DimensionValue;
    charts: DimensionExpandedChart[];
    isCollapsed: boolean;
  }[];
}
```

#### 3.6 Acceptance Criteria
- [ ] Charts grouped by first selected dimension
- [ ] Groups are collapsible/expandable
- [ ] Group header shows primary value and chart count
- [ ] Horizontal scroll within each group
- [ ] Toggle between flat and grouped views

---

### Phase 4: Comparison Mode
**Effort**: Medium | **Impact**: High | **Target**: Week 2

#### 4.1 Goal
Allow users to select exactly 2 values for focused side-by-side comparison with synchronized scales.

#### 4.2 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 4.2.1 | `components/charts/comparison-mode-selector.tsx` | Create 2-value comparison selector |
| 4.2.2 | `components/charts/comparison-view.tsx` | Create side-by-side comparison layout |
| 4.2.3 | `lib/utils/chart-scale-sync.ts` | Utility to calculate shared Y-axis scale |
| 4.2.4 | `components/charts/chart-fullscreen-modal.tsx` | Add comparison mode toggle |

#### 4.3 UI Design

```tsx
<ComparisonModeSelector>
  <div className="flex items-center gap-4">
    <span>Compare:</span>
    <DimensionValueDropdown 
      dimension="location" 
      selected={comparisonA} 
      onChange={setComparisonA}
    />
    <span>vs</span>
    <DimensionValueDropdown 
      dimension="location" 
      selected={comparisonB} 
      onChange={setComparisonB}
    />
  </div>
</ComparisonModeSelector>

<ComparisonView>
  <div className="grid grid-cols-2 gap-6">
    <div className="border rounded-lg p-4">
      <h3>{comparisonA.label}</h3>
      <ChartRenderer data={chartA} yAxisMax={sharedMax} />
      <ComparisonStats data={chartA} />
    </div>
    <div className="border rounded-lg p-4">
      <h3>{comparisonB.label}</h3>
      <ChartRenderer data={chartB} yAxisMax={sharedMax} />
      <ComparisonStats data={chartB} />
    </div>
  </div>
  <DifferenceIndicator a={chartA} b={chartB} />
</ComparisonView>
```

#### 4.4 Acceptance Criteria
- [ ] Dropdown selectors for exactly 2 values
- [ ] Side-by-side chart display
- [ ] Synchronized Y-axis scales
- [ ] Key metrics comparison (totals, averages, trends)
- [ ] Difference indicators (%, absolute)

---

### Phase 5: Summary Table View
**Effort**: Medium | **Impact**: High | **Target**: Week 3

#### 5.1 Goal
Show aggregated dimension summaries in a table before rendering individual charts, allowing users to click through to specific charts.

#### 5.2 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 5.2.1 | `app/api/admin/analytics/charts/[chartId]/summary/route.ts` | New API endpoint for dimension summaries |
| 5.2.2 | `lib/services/analytics/dimension-summary-service.ts` | Service to aggregate dimension values |
| 5.2.3 | `components/charts/dimension-summary-table.tsx` | Table component with drill-through |
| 5.2.4 | `components/charts/chart-fullscreen-modal.tsx` | Add summary table as default expansion view |

#### 5.3 API Design

```typescript
// POST /api/admin/analytics/charts/:chartId/summary
interface DimensionSummaryRequest {
  dimensionColumn: string;
  runtimeFilters: DimensionExpansionFilters;
  aggregations: ('sum' | 'count' | 'avg' | 'min' | 'max')[];
}

interface DimensionSummaryResponse {
  dimension: ExpansionDimension;
  rows: {
    value: DimensionValue;
    aggregations: Record<string, number>;  // { sum: 1200000, count: 3245, avg: 370 }
  }[];
  totals: Record<string, number>;
}
```

#### 5.4 UI Design

```tsx
<DimensionSummaryTable>
  <table>
    <thead>
      <tr>
        <th>Location</th>
        <th>Total Revenue</th>
        <th>Visit Count</th>
        <th>Avg per Visit</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {rows.map(row => (
        <tr key={row.value.value}>
          <td>{row.value.label}</td>
          <td>${row.aggregations.sum.toLocaleString()}</td>
          <td>{row.aggregations.count.toLocaleString()}</td>
          <td>${row.aggregations.avg.toFixed(0)}</td>
          <td>
            <button onClick={() => showChart(row.value)}>
              📊 View Chart
            </button>
          </td>
        </tr>
      ))}
    </tbody>
    <tfoot>
      <tr className="font-bold">
        <td>Total</td>
        <td>${totals.sum.toLocaleString()}</td>
        <td>{totals.count.toLocaleString()}</td>
        <td>${totals.avg.toFixed(0)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</DimensionSummaryTable>
```

#### 5.5 Acceptance Criteria
- [ ] Single query returns all dimension aggregations
- [ ] Table displays with sortable columns
- [ ] "View Chart" button shows individual chart in modal
- [ ] Works for single dimension expansion
- [ ] Total row at bottom

---

### Phase 6: Drill-Down Mode
**Effort**: High | **Impact**: High | **Target**: Week 3-4

#### 6.1 Goal
Replace "show all combinations" with interactive drill-down navigation, showing one dimension level at a time.

#### 6.2 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 6.2.1 | `components/charts/drill-down-navigator.tsx` | Breadcrumb-style navigation component |
| 6.2.2 | `components/charts/drill-down-view.tsx` | Main drill-down container |
| 6.2.3 | `hooks/useDrillDown.ts` | State management for drill-down path |
| 6.2.4 | `lib/types/dimensions.ts` | Add `DrillDownPath` and `DrillDownState` types |

#### 6.3 User Flow

```
Step 1: Base chart with "Drill Down" button
        [📊 Revenue Chart]
        [🔍 Drill Down ▼]
        
Step 2: Select dimension to drill by
        Drill down by:
        [Location] [Provider] [Payer] [Line of Business]
        
Step 3: Shows charts for selected dimension (e.g., Location)
        ← Back to Overview
        
        Location / [All Locations]
        
        [Downtown] [Uptown] [West Side] [East Side]
        
        (Each card has "Drill Deeper" option)
        
Step 4: User drills into Downtown → Line of Business
        ← Back to Locations
        
        Location / Downtown / Line of Business
        
        [Physical Therapy] [Occupational Therapy] [Sports Med]
```

#### 6.4 State Management

```typescript
interface DrillDownState {
  path: DrillDownPathSegment[];  // [{dim: 'location', value: 'downtown'}, ...]
  currentDimension: string | null;
  availableDimensions: ExpansionDimension[];
  charts: DimensionExpandedChart[];
}

interface DrillDownPathSegment {
  dimension: string;
  value: string | number;
  label: string;
}

// Hook API
const { 
  path, 
  charts, 
  availableDimensions,
  drillInto,    // (dimension, value) => void
  drillBack,    // () => void - go up one level
  reset,        // () => void - back to base chart
} = useDrillDown({ chartDefinitionId, runtimeFilters });
```

#### 6.5 Acceptance Criteria
- [ ] Breadcrumb navigation shows current drill path
- [ ] "Back" navigation at each level
- [ ] Never more than ~10 charts visible at once
- [ ] Drill-down available from each chart card
- [ ] "Reset to Overview" shortcut

---

### Phase 7: Backend Optimization - Query Batching
**Effort**: Medium | **Impact**: High | **Target**: Week 4

#### 7.1 Goal
Replace N separate queries with single batched query using GROUP BY, splitting results client-side.

#### 7.2 Current Flow
```
Frontend requests 10 chart expansions
  → 10 parallel API calls
    → 10 database queries (even with p-limit)
      → 10 result sets returned
```

#### 7.3 Target Flow
```
Frontend requests 10 chart expansions
  → 1 API call with all dimension values
    → 1 database query with GROUP BY dimension
      → 1 result set split into 10 chart datasets
```

#### 7.4 Implementation Tasks

| Task | File(s) | Description |
|------|---------|-------------|
| 7.4.1 | `lib/services/analytics/batched-dimension-query.ts` | New service for batched dimension queries |
| 7.4.2 | `lib/services/analytics/dimension-expansion-renderer.ts` | Refactor to use batched queries |
| 7.4.3 | `lib/services/analytics/query-builder.ts` | Add GROUP BY dimension support |
| 7.4.4 | `lib/utils/chart-data-splitter.ts` | Utility to split grouped results into chart datasets |

#### 7.5 Query Transformation

```sql
-- Current: 5 separate queries
SELECT date, SUM(value) FROM analytics WHERE location = 'Downtown' GROUP BY date;
SELECT date, SUM(value) FROM analytics WHERE location = 'Uptown' GROUP BY date;
SELECT date, SUM(value) FROM analytics WHERE location = 'West Side' GROUP BY date;
SELECT date, SUM(value) FROM analytics WHERE location = 'East Side' GROUP BY date;
SELECT date, SUM(value) FROM analytics WHERE location = 'North' GROUP BY date;

-- New: 1 batched query
SELECT location, date, SUM(value) as value
FROM analytics 
WHERE location IN ('Downtown', 'Uptown', 'West Side', 'East Side', 'North')
GROUP BY location, date
ORDER BY location, date;
```

#### 7.6 Acceptance Criteria
- [ ] Single query for up to 20 dimension values
- [ ] Results correctly split into separate chart datasets
- [ ] Performance improvement measurable (>50% faster)
- [ ] Fallback to parallel queries for edge cases

---

## File Change Summary

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `components/charts/dimension-value-selector.tsx` | 1 | Value-level selection UI |
| `components/charts/expansion-preview.tsx` | 2 | Combination preview component |
| `components/charts/grouped-dimension-view.tsx` | 3 | Grouped layout container |
| `components/charts/dimension-group-card.tsx` | 3 | Collapsible group card |
| `components/charts/comparison-mode-selector.tsx` | 4 | 2-value comparison selector |
| `components/charts/comparison-view.tsx` | 4 | Side-by-side comparison layout |
| `components/charts/dimension-summary-table.tsx` | 5 | Summary table component |
| `components/charts/drill-down-navigator.tsx` | 6 | Breadcrumb navigation |
| `components/charts/drill-down-view.tsx` | 6 | Drill-down container |
| `hooks/useDrillDown.ts` | 6 | Drill-down state management |
| `lib/services/analytics/dimension-summary-service.ts` | 5 | Summary aggregation service |
| `lib/services/analytics/batched-dimension-query.ts` | 7 | Batched query service |
| `lib/utils/chart-scale-sync.ts` | 4 | Y-axis synchronization |
| `lib/utils/chart-data-splitter.ts` | 7 | Split grouped results |
| `app/api/admin/analytics/charts/[chartId]/summary/route.ts` | 5 | Summary API endpoint |

### Modified Files

| File | Phase | Changes |
|------|-------|---------|
| `hooks/useDimensionExpansion.ts` | 1, 3 | Add value-level selection, layout mode |
| `lib/types/dimensions.ts` | 1, 6 | New interfaces for value selection and drill-down |
| `lib/constants/dimension-expansion.ts` | 2 | Add chart budget constants |
| `components/charts/chart-fullscreen-modal.tsx` | 1-6 | Integrate new components |
| `components/charts/dimension-comparison-view.tsx` | 3 | Add grouped layout option |
| `lib/services/analytics/dimension-expansion-renderer.ts` | 1, 7 | Value selection + batched queries |
| `lib/utils/dimension-combinations.ts` | 3 | Add grouping utility |

---

## Testing Strategy

### Unit Tests

| Component | Test Cases |
|-----------|------------|
| `DimensionValueSelector` | Selection state, select all/clear, max selection limits |
| `ExpansionPreview` | Correct combination count, color thresholds |
| `GroupedDimensionView` | Grouping logic, collapse/expand |
| `ComparisonView` | Scale synchronization, difference calculations |
| `DrillDownNavigator` | Path management, navigation |
| `BatchedDimensionQuery` | Query construction, result splitting |

### Integration Tests

| Flow | Test Cases |
|------|------------|
| Value Selection → Expansion | Selected values produce correct charts |
| Drill-Down Flow | Navigation preserves filters, back button works |
| Comparison Mode | Both charts load, scales synchronized |
| Query Batching | Batched query returns same data as parallel queries |

### Performance Benchmarks

| Metric | Current | Target |
|--------|---------|--------|
| 10 dimension expansion | ~2000ms | <1000ms |
| Initial dimension load | ~500ms | <300ms |
| Drill-down navigation | N/A | <500ms |

---

## Migration & Rollout

### Feature Flags

```typescript
// lib/feature-flags.ts
export const DIMENSION_EXPANSION_V2 = {
  valueSelection: process.env.NEXT_PUBLIC_FF_DIM_VALUE_SELECT === 'true',
  groupedView: process.env.NEXT_PUBLIC_FF_DIM_GROUPED === 'true',
  comparisonMode: process.env.NEXT_PUBLIC_FF_DIM_COMPARE === 'true',
  drillDown: process.env.NEXT_PUBLIC_FF_DIM_DRILL === 'true',
  batchedQueries: process.env.NEXT_PUBLIC_FF_DIM_BATCH === 'true',
};
```

### Rollout Plan

1. **Week 1**: Deploy Phases 1-2 with feature flag (internal testing)
2. **Week 2**: Enable for beta users, deploy Phase 3-4
3. **Week 3**: Deploy Phase 5, gather feedback
4. **Week 4**: Deploy Phase 6-7, full rollout

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Avg charts per expansion | 15-20 | 4-8 |
| Expansion load time | 2-4 seconds | <1 second |
| User-initiated expansions per session | 1.2 | 3+ |
| Expansion abandonment rate | 40% | <15% |

---

## Open Questions

1. **Should we deprecate the current flat view?** Or keep it as "Advanced" mode?
2. **How to handle existing saved dashboards** with expansion configurations?
3. **Mobile experience**: Is drill-down the only viable pattern for mobile?
4. **Caching strategy for batched queries**: New cache keys needed?

---

## Appendix: Type Definitions

```typescript
// New types to be added to lib/types/dimensions.ts

/**
 * Value-level dimension selection
 */
export interface DimensionValueSelection {
  dimensionColumn: string;
  selectedValues: (string | number)[];
}

/**
 * Request with specific value selections
 */
export interface ValueLevelExpansionRequest {
  finalChartConfig: DimensionExpansionChartConfig;
  runtimeFilters: DimensionExpansionFilters;
  selections: DimensionValueSelection[];
  limit?: number;
  offset?: number;
}

/**
 * Drill-down navigation path
 */
export interface DrillDownPath {
  segments: DrillDownPathSegment[];
}

export interface DrillDownPathSegment {
  dimension: string;
  value: string | number;
  label: string;
}

/**
 * Drill-down state
 */
export interface DrillDownState {
  path: DrillDownPath;
  currentDimension: string | null;
  availableDimensions: ExpansionDimension[];
  charts: DimensionExpandedChart[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Dimension summary for table view
 */
export interface DimensionSummaryRow {
  value: DimensionValue;
  aggregations: Record<string, number>;
}

export interface DimensionSummaryResponse {
  dimension: ExpansionDimension;
  rows: DimensionSummaryRow[];
  totals: Record<string, number>;
}

/**
 * Comparison mode state
 */
export interface ComparisonSelection {
  dimensionColumn: string;
  valueA: DimensionValue;
  valueB: DimensionValue;
}

export interface ComparisonResult {
  chartA: DimensionExpandedChart;
  chartB: DimensionExpandedChart;
  sharedYAxisMax: number;
  differences: {
    metric: string;
    valueA: number;
    valueB: number;
    percentDiff: number;
  }[];
}
```

