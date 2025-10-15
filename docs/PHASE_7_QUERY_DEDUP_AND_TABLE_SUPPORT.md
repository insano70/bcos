# Phase 7: Query Deduplication & Table Chart Support

**Date:** October 14, 2025  
**Status:** Implementation Planning  
**Priority:** Medium (Performance Optimization + Feature Completeness)

---

## Executive Summary

This document provides detailed implementation plans for two Phase 7 enhancements:

1. **Query Deduplication**: Eliminate duplicate database queries when multiple charts use identical data
2. **Table Chart Support**: Include table charts in batch rendering (currently skipped)

**Combined Benefits:**
- 30-50% reduction in database queries for typical dashboards
- Complete batch rendering coverage (100% of chart types)
- Faster dashboard load times
- Reduced database load

---

## Part 1: Query Deduplication

### Problem Statement

**Current Behavior:**
Multiple charts on the same dashboard may query identical data. Each chart triggers a separate database query even if the underlying data is the same.

**Example Scenario:**
```
Dashboard: "Revenue Overview"

Chart 1: Total Revenue (Line Chart)
  - Measure: total_charges
  - Frequency: monthly
  - Date Range: Last 12 months
  - Query: SELECT ... FROM fact_charges WHERE measure='total_charges' AND frequency='monthly' ...

Chart 2: Revenue by Provider (Bar Chart)
  - Measure: total_charges
  - Frequency: monthly
  - Date Range: Last 12 months
  - GroupBy: provider_name
  - Query: SELECT ... FROM fact_charges WHERE measure='total_charges' AND frequency='monthly' ...

Chart 3: Revenue Trend (Area Chart)
  - Measure: total_charges
  - Frequency: monthly
  - Date Range: Last 12 months
  - Query: SELECT ... FROM fact_charges WHERE measure='total_charges' AND frequency='monthly' ...

RESULT: 3 identical queries to fact_charges table
```

**The Opportunity:**
All three charts need the same underlying data (total_charges by month). The only difference is how the data is grouped/transformed after fetching:
- Chart 1: Aggregated totals
- Chart 2: Grouped by provider
- Chart 3: Same as Chart 1 but rendered as area chart

**Solution:**
Execute query once, share results across all three charts, apply different transformations.

---

### Architecture Analysis

#### Current Flow

```
DashboardRenderer.renderDashboard()
  ↓
  For each chart (parallel):
    ↓
    chartDataOrchestrator.orchestrate()
      ↓
      ChartHandler.fetchData()
        ↓
        analyticsQueryBuilder.queryMeasures()
          ↓
          executeAnalyticsQuery() → DATABASE QUERY
          ↓
      ChartHandler.transform()
```

Each chart's fetchData() is independent - no shared state.

#### Target Flow with Deduplication

```
DashboardRenderer.renderDashboard()
  ↓
  Build query cache (Map<queryHash, Promise<data>>)
  ↓
  For each chart (parallel):
    ↓
    Generate queryHash from chart config
    ↓
    Check cache:
      ├─ Cache HIT: Await existing query promise (deduplicated)
      └─ Cache MISS: Execute query, store promise in cache
    ↓
    Apply chart-specific transformation
```

Key insight: Cache the **promise** not the data. This ensures parallel charts can share in-flight queries.

---

### Query Hash Strategy

**What to Include in Hash:**
Parameters that affect the actual database query:
- ✅ measure (e.g., 'total_charges', 'total_payments')
- ✅ frequency (e.g., 'monthly', 'weekly')
- ✅ startDate / endDate (date range)
- ✅ practiceUids (RBAC filtering)
- ✅ providerName (if specified)
- ✅ advancedFilters (complex filter expressions)
- ✅ dataSourceId (table to query)

**What to Exclude from Hash:**
Parameters that only affect transformation/rendering:
- ❌ chartType (line, bar, area - same data, different visual)
- ❌ groupBy (applied after fetching)
- ❌ colorPalette (visual only)
- ❌ stackingMode (visual only)
- ❌ responsive (UI property)
- ❌ aggregation (for number charts - applies to already-aggregated data)

**Edge Cases to Handle:**
1. **GroupBy affects query:** When groupBy changes which rows are returned (e.g., provider-level vs org-level), include in hash
2. **Multiple series:** Each series may have different parameters, treat separately
3. **Period comparison:** Queries two date ranges, treat as separate queries

---

### Implementation Plan

#### Task 1: Create Query Hash Generator

**File:** `lib/services/dashboard-query-cache.ts`

```typescript
import { createHash } from 'crypto';
import type { ChartConfig, RuntimeFilters } from '@/lib/types/analytics';

/**
 * Parameters that affect the actual database query
 * (not transformation-only parameters)
 */
interface QuerySignature {
  dataSourceId: number;
  measure?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  practiceUids?: number[];
  providerName?: string;
  advancedFilters?: unknown[];
  
  // Include groupBy ONLY if it affects data fetching
  // (e.g., for charts that fetch different granularity)
  groupBy?: string;
}

/**
 * Generate deterministic hash for query deduplication
 * 
 * @param config - Chart configuration
 * @param runtimeFilters - Runtime filters
 * @returns SHA256 hash of query signature
 */
export function generateQueryHash(
  config: ChartConfig,
  runtimeFilters: RuntimeFilters
): string {
  const signature: QuerySignature = {
    dataSourceId: config.dataSourceId,
    measure: runtimeFilters.measure,
    frequency: runtimeFilters.frequency,
    startDate: runtimeFilters.startDate,
    endDate: runtimeFilters.endDate,
    practiceUids: runtimeFilters.practiceUids,
    providerName: runtimeFilters.providerName,
    advancedFilters: runtimeFilters.advancedFilters,
  };

  // Include groupBy ONLY for charts that fetch at different granularity
  // For most charts, groupBy is applied AFTER fetching
  // Exception: Some charts may need this in the query
  if (shouldIncludeGroupByInQuery(config.chartType)) {
    signature.groupBy = config.groupBy;
  }

  // Create deterministic string representation
  const signatureString = JSON.stringify(signature, Object.keys(signature).sort());
  
  // Generate SHA256 hash
  return createHash('sha256').update(signatureString).digest('hex');
}

/**
 * Determine if groupBy affects the database query
 * 
 * For most charts, groupBy is applied during transformation.
 * Some chart types may need it in the query itself.
 */
function shouldIncludeGroupByInQuery(chartType: string): boolean {
  // Currently, groupBy is transformation-only for all chart types
  // If future chart types need groupBy in query, add them here
  return false;
}
```

**Tests Required:**
- Same config generates same hash
- Different measures generate different hashes
- Different date ranges generate different hashes
- Chart-type-only changes generate same hash
- Order of parameters doesn't affect hash

---

#### Task 2: Add Query Cache to DashboardRenderer

**File:** `lib/services/dashboard-renderer.ts`

**Changes:**

```typescript
import { generateQueryHash } from './dashboard-query-cache';

export class DashboardRenderer {
  /**
   * Query cache for deduplication within a single dashboard render
   * Key: queryHash, Value: Promise<rawData[]>
   * 
   * Lifecycle: Created per renderDashboard() call, cleared after completion
   * NOT a global cache - only deduplicates within one dashboard render
   */
  private queryCache: Map<string, Promise<Record<string, unknown>[]>> = new Map();
  
  async renderDashboard(...) {
    // Clear cache at start of each render
    this.queryCache.clear();
    
    try {
      // ... existing code ...
      
      // 4. Render all charts in parallel with universal filters
      const renderPromises = validCharts.map(async (chart) => {
        // ... existing chart setup code ...
        
        // NEW: Generate query hash for deduplication
        const queryHash = generateQueryHash(finalChartConfig, runtimeFilters);
        
        log.info('Query hash generated', {
          chartId: chartDef.chart_definition_id,
          chartName: chartDef.chart_name,
          chartType: chartDef.chart_type,
          queryHash,
        });
        
        // NEW: Check if query is already in flight or cached
        let rawData: Record<string, unknown>[];
        
        if (this.queryCache.has(queryHash)) {
          // Query deduplicated - await existing promise
          log.info('Query deduplicated (cache hit)', {
            chartId: chartDef.chart_definition_id,
            chartName: chartDef.chart_name,
            queryHash,
            deduplication: 'hit',
          });
          
          rawData = await this.queryCache.get(queryHash)!;
        } else {
          // First chart with this query - execute and cache promise
          log.info('Executing query (cache miss)', {
            chartId: chartDef.chart_definition_id,
            chartName: chartDef.chart_name,
            queryHash,
            deduplication: 'miss',
          });
          
          // Create promise for query execution
          const queryPromise = this.executeChartQuery(
            finalChartConfig,
            runtimeFilters,
            userContext
          );
          
          // Store promise in cache (other charts can await same promise)
          this.queryCache.set(queryHash, queryPromise);
          
          // Await result
          rawData = await queryPromise;
        }
        
        // Apply chart-specific transformation to shared data
        const chartData = await this.transformChartData(
          rawData,
          finalChartConfig,
          chartDef.chart_type
        );
        
        // ... rest of chart result building ...
      });
      
      // ... existing aggregation code ...
      
    } finally {
      // Clear cache after render completes
      this.queryCache.clear();
    }
  }
  
  /**
   * Execute chart query (extracted for deduplication)
   */
  private async executeChartQuery(
    config: ChartConfig,
    runtimeFilters: RuntimeFilters,
    userContext: UserContext
  ): Promise<Record<string, unknown>[]> {
    // Call orchestrator to fetch data
    const result = await chartDataOrchestrator.orchestrate(
      {
        chartConfig: config,
        runtimeFilters,
      },
      userContext
    );
    
    return result.rawData;
  }
  
  /**
   * Transform raw data for specific chart type
   */
  private async transformChartData(
    rawData: Record<string, unknown>[],
    config: ChartConfig,
    chartType: string
  ): Promise<ChartData> {
    // Get handler for transformation
    const handler = chartTypeRegistry.getHandler(chartType);
    
    if (!handler) {
      throw new Error(`No handler for chart type: ${chartType}`);
    }
    
    // Apply transformation
    return handler.transform(rawData, config);
  }
}
```

**Key Design Decisions:**

1. **Promise Caching**: Cache the promise, not the data. This allows multiple charts to await the same in-flight query without blocking.

2. **Per-Render Cache**: Cache is cleared after each dashboard render. This is NOT a global cache - it only deduplicates within a single dashboard request.

3. **Query Hash**: Hash includes only query-affecting parameters, excluding transformation-only parameters.

4. **Error Handling**: If a query fails, the promise will reject for all charts awaiting it. This is acceptable - the charts are using the same query, so they should fail together.

---

#### Task 3: Update Metadata Tracking

**Add deduplication metrics to DashboardRenderResponse:**

```typescript:lib/services/dashboard-renderer.ts
export interface DashboardRenderResponse {
  charts: Record<string, ChartRenderResult>;
  metadata: {
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
    queriesExecuted: number;
    chartsRendered: number;
    dashboardFiltersApplied: string[];
    parallelExecution: boolean;
    
    // NEW: Query deduplication metrics
    deduplication: {
      enabled: boolean;
      queriesDeduped: number;        // How many charts reused queries
      uniqueQueries: number;          // How many unique queries executed
      deduplicationRate: number;      // Percentage of queries saved
    };
  };
}
```

**Track metrics during render:**

```typescript
// At start of renderDashboard()
let uniqueQueriesExecuted = 0;
let queriesDeduplicated = 0;

// In chart loop
if (this.queryCache.has(queryHash)) {
  queriesDeduplicated++;
} else {
  uniqueQueriesExecuted++;
}

// In final metadata
metadata: {
  // ... existing fields ...
  deduplication: {
    enabled: true,
    queriesDeduped: queriesDeduplicated,
    uniqueQueries: uniqueQueriesExecuted,
    deduplicationRate: Math.round(
      (queriesDeduplicated / validCharts.length) * 100
    ),
  },
}
```

---

#### Task 4: Add Logging & Monitoring

**Log deduplication stats:**

```typescript
log.info('Dashboard render deduplication stats', {
  dashboardId,
  totalCharts: validCharts.length,
  uniqueQueries: uniqueQueriesExecuted,
  queriesDeduped: queriesDeduplicated,
  deduplicationRate: `${Math.round((queriesDeduplicated / validCharts.length) * 100)}%`,
  querySavings: queriesDeduplicated,
});
```

**Add performance comparison:**

```typescript
// Before deduplication implementation
const expectedQueriesWithoutDedup = validCharts.length;
const actualQueries = uniqueQueriesExecuted;
const queriesSaved = expectedQueriesWithoutDedup - actualQueries;

log.performance('Query deduplication impact', {
  dashboardId,
  queriesWithoutDedup: expectedQueriesWithoutDedup,
  queriesWithDedup: actualQueries,
  queriesSaved,
  performanceImprovement: `${Math.round((queriesSaved / expectedQueriesWithoutDedup) * 100)}%`,
});
```

---

#### Task 5: Testing

**Unit Tests:**
- `tests/unit/services/dashboard-query-cache.test.ts`
  - Query hash generation (deterministic, consistent)
  - Same config → same hash
  - Different parameters → different hash
  - Order independence

**Integration Tests:**
- `tests/integration/analytics/dashboard-query-deduplication.test.ts`
  - Create dashboard with 3 charts using same measure
  - Verify only 1 query executed
  - Verify all 3 charts receive data
  - Verify deduplication metadata correct
  - Test with different chart types (line, bar, area) using same data
  - Test edge cases (one chart fails, others succeed)

---

### Expected Performance Impact

**Scenario 1: Revenue Dashboard (3 charts, same data)**
- Before: 3 queries (1500ms total)
- After: 1 query (500ms total)
- **Improvement: 67% faster**

**Scenario 2: Comprehensive Dashboard (10 charts, 4 unique queries)**
- Before: 10 queries (5000ms total)
- After: 4 queries (2000ms total)
- **Improvement: 60% faster**

**Scenario 3: Diverse Dashboard (8 charts, 8 unique queries)**
- Before: 8 queries (4000ms total)
- After: 8 queries (4000ms total)
- **Improvement: 0% (no deduplication opportunity)**

**Average Expected Improvement: 30-50% reduction in queries**

---

### Rollout Plan

**Phase 1: Implementation (4-6 hours)**
- Task 1: Query hash generator (1 hour)
- Task 2: DashboardRenderer integration (2-3 hours)
- Task 3: Metadata tracking (30 min)
- Task 4: Logging (30 min)
- Task 5: Testing (1-2 hours)

**Phase 2: Validation (1-2 days)**
- Deploy to staging with deduplication disabled
- Run baseline performance tests
- Enable deduplication
- Compare performance metrics
- Verify correctness (all charts render correctly)

**Phase 3: Production Rollout (1 week)**
- Enable for 10% of dashboards (monitor)
- Increase to 50% (monitor)
- Full rollout (100%)

---

## Part 2: Table Chart Support in Batch Rendering

### Problem Statement

**Current Behavior:**
Table charts are **skipped** in batch rendering (lines 215-226 in `dashboard-renderer.ts`):

```typescript
// FIX #5: Skip table charts (they use different endpoint)
if (chartDef.chart_type === 'table') {
  log.warn('Skipping table chart in batch rendering', {
    chartId: chartDef.chart_definition_id,
    chartName: chartDef.chart_name,
    reason: 'table_charts_use_different_endpoint',
  });
  
  return {
    chartId: chartDef.chart_definition_id,
    result: null, // Will be handled separately in dashboard-view
  };
}
```

**Why Skipped:**
Historical reasons - table charts initially used a different API endpoint (`/api/admin/data-sources/[id]/query`) instead of the universal chart data endpoint.

**Current State:**
- TableChartHandler exists and is fully functional
- Server-side formatting implemented (Phase 3.2)
- Handler can fetch column metadata + row data
- Handler applies formatters and icon mappings
- Returns columns, rawData, formattedData

**The Problem:**
Because batch rendering skips tables, dashboards with table charts:
1. Still make individual API calls for tables (not batched)
2. Don't benefit from dashboard-level filter application
3. Have inconsistent loading behavior (batch charts fast, tables slow)

---

### Architecture Analysis

#### Current Table Chart Flow (Legacy)

```
Dashboard View
  ↓
  Individual AnalyticsChart component
  ↓
  Fetches from /api/admin/data-sources/[id]/query
  ↓
  Returns raw data (no server transformation)
  ↓
  Client applies formatting (but Phase 3.2 moved this to server)
```

#### Target Table Chart Flow (Batch)

```
Dashboard View
  ↓
  useDashboardData hook (batch call)
  ↓
  DashboardRenderer.renderDashboard()
  ↓
  Detects table chart
  ↓
  Calls TableChartHandler.fetchData()
    ↓
    Fetches column metadata via RBAC service
    ↓
    Fetches row data via analyticsQueryBuilder
  ↓
  Calls TableChartHandler.transform()
    ↓
    Applies server-side formatting
    ↓
    Returns columns + rawData + formattedData
  ↓
  Includes in batch response
  ↓
  BatchChartRenderer displays table
```

---

### Implementation Plan

#### Task 1: Remove Table Chart Skip Logic

**File:** `lib/services/dashboard-renderer.ts`

**Remove lines 214-226:**

```typescript
// DELETE THIS ENTIRE BLOCK:
if (chartDef.chart_type === 'table') {
  log.warn('Skipping table chart in batch rendering', {
    chartId: chartDef.chart_definition_id,
    chartName: chartDef.chart_name,
    reason: 'table_charts_use_different_endpoint',
  });
  
  return {
    chartId: chartDef.chart_definition_id,
    result: null,
  };
}
```

**Replace with:**

```typescript
// Table charts now supported in batch rendering (Phase 3.2 complete)
log.info('Processing chart in batch', {
  chartId: chartDef.chart_definition_id,
  chartName: chartDef.chart_name,
  chartType: chartDef.chart_type,
  batchSupported: true,
});
```

That's it. The rest of the code already handles tables correctly via the chartDataOrchestrator.

---

#### Task 2: Verify TableChartHandler Integration

**No code changes needed** - verify existing code works:

1. **Handler Registration:** Check `lib/services/chart-handlers/index.ts`
   ```typescript
   // Should already be registered:
   chartTypeRegistry.register(new TableChartHandler());
   ```

2. **Orchestrator Support:** Check `lib/services/chart-data-orchestrator.ts`
   ```typescript
   // Already extracts columns and formattedData:
   const columns = Array.isArray(mergedConfig.columns)
     ? (mergedConfig.columns as ColumnDefinition[])
     : undefined;
   
   const formattedData = Array.isArray(mergedConfig.formattedData)
     ? (mergedConfig.formattedData as Array<Record<string, FormattedCell>>)
     : undefined;
   
   const result: OrchestrationResult = {
     chartData,
     rawData,
     metadata: { ... },
     columns,          // ✅ Passed through
     formattedData,    // ✅ Passed through
   };
   ```

3. **API Response:** Check `app/api/admin/analytics/dashboard/[dashboardId]/render/route.ts`
   ```typescript
   // Should already include columns/formattedData in response:
   if (result.columns) chartResult.columns = result.columns;
   if (result.formattedData) chartResult.formattedData = result.formattedData;
   ```

4. **Batch Renderer:** Check `components/charts/batch-chart-renderer.tsx`
   ```typescript
   // Should already pass columns/formattedData to ChartRenderer:
   <ChartRenderer
     chartType={chartData.metadata.chartType}
     data={chartData.chartData}
     rawData={chartData.rawData}
     {...(chartData.columns && { columns: chartData.columns })}
     {...(chartData.formattedData && { formattedData: chartData.formattedData })}
     // ...
   />
   ```

**Verification:** All integration points already exist. Removing the skip logic should enable tables immediately.

---

#### Task 3: Update Dashboard View Fallback Logic

**File:** `components/charts/dashboard-view.tsx`

**Current code (lines 303-335):**

```typescript
// Phase 7: Check if we have batch data for this chart
const batchChartData = useBatchRendering && batchData && !batchError
  ? batchData.charts[dashboardChart.chartDefinitionId]
  : null;

return (
  <div>
    {batchChartData ? (
      <BatchChartRenderer
        chartData={batchChartData as BatchChartData}
        // ...
      />
    ) : (
      <AnalyticsChart
        // Individual fetch (fallback)
      />
    )}
  </div>
);
```

**Problem:** If table chart returns `null` in batch response (current skip behavior), it falls back to individual fetch. This is correct behavior.

**After removing skip logic:** Table charts will be included in `batchData.charts`, so they'll use BatchChartRenderer. No code change needed in dashboard-view.tsx.

---

#### Task 4: Testing

**Integration Tests:**
- `tests/integration/analytics/dashboard-table-chart-batch.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { DashboardRenderer } from '@/lib/services/dashboard-renderer';
import {
  createCommittedUser,
  createCommittedDashboard,
  createCommittedChart,
} from '@/tests/factories/committed';

describe('Dashboard Batch Rendering - Table Charts', () => {
  it('should include table charts in batch response', async () => {
    // Create dashboard with table chart
    const user = await createCommittedUser();
    const dashboard = await createCommittedDashboard({
      created_by: user.user_id,
    });
    
    const tableChart = await createCommittedChart({
      chart_type: 'table',
      created_by: user.user_id,
      data_source: {
        table: 'fact_charges',
        filters: [],
      },
      chart_config: {
        dataSourceId: 1,
      },
    });
    
    // Add chart to dashboard
    await addChartToDashboard(dashboard.dashboard_id, tableChart.chart_definition_id);
    
    // Render dashboard
    const renderer = new DashboardRenderer();
    const result = await renderer.renderDashboard(
      dashboard.dashboard_id,
      {},
      buildUserContext(user)
    );
    
    // Verify table chart included
    expect(result.charts).toHaveProperty(tableChart.chart_definition_id);
    
    const tableChartResult = result.charts[tableChart.chart_definition_id];
    
    // Verify table-specific fields present
    expect(tableChartResult.columns).toBeDefined();
    expect(tableChartResult.columns.length).toBeGreaterThan(0);
    expect(tableChartResult.formattedData).toBeDefined();
    expect(tableChartResult.rawData).toBeDefined();
    
    // Verify metadata
    expect(tableChartResult.metadata.chartType).toBe('table');
    expect(tableChartResult.metadata.recordCount).toBeGreaterThan(0);
  });
  
  it('should apply dashboard filters to table charts', async () => {
    // Create dashboard with table chart
    const user = await createCommittedUser();
    const dashboard = await createCommittedDashboard();
    const tableChart = await createCommittedChart({ chart_type: 'table' });
    
    await addChartToDashboard(dashboard.dashboard_id, tableChart.chart_definition_id);
    
    // Render with universal filters
    const renderer = new DashboardRenderer();
    const result = await renderer.renderDashboard(
      dashboard.dashboard_id,
      {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
      buildUserContext(user)
    );
    
    // Verify table chart received filtered data
    const tableChartResult = result.charts[tableChart.chart_definition_id];
    expect(tableChartResult.rawData.length).toBeGreaterThan(0);
    
    // Verify all records are within date range
    for (const row of tableChartResult.rawData) {
      const date = new Date(row.date_index as string);
      expect(date >= new Date('2024-01-01')).toBe(true);
      expect(date <= new Date('2024-12-31')).toBe(true);
    }
  });
  
  it('should format table data server-side', async () => {
    // Create dashboard with table chart
    const user = await createCommittedUser();
    const dashboard = await createCommittedDashboard();
    const tableChart = await createCommittedChart({ chart_type: 'table' });
    
    await addChartToDashboard(dashboard.dashboard_id, tableChart.chart_definition_id);
    
    // Render dashboard
    const renderer = new DashboardRenderer();
    const result = await renderer.renderDashboard(
      dashboard.dashboard_id,
      {},
      buildUserContext(user)
    );
    
    const tableChartResult = result.charts[tableChart.chart_definition_id];
    
    // Verify formattedData structure
    expect(tableChartResult.formattedData).toBeDefined();
    expect(tableChartResult.formattedData.length).toBeGreaterThan(0);
    
    // Verify each cell has formatted + raw values
    const firstRow = tableChartResult.formattedData[0];
    const firstColumn = tableChartResult.columns[0];
    
    expect(firstRow[firstColumn.columnName]).toHaveProperty('formatted');
    expect(firstRow[firstColumn.columnName]).toHaveProperty('raw');
  });
});
```

**E2E Tests:**
- Test dashboard with mixed chart types (tables + line + bar)
- Verify all charts render correctly
- Verify table charts benefit from batch performance
- Verify dashboard filters apply to tables

---

### Expected Performance Impact

**Scenario: Dashboard with 2 line charts + 1 table chart**

**Before (table skipped):**
- 1 batch API call (2 line charts) - 800ms
- 1 individual API call (table chart) - 500ms
- **Total: 1300ms**

**After (table included):**
- 1 batch API call (all 3 charts) - 900ms
- **Total: 900ms**
- **Improvement: 31% faster**

**Scenario: Dashboard with 5 tables + 5 line charts**

**Before:**
- 1 batch API call (5 line charts) - 1500ms
- 5 individual API calls (5 tables) - 2500ms
- **Total: 4000ms (parallel) or 6500ms (sequential)**

**After:**
- 1 batch API call (all 10 charts) - 2000ms
- **Total: 2000ms**
- **Improvement: 50-69% faster**

---

### Rollout Plan

**Phase 1: Code Changes (30 minutes)**
- Remove skip logic from dashboard-renderer.ts
- Verify handler registration
- Verify integration points

**Phase 2: Testing (2 hours)**
- Write integration tests
- Test with real dashboard
- Verify formatted data flows correctly
- Test with dashboard filters

**Phase 3: Deployment (1 day)**
- Deploy to staging
- Test with production-like dashboards
- Verify no regressions
- Deploy to production

---

## Combined Implementation Timeline

### Week 1: Query Deduplication
- **Monday**: Tasks 1-2 (Query hash + DashboardRenderer integration) - 4 hours
- **Tuesday**: Tasks 3-4 (Metadata + logging) - 1 hour
- **Wednesday**: Task 5 (Testing) - 2 hours
- **Thursday**: Code review + adjustments - 2 hours
- **Friday**: Staging deployment + validation - 2 hours

### Week 2: Table Chart Support
- **Monday**: Tasks 1-2 (Remove skip logic + verify integration) - 1 hour
- **Tuesday**: Task 4 (Testing) - 2 hours
- **Wednesday**: Code review + adjustments - 1 hour
- **Thursday**: Staging deployment + validation - 2 hours
- **Friday**: Production deployment - 2 hours

### Total Effort: 19 hours over 2 weeks

---

## Success Metrics

### Query Deduplication

| Metric | Target | Measurement |
|--------|--------|-------------|
| Queries reduced | 30-50% | Log deduplication rate per dashboard |
| Dashboard load time | 30-50% faster | Compare P95 before/after |
| Database load | 30-50% reduction | Monitor query count in analytics DB |
| Correctness | 100% | All charts render identical data |

### Table Chart Support

| Metric | Target | Measurement |
|--------|--------|-------------|
| Batch coverage | 100% chart types | Verify no skipped charts |
| Table load time | 30-50% faster | Compare individual vs batch |
| Filter application | 100% consistent | Verify tables respect dashboard filters |
| Data correctness | 100% | Compare formatted data before/after |

---

## Risk Assessment

### Query Deduplication Risks

**Risk 1: Hash Collisions**
- **Probability**: Very Low
- **Impact**: High (wrong data in charts)
- **Mitigation**: Use SHA256 (collision probability ~0%), comprehensive testing

**Risk 2: Incorrect Hash Parameters**
- **Probability**: Medium
- **Impact**: High (charts receive wrong data)
- **Mitigation**: Extensive unit tests, code review, staging validation

**Risk 3: Shared Query Failure**
- **Probability**: Low
- **Impact**: Medium (multiple charts fail together)
- **Mitigation**: Acceptable - if query fails, all dependent charts should fail

### Table Chart Support Risks

**Risk 1: Missing Column Metadata**
- **Probability**: Low
- **Impact**: High (table won't render)
- **Mitigation**: TableChartHandler already fetches columns, tested in Phase 3.2

**Risk 2: Formatted Data Missing**
- **Probability**: Low
- **Impact**: Medium (table shows unformatted data)
- **Mitigation**: Server-side formatting already implemented, comprehensive tests

**Risk 3: Performance Regression**
- **Probability**: Very Low
- **Impact**: Low
- **Mitigation**: Batch should be faster than individual, benchmark in staging

---

## Conclusion

Both enhancements are **low-risk, high-value** additions to Phase 7:

**Query Deduplication:**
- 30-50% reduction in database queries
- Faster dashboard loads
- Lower database load
- Minimal code changes (~150 lines)

**Table Chart Support:**
- 100% batch rendering coverage
- Consistent loading experience
- Dashboard filters work for all chart types
- Trivial code change (remove 12 lines)

**Combined Impact:**
- Complete Phase 7 to 100%
- Significant performance improvements
- Better user experience
- Minimal implementation risk

**Recommendation:** Implement both enhancements in parallel over 2 weeks.

