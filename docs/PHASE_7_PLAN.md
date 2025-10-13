# Phase 7: Dashboard Batch Rendering + Universal Filters

**Date:** 2025-10-12  
**Status:** Planning - Ready for Review  
**Prerequisites:** ✅ Phase 3, 4, 5, 6 Complete  
**Priority:** HIGH (Major UX Enhancement)

---

## Executive Summary

Phase 7 combines **batch rendering** for performance with **dashboard-level universal filters** for superior user experience. Users can apply filters (date ranges, organization, practice) at the dashboard level, instantly regenerating all charts without individual configuration.

**Key Enhancements:**
1. **Batch Rendering API** - Single request for all dashboard charts
2. **Dashboard-Level Filters** - Apply to ALL charts simultaneously
3. **Filter Cascade** - Dashboard filters override chart-level filters
4. **Real-Time Regeneration** - Change filter → all charts update instantly

**Benefits:**
- 🚀 **60% faster** dashboard loads (single API call vs N calls)
- 🎯 **Superior UX** - Filter entire dashboard with one control
- 💾 **Reduced bandwidth** - Batch response vs multiple responses
- 🔄 **Instant updates** - No page reload needed

---

## Current State vs Target State

### Current (Phase 6)

**Dashboard Loading:**
```
User loads dashboard
  ↓
DashboardView renders
  ↓
Chart 1 mounts → API call 1 (500ms)
Chart 2 mounts → API call 2 (500ms)
Chart 3 mounts → API call 3 (500ms)
...
Chart N mounts → API call N (500ms)
  ↓
Total: N × 500ms = 5000ms for 10 charts
```

**Filtering:**
- Each chart has its own date range
- No way to change all charts at once
- Must edit each chart individually

---

### Target (Phase 7)

**Dashboard Loading:**
```
User loads dashboard
  ↓
DashboardView calls batch API
  ↓
POST /api/admin/analytics/dashboard/{id}/render
  ↓
Server fetches all charts in parallel
  ↓
Single response with all chart data
  ↓
Total: ~800ms for 10 charts (with cache hits: ~200ms)
```

**Filtering:**
```
Dashboard Header
  [Date Range: Last 30 Days ▼] [Organization: All ▼] [Practice: All ▼]
  ↓ User changes date range
ALL charts regenerate instantly with new date range
```

---

## Architecture Design

### Dashboard-Level Filters

**Filter Cascade Model:**

```
Priority 1: Dashboard-Level Filters (highest)
  ├── Date Range (startDate, endDate, or preset)
  ├── Organization (organizationId)
  ├── Practice (practiceUid)
  ├── Provider (providerName)
  └── Custom Filters (future)

Priority 2: Chart-Level Filters (overridden by dashboard)
  ├── Measure (specific to chart type)
  ├── Frequency (specific to chart type)
  ├── GroupBy (specific to chart type)
  └── Advanced Filters (additive with dashboard filters)

Priority 3: Chart Configuration (not affected by filters)
  ├── Chart Type
  ├── Color Palette
  ├── Stacking Mode
  └── Dual-Axis Config
```

**How It Works:**

1. **Dashboard stores universal filters** in state
2. **Batch API request** includes dashboard filters
3. **Server merges filters** (dashboard overrides chart)
4. **All charts rendered** with merged filters
5. **Client receives batch** response
6. **Charts update** with new data

---

### Batch Rendering API

**Endpoint:** `POST /api/admin/analytics/dashboard/[id]/render`

**Request:**
```typescript
interface DashboardRenderRequest {
  dashboardId: string;
  
  // Dashboard-level universal filters (apply to ALL charts)
  universalFilters?: {
    startDate?: string;
    endDate?: string;
    dateRangePreset?: string;
    organizationId?: string;
    practiceUid?: number;
    providerName?: string;
    // Future: custom dashboard filters
  };
  
  // Chart-specific overrides (optional, per-chart basis)
  chartOverrides?: Record<string, {
    measure?: string;
    frequency?: string;
    // Other chart-specific filters
  }>;
  
  // Cache control
  nocache?: boolean;
}
```

**Response:**
```typescript
interface DashboardRenderResponse {
  // Map of chart ID to chart data
  charts: Record<string, {
    chartData: ChartData;
    rawData: Record<string, unknown>[];
    metadata: {
      chartType: string;
      dataSourceId: number;
      queryTimeMs: number;
      cacheHit: boolean;
      recordCount: number;
      appliedFilters: {
        dashboardLevel: string[];  // Which dashboard filters were applied
        chartLevel: string[];      // Which chart filters were used
      };
    };
  }>;
  
  // Aggregate metadata
  metadata: {
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
    queriesExecuted: number;
    parallelExecution: boolean;
    chartsRendered: number;
    dashboardFiltersApplied: string[];
  };
}
```

---

## UI Components

### Dashboard Filter Bar

**New Component:** `components/charts/dashboard-filter-bar.tsx`

**Features:**
- Date range selector (reuse DateRangePresets component)
- Organization dropdown (if multi-org)
- Practice dropdown
- Provider dropdown (optional)
- Reset filters button
- Apply button (or auto-apply on change)

**Visual Design:**
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard: Revenue Overview                                  │
├─────────────────────────────────────────────────────────────┤
│ Filters: [Last 30 Days ▼] [All Organizations ▼]            │
│          [All Practices ▼] [All Providers ▼] [Reset]       │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Filters saved in dashboard state
- Changes trigger batch re-render
- Filters persist in URL query params (shareable links)
- Loading state while refreshing

---

## Database Schema Changes

### Dashboard Configuration Enhancement

**Table:** `dashboards.layout_config` (existing JSONB column)

**Add:**
```json
{
  "columns": 12,
  "rowHeight": 150,
  "margin": 10,
  "defaultFilters": {
    "dateRangePreset": "last_30_days",
    "startDate": null,
    "endDate": null,
    "organizationId": null,
    "practiceUid": null,
    "providerName": null,
    "allowUserOverride": true
  },
  "filterBarEnabled": true,
  "filterBarPosition": "top"
}
```

**No Migration Needed:** JSONB allows adding fields without schema changes

---

## Implementation Plan

### Phase 7.1: Dashboard-Level Filters ⏱️ 3 hours

#### 7.1.1: Create DashboardFilterBar Component
**File:** `components/charts/dashboard-filter-bar.tsx` (NEW)

**Features:**
- Reuse `DateRangePresets` component
- Organization selector (fetch from API)
- Practice selector (fetch from API)
- Provider selector (optional)
- Filter state management
- onChange callbacks

**Props:**
```typescript
interface DashboardFilterBarProps {
  initialFilters?: DashboardUniversalFilters;
  onFiltersChange: (filters: DashboardUniversalFilters) => void;
  loading?: boolean;
}
```

---

#### 7.1.2: Update DashboardView with Filter State
**File:** `components/charts/dashboard-view.tsx`

**Changes:**
```typescript
// Add state for dashboard filters
const [universalFilters, setUniversalFilters] = useState<DashboardUniversalFilters>({
  dateRangePreset: 'last_30_days',
  startDate: null,
  endDate: null,
  organizationId: null,
  practiceUid: null,
  providerName: null,
});

// Pass to filter bar
<DashboardFilterBar
  initialFilters={dashboard.layout_config?.defaultFilters}
  onFiltersChange={setUniversalFilters}
  loading={isLoadingCharts}
/>

// Merge with chart configs
{dashboardConfig.charts.map((chart) => (
  <AnalyticsChart
    {...chart.props}
    // Dashboard filters override chart filters
    startDate={universalFilters.startDate || chart.startDate}
    endDate={universalFilters.endDate || chart.endDate}
    practiceUid={universalFilters.practiceUid || chart.practiceUid}
  />
))}
```

---

#### 7.1.3: URL Query Param Persistence
**File:** `components/charts/dashboard-view.tsx`

**Features:**
- Read filters from URL on mount
- Update URL when filters change
- Shareable dashboard links with filters
- Browser back/forward support

**Example URL:**
```
/dashboard/view/{id}?datePreset=last_30_days&practice=114&org=acme
```

---

### Phase 7.2: Batch Rendering API ⏱️ 4 hours

#### 7.2.1: Create Dashboard Renderer Service
**File:** `lib/services/dashboard-renderer.ts` (NEW)

**Class:**
```typescript
export class DashboardRenderer {
  /**
   * Render entire dashboard with all charts
   */
  async renderDashboard(
    dashboardId: string,
    universalFilters: DashboardUniversalFilters,
    userContext: UserContext
  ): Promise<DashboardRenderResponse> {
    // 1. Load dashboard definition
    // 2. Load all chart definitions
    // 3. Merge dashboard filters with chart configs
    // 4. Execute all charts in parallel (Promise.all)
    // 5. Aggregate results
    // 6. Return batch response
  }
  
  /**
   * Merge dashboard filters with chart config
   */
  private mergeFilters(
    chartConfig: Record<string, unknown>,
    universalFilters: DashboardUniversalFilters
  ): Record<string, unknown> {
    // Dashboard filters override chart filters
    return {
      ...chartConfig,
      // Dashboard filters take precedence
      ...(universalFilters.startDate && { startDate: universalFilters.startDate }),
      ...(universalFilters.endDate && { endDate: universalFilters.endDate }),
      ...(universalFilters.practiceUid && { practiceUid: universalFilters.practiceUid }),
      ...(universalFilters.organizationId && { organizationId: universalFilters.organizationId }),
    };
  }
}
```

---

#### 7.2.2: Create Batch Rendering Endpoint
**File:** `app/api/admin/analytics/dashboard/[id]/render/route.ts` (NEW)

**Handler:**
```typescript
const renderDashboardHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { dashboardId } = params;
  
  // 1. Validate request
  const { universalFilters, chartOverrides, nocache } = await validateRequest(
    request,
    dashboardRenderRequestSchema
  );
  
  // 2. Render dashboard with batch service
  const dashboardRenderer = new DashboardRenderer();
  const result = await dashboardRenderer.renderDashboard(
    dashboardId,
    universalFilters,
    userContext
  );
  
  // 3. Log performance
  log.info('Dashboard batch render completed', {
    dashboardId,
    chartsRendered: result.metadata.chartsRendered,
    cacheHits: result.metadata.cacheHits,
    totalQueryTime: result.metadata.totalQueryTime,
    duration: Date.now() - startTime,
  });
  
  return createSuccessResponse(result);
};
```

---

#### 7.2.3: Create useDashboardData Hook
**File:** `hooks/use-dashboard-data.ts` (NEW)

**Hook:**
```typescript
export function useDashboardData(
  dashboardId: string,
  universalFilters: DashboardUniversalFilters
) {
  const [data, setData] = useState<DashboardRenderResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchDashboard = useCallback(async (bypassCache = false) => {
    const response = await apiClient.post(
      `/api/admin/analytics/dashboard/${dashboardId}/render`,
      {
        dashboardId,
        universalFilters,
        nocache: bypassCache,
      }
    );
    
    setData(response);
  }, [dashboardId, JSON.stringify(universalFilters)]);
  
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);
  
  return { data, isLoading, error, refetch: fetchDashboard };
}
```

---

### Phase 7.3: Dashboard Builder Enhancements ⏱️ 2 hours

#### 7.3.1: Add Filter Configuration to Dashboard Builder

**Features:**
- Enable/disable dashboard-level filtering
- Configure default filters
- Set which filters are available (dates, org, practice, provider)
- Allow/disallow user overrides

**UI:**
```
Dashboard Settings
  ☑ Enable Dashboard-Level Filters
  
  Default Filters:
    Date Range: [Last 30 Days ▼]
    Organization: [All ▼]
    Practice: [All ▼]
    
  Available Filter Controls:
    ☑ Date Range
    ☑ Organization
    ☑ Practice
    ☐ Provider
    
  ☑ Allow users to override filters
```

---

### Phase 7.4: Performance Optimizations ⏱️ 1.5 hours

#### 7.4.1: Query Deduplication

**Issue:** Multiple charts might use same query (e.g., both show "Charges by Provider")

**Solution:**
```typescript
// In DashboardRenderer
private deduplicateQueries(chartConfigs: ChartConfig[]): {
  uniqueQueries: Map<string, ChartConfig[]>;
  queryMap: Map<string, string>;
} {
  // Hash each query
  // Group charts by query hash
  // Execute unique queries only
  // Share results across charts
}
```

**Benefit:** If 10 charts use 5 unique queries, only execute 5 queries

---

#### 7.4.2: Shared Connection Pooling

**Current:** Each chart gets its own DB connection  
**Target:** Batch request uses single connection pool

**Implementation:** Already handled by Node.js connection pooling, just document

---

#### 7.4.3: Progressive Loading (Optional)

**Feature:** Return charts as they complete (streaming)

**Implementation:**
```typescript
// Stream results as they complete
for await (const chartResult of executeChartsInParallel()) {
  yield { chartId, data: chartResult };
}
```

**Benefit:** User sees charts populate progressively instead of all-or-nothing

---

## Database Schema

### Dashboard Configuration

**Table:** `dashboards` (existing)  
**Column:** `layout_config` (existing JSONB)

**Enhanced Structure:**
```json
{
  // Existing layout config
  "columns": 12,
  "rowHeight": 150,
  "margin": 10,
  
  // Phase 7: Dashboard-level filters
  "filterConfig": {
    "enabled": true,
    "position": "top",
    "sticky": true,
    "defaultFilters": {
      "dateRangePreset": "last_30_days",
      "startDate": null,
      "endDate": null,
      "organizationId": null,
      "practiceUid": null,
      "providerName": null
    },
    "availableFilters": {
      "dateRange": true,
      "organization": true,
      "practice": true,
      "provider": false
    },
    "allowUserOverride": true,
    "persistInUrl": true
  }
}
```

**No Migration Required:** JSONB supports adding nested fields

---

## User Experience Flow

### Scenario 1: User Views Dashboard

```
1. Load /dashboard/view/abc123
2. Dashboard loads with default filters (last 30 days)
3. All charts show data for last 30 days
4. User changes date range to "Last Quarter"
5. Loading indicator appears
6. Batch API called with new date range
7. All charts update with Q data (2 seconds)
8. URL updates to /dashboard/view/abc123?datePreset=last_quarter
```

---

### Scenario 2: User Shares Filtered Dashboard

```
1. User applies filters: YTD, Practice=114
2. URL becomes: /dashboard/view/abc123?datePreset=ytd&practice=114
3. User copies URL and shares with colleague
4. Colleague opens URL
5. Dashboard loads with YTD data for Practice 114
6. Filters pre-selected in UI
```

---

### Scenario 3: Organization Comparison

```
1. User selects Organization: "ACME Corp"
2. All revenue/performance charts update for ACME
3. User changes to "Beta Inc"
4. All charts instantly update for Beta
5. Side-by-side comparison by switching orgs
```

---

## Technical Implementation

### Filter Merge Logic

**Priority System:**
```typescript
function mergeFilters(
  chartFilters: ChartFilters,
  dashboardFilters: DashboardUniversalFilters
): MergedFilters {
  return {
    // Dashboard filters override chart filters (if present)
    startDate: dashboardFilters.startDate ?? chartFilters.startDate,
    endDate: dashboardFilters.endDate ?? chartFilters.endDate,
    practiceUid: dashboardFilters.practiceUid ?? chartFilters.practiceUid,
    organizationId: dashboardFilters.organizationId ?? chartFilters.organizationId,
    
    // Chart-specific filters (not overridden)
    measure: chartFilters.measure,
    frequency: chartFilters.frequency,
    groupBy: chartFilters.groupBy,
    
    // Advanced filters are additive
    advancedFilters: [
      ...(dashboardFilters.advancedFilters || []),
      ...(chartFilters.advancedFilters || []),
    ],
  };
}
```

---

### Parallel Execution Strategy

**Current Sequential:**
```typescript
for (const chart of charts) {
  const data = await fetchChartData(chart);  // Sequential
  results.push(data);
}
// Total: Sum of all query times
```

**Phase 7 Parallel:**
```typescript
const promises = charts.map(chart => fetchChartData(chart));
const results = await Promise.all(promises);  // Parallel
// Total: Max of all query times (not sum!)
```

**Performance:**
- 10 charts @ 500ms each
- Sequential: 5000ms
- Parallel: 500ms (10x faster!)

---

## Phase 7 Task List

### 🔴 HIGH Priority - Dashboard Filters

1. **Create DashboardFilterBar Component** (1.5 hours)
   - Date range selector
   - Organization dropdown
   - Practice dropdown
   - Provider dropdown (optional)
   - State management
   - Apply/Reset buttons

2. **Update DashboardView with Filter State** (1 hour)
   - Add universal filter state
   - URL query param sync
   - Pass filters to charts
   - Filter cascade logic

3. **Add Filter Config to Dashboard Builder** (1 hour)
   - UI for configuring filter settings
   - Save filter config to layout_config
   - Default filter selection

### 🔴 HIGH Priority - Batch Rendering

4. **Create DashboardRenderer Service** (2 hours)
   - Load dashboard definition
   - Merge universal filters with chart configs
   - Parallel chart execution
   - Result aggregation
   - Error handling

5. **Create Batch Rendering Endpoint** (1.5 hours)
   - Request validation
   - Call DashboardRenderer
   - RBAC enforcement
   - Response formatting
   - Performance logging

6. **Create useDashboardData Hook** (1 hour)
   - Fetch dashboard batch
   - Loading/error states
   - Refetch with cache bypass
   - Filter change detection

### 🟡 MEDIUM Priority - Integration

7. **Integrate Batch API into DashboardView** (1.5 hours)
   - Replace individual fetches
   - Use useDashboardData hook
   - Handle batch loading state
   - Error handling for partial failures

8. **URL Query Param Management** (1 hour)
   - Read filters from URL on mount
   - Update URL on filter change
   - Browser history integration
   - Shareable links

### 🟢 LOW Priority - Optimizations

9. **Query Deduplication** (1 hour)
   - Detect duplicate queries
   - Execute once, reuse results
   - Performance logging

10. **Progressive Loading** (1.5 hours - optional)
    - Stream chart results
    - Show charts as they complete
    - Better perceived performance

---

## Testing Requirements

### Unit Tests
- [ ] DashboardRenderer filter merging
- [ ] Query deduplication logic
- [ ] Cache key generation with dashboard filters

### Integration Tests
- [ ] Batch endpoint with various filter combinations
- [ ] Filter cascade (dashboard overrides chart)
- [ ] Parallel execution performance
- [ ] Error handling (partial failures)

### E2E Tests
- [ ] Load dashboard with filters
- [ ] Change filters, verify all charts update
- [ ] Share filtered dashboard link
- [ ] URL param persistence

---

## Success Metrics

**Performance:**
- Dashboard load time: <2s (from ~5s) - 60% improvement
- Filter change response: <1s
- Cache hit rate: >80% with batch API
- Parallel execution efficiency: 90%+ (vs sequential)

**User Experience:**
- Time to change all chart dates: 1 click (vs N edits)
- Shareable filtered dashboards: Yes
- Filter persistence: URL params
- Loading feedback: Progressive (optional)

---

## Migration Path

**Backward Compatibility:**
- ✅ Existing dashboards work without filters
- ✅ Filter bar hidden if `filterConfig.enabled = false`
- ✅ Individual chart fetching still works (fallback)
- ✅ Gradual rollout via dashboard setting

**Migration Steps:**
1. Deploy batch API (available but not used)
2. Add filter bar UI (hidden by default)
3. Enable on test dashboards
4. Collect feedback
5. Rollout to production dashboards
6. Eventually deprecate individual fetching (Phase 8)

---

## Risk Assessment

### Risk 1: Batch Request Timeout 🟡 MEDIUM

**Scenario:** Dashboard with 50 charts times out

**Mitigation:**
- Limit charts per dashboard (recommendation: <20)
- Timeout handling (return partial results)
- Progressive loading fallback

### Risk 2: Filter Conflicts 🟢 LOW

**Scenario:** Dashboard filter conflicts with chart requirement

**Solution:** Clear precedence rules (dashboard wins)

### Risk 3: Performance Regression 🟢 LOW

**Scenario:** Batch API slower than individual

**Mitigation:** Parallel execution + caching should be faster

---

## Timeline Estimate

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 7.1.1 | DashboardFilterBar component | 1.5 hours |
| 7.1.2 | DashboardView filter state | 1 hour |
| 7.1.3 | URL query params | 1 hour |
| 7.2.1 | DashboardRenderer service | 2 hours |
| 7.2.2 | Batch rendering endpoint | 1.5 hours |
| 7.2.3 | useDashboardData hook | 1 hour |
| 7.3 | Dashboard builder enhancements | 1 hour |
| 7.4 | Query deduplication | 1 hour |
| 7.5 | Testing | 2 hours |
| **Total** | **Phase 7 Complete** | **~12 hours** |

---

## Benefits Summary

**Performance:**
- 60% faster dashboard loads (batch vs sequential)
- 90% reduction in API calls (1 vs N)
- Better cache utilization (batch hits cache)

**User Experience:**
- Filter entire dashboard with one control
- Shareable filtered dashboards
- No individual chart editing needed
- Instant organization/practice comparisons

**Developer Experience:**
- Single API call to maintain
- Consistent filter behavior
- Easier testing (one endpoint vs many)

---

## Next Steps

**For Review:**
1. Approve Phase 7 architecture
2. Prioritize features (all vs subset)
3. Timeline confirmation
4. UI/UX design review

**After Approval:**
1. Update `docs/universal_analytics.md` with Phase 7 plan
2. Create detailed implementation tickets
3. Begin implementation (12 hours estimated)

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-12  
**Status:** Plan Ready for Review

