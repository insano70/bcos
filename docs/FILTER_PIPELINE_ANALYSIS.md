# Filter Pipeline Analysis - Phase 2

**Date:** November 20, 2025  
**Status:** Analysis In Progress  
**Objective:** Consolidate 5 filter formats into single type-safe pipeline

---

## Current State: Filter Format Proliferation

### Problem: 5 Different Filter Formats

The charting system currently transforms filters through **5 different formats**:

```typescript
// Format 1: DashboardUniversalFilters (dashboard API input)
{
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  practiceUids?: number[];
  providerName?: string;
  dateRangePreset?: string;
}

// Format 2: ResolvedFilters (after organization resolution)
{
  startDate?: string;
  endDate?: string;
  organizationId?: string;
  practiceUids: number[]; // Required (resolved from org)
  providerName?: string;
  dateRangePreset?: string;
}

// Format 3: ChartFilter[] (array format for query builders)
[
  { field: 'date', operator: 'gte', value: '2024-01-01' },
  { field: 'date', operator: 'lte', value: '2024-12-31' },
  { field: 'practice_uid', operator: 'in', value: [100, 101] }
]

// Format 4: runtimeFilters (flat object for orchestrator)
{
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  practiceUids: [100, 101],
  advancedFilters: ChartFilter[]
}

// Format 5: AnalyticsQueryParams (final SQL builder format)
{
  data_source_id: 1,
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  practice_uid?: number,
  advanced_filters: ChartFilter[]
}
```

---

## Filter Conversion Locations

### 1. lib/utils/filter-converters.ts (Primary Converter)

**Two conversion functions:**

```typescript
// Function 1: Convert to ChartFilter array
export function convertBaseFiltersToChartFilters(
  baseFilters: BaseFilters | ResolvedBaseFilters
): ChartFilter[] {
  // Lines 79-136
  // Converts: BaseFilters → ChartFilter[]
  // Used by: dimension-expansion-renderer.ts
}

// Function 2: Convert to runtime filters object  
export function convertBaseFiltersToRuntimeFilters(
  baseFilters: BaseFilters
): Record<string, unknown> {
  // Lines 169-206
  // Converts: BaseFilters → runtimeFilters object
  // Used by: Unclear (may be unused)
}
```

**Problem:** Duplicate conversion logic, different output formats

---

### 2. lib/services/chart-handlers/base-handler.ts (Handler Converter)

**buildQueryParams() method (lines 161-289):**

```typescript
protected buildQueryParams(config: Record<string, unknown>): AnalyticsQueryParams {
  // Extracts date range
  const { startDate, endDate } = getDateRange(...);
  
  // Builds query parameters
  const queryParams: AnalyticsQueryParams = {
    data_source_id: config.dataSourceId as number,
    start_date: startDate,
    end_date: endDate,
    limit: (config.limit as number) || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
  };
  
  // Lines 208-256: Complex practiceUids handling
  if (config.practiceUids && Array.isArray(config.practiceUids)) {
    if (config.practiceUids.length === 0) {
      // FAIL-CLOSED SECURITY: Empty array = no data
      queryParams.advanced_filters = [{
        field: 'practice_uid',
        operator: 'in',
        value: [-1], // Impossible value
      }];
    } else {
      queryParams.advanced_filters = [{
        field: 'practice_uid',
        operator: 'in',
        value: config.practiceUids,
      }];
    }
  }
  
  // Lines 263-272: Merge chart-specific advanced filters
  if (config.advancedFilters) {
    queryParams.advanced_filters = [
      ...(queryParams.advanced_filters || []),
      ...config.advancedFilters
    ];
  }
  
  return queryParams;
}
```

**Problem:** 130 lines of conversion logic in every handler

---

### 3. lib/services/dashboard-rendering/chart-config-builder.ts (Config Builder)

**buildRuntimeFilters() method (lines 130-179):**

```typescript
private buildRuntimeFilters(
  dataSourceFilters: ExtractedFilters,
  universalFilters: ResolvedFilters,
  chartConfig?: { frequency?: string }
): Record<string, unknown> {
  const runtimeFilters: Record<string, unknown> = {};
  
  // Extract from data_source
  if (dataSourceFilters.measure?.value) {
    runtimeFilters.measure = dataSourceFilters.measure.value;
  }
  if (dataSourceFilters.frequency?.value) {
    runtimeFilters.frequency = dataSourceFilters.frequency.value;
  }
  // ... more filter extraction
  
  // Universal filters override chart-level filters
  if (universalFilters.startDate) {
    runtimeFilters.startDate = universalFilters.startDate;
  }
  
  // SECURITY-CRITICAL: Only pass through practice_uids if they exist
  if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
    runtimeFilters.practiceUids = universalFilters.practiceUids;
  }
  
  return runtimeFilters;
}
```

**Problem:** Similar logic to base-handler but different output format

---

### 4. lib/services/analytics/dimension-expansion-renderer.ts (Dimension Converter)

**Lines 131-133 - DANGEROUS TYPE CASTING:**

```typescript
// ⚠️ TYPE SAFETY VIOLATION
const chartFilters = convertBaseFiltersToChartFilters(
  chartExecutionConfig.runtimeFilters as unknown as ResolvedBaseFilters
);
```

**Problem:**
- Uses `as unknown as` to force type conversion
- `runtimeFilters` is `Record<string, unknown>` not `ResolvedBaseFilters`
- Type system is broken here - compiler can't help us

**Lines 93-110 - Organization Resolution:**

```typescript
const resolvedFilters: ResolvedFilters = {
  ...baseFilters,
  practiceUids: (baseFilters.practiceUids as number[] | undefined) || [],
};

if (baseFilters.organizationId && typeof baseFilters.organizationId === 'string') {
  // DUPLICATE: Also done in FilterService
  const resolved = await resolveOrganizationFilter(
    baseFilters.organizationId,
    userContext,
    'dimension-expansion'
  );
  
  resolvedFilters.practiceUids = resolved.practiceUids;
  delete resolvedFilters.organizationId;
}
```

**Problem:** Duplicates FilterService logic (lib/services/dashboard-rendering/filter-service.ts lines 78-155)

---

## Organization Filter Resolution Duplication

### Location 1: lib/services/dashboard-rendering/filter-service.ts

**Method:** `validateOrganizationAccess()` + `resolveOrganizationPracticeUids()`  
**Lines:** 78-155 (78 lines)  
**Used By:** Dashboard rendering system

```typescript
class FilterService {
  private async validateOrganizationAccess(organizationId: string) {
    const accessService = createOrganizationAccessService(this.userContext);
    const accessInfo = await accessService.getAccessiblePracticeUids();
    
    // Super admin validation
    if (accessInfo.scope === 'all') { ... }
    
    // Provider validation  
    if (accessInfo.scope === 'own') { ... }
    
    // Org user validation
    if (accessInfo.scope === 'organization') { ... }
  }
  
  private async resolveOrganizationPracticeUids(organizationId: string) {
    const allOrganizations = await organizationHierarchyService.getAllOrganizations();
    return await organizationHierarchyService.getHierarchyPracticeUids(...);
  }
}
```

### Location 2: lib/utils/organization-filter-resolver.ts

**Function:** `resolveOrganizationFilter()` + `validateOrganizationAccess()`  
**Lines:** 60-186 (127 lines total, 85 lines for validation)  
**Used By:** Dimension expansion system

```typescript
export async function resolveOrganizationFilter(
  organizationId: string,
  userContext: UserContext,
  component: string
): Promise<ResolvedOrganizationFilter> {
  // Step 1: Validate (identical logic to FilterService)
  await validateOrganizationAccess(organizationId, userContext, component);
  
  // Step 2: Resolve (identical logic to FilterService)
  const allOrganizations = await organizationHierarchyService.getAllOrganizations();
  const practiceUids = await organizationHierarchyService.getHierarchyPracticeUids(...);
  
  return { practiceUids, organizationId };
}

async function validateOrganizationAccess(...) {
  // Lines 101-185
  // EXACT SAME LOGIC as FilterService.validateOrganizationAccess()
  // - Super admin check
  // - Provider denial
  // - Org user validation
  // - Same security logging
}
```

### Location 3: lib/services/analytics/dimension-expansion-renderer.ts

**Lines:** 93-110  
**Used By:** Dimension expansion rendering

```typescript
// Uses organization-filter-resolver.ts (Location 2)
if (baseFilters.organizationId && typeof baseFilters.organizationId === 'string') {
  const resolved = await resolveOrganizationFilter(
    baseFilters.organizationId,
    userContext,
    'dimension-expansion'
  );
  
  resolvedFilters.practiceUids = resolved.practiceUids;
  delete resolvedFilters.organizationId;
}
```

**TOTAL DUPLICATION:** ~163 lines of identical logic across 2 files

---

## Filter Flow Analysis

### Flow 1: Dashboard Rendering

```
DashboardUniversalFilters (API input)
    ↓
FilterService.validateAndResolve()
    ├─ Validate organization access (lines 78-155)
    └─ Resolve org → practiceUids
    ↓
ResolvedFilters (with practiceUids populated)
    ↓
ChartConfigBuilderService.buildRuntimeFilters()
    ├─ Extract from data_source
    ├─ Merge with universal filters
    └─ Build runtimeFilters object
    ↓
runtimeFilters: Record<string, unknown>
    ↓
BaseChartHandler.buildQueryParams()
    ├─ Extract date range
    ├─ Handle practiceUids → advanced_filters (lines 208-256)
    ├─ Merge chart advanced filters
    └─ Build AnalyticsQueryParams
    ↓
AnalyticsQueryParams (final SQL format)
```

**Conversions:** 3 transformations, 3 different services

---

### Flow 2: Dimension Expansion

```
BaseFilters (API input - dimension expansion request)
    ↓
dimension-expansion-renderer.ts (lines 93-110)
    ├─ Convert to ResolvedFilters
    ├─ Resolve organization (duplicate validation)
    └─ Populate practiceUids
    ↓
ResolvedFilters
    ↓
ChartConfigBuilderService.buildSingleChartConfig()
    ├─ Extract filters
    ├─ Build runtimeFilters
    └─ Return config
    ↓
runtimeFilters: Record<string, unknown>
    ↓
⚠️ DANGEROUS CAST (line 132):
convertBaseFiltersToChartFilters(
  runtimeFilters as unknown as ResolvedBaseFilters  // Type safety broken!
)
    ↓
ChartFilter[]
    ↓
dimension-discovery-service.getDimensionValues()
```

**Conversions:** 4 transformations with 1 dangerous type cast

---

## Type Safety Issues

### Issue 1: Type Casting in Dimension Expansion

**File:** `lib/services/analytics/dimension-expansion-renderer.ts`  
**Line:** 132

```typescript
const chartFilters = convertBaseFiltersToChartFilters(
  chartExecutionConfig.runtimeFilters as unknown as ResolvedBaseFilters
);
//                                    ↑↑↑↑↑↑↑↑↑↑
//                            THIS IS DANGEROUS!
```

**Why It's Dangerous:**
- `runtimeFilters` is `Record<string, unknown>`
- `ResolvedBaseFilters` expects specific typed properties
- Compiler protection completely bypassed
- Runtime errors possible if structure doesn't match

### Issue 2: Inconsistent practiceUids Handling

**Location 1:** base-handler.ts lines 208-256 (49 lines)
```typescript
if (config.practiceUids && Array.isArray(config.practiceUids)) {
  if (config.practiceUids.length === 0) {
    // Fail-closed security
    const practiceUidFilter: ChartFilter = {
      field: 'practice_uid',
      operator: 'in',
      value: [-1], // Impossible value
    };
    queryParams.advanced_filters.push(practiceUidFilter);
  } else {
    // Normal case
    const practiceUidFilter: ChartFilter = {
      field: 'practice_uid',
      operator: 'in',
      value: config.practiceUids,
    };
    queryParams.advanced_filters.push(practiceUidFilter);
  }
}
```

**Location 2:** chart-config-builder.ts lines 174-176 (3 lines)
```typescript
if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
  runtimeFilters.practiceUids = universalFilters.practiceUids;
}
```

**Location 3:** filter-converters.ts lines 127-133 (7 lines)
```typescript
if (Array.isArray(baseFilters.practiceUids) && baseFilters.practiceUids.length > 0) {
  filters.push({
    field: 'practice_uid',
    operator: 'in',
    value: baseFilters.practiceUids,
  });
}
```

**Problem:** Same logic repeated 3 times with slight variations

---

## Duplicate Organization Filter Resolution

### Implementation 1: FilterService (Dashboard System)

**File:** `lib/services/dashboard-rendering/filter-service.ts`  
**Lines:** 78-185 (107 lines)

```typescript
class FilterService {
  private async validateOrganizationAccess(organizationId: string) {
    const accessService = createOrganizationAccessService(this.userContext);
    const accessInfo = await accessService.getAccessiblePracticeUids();
    
    if (accessInfo.scope === 'all') { return; }
    if (accessInfo.scope === 'own') { throw Error; }
    if (accessInfo.scope === 'organization') {
      const canAccess = this.userContext.accessible_organizations.some(...);
      if (!canAccess) { throw Error; }
    }
    if (accessInfo.scope === 'none') { throw Error; }
  }
  
  private async resolveOrganizationPracticeUids(organizationId: string) {
    const allOrganizations = await organizationHierarchyService.getAllOrganizations();
    return await organizationHierarchyService.getHierarchyPracticeUids(...);
  }
}
```

### Implementation 2: organization-filter-resolver.ts (Dimension System)

**File:** `lib/utils/organization-filter-resolver.ts`  
**Lines:** 60-186 (127 lines total)

```typescript
export async function resolveOrganizationFilter(...) {
  await validateOrganizationAccess(organizationId, userContext, component);
  
  const allOrganizations = await organizationHierarchyService.getAllOrganizations();
  const practiceUids = await organizationHierarchyService.getHierarchyPracticeUids(...);
  
  return { practiceUids, organizationId };
}

async function validateOrganizationAccess(...) {
  // Lines 101-185 (85 lines)
  // IDENTICAL LOGIC to FilterService.validateOrganizationAccess()
  const accessService = createOrganizationAccessService(userContext);
  const accessInfo = await accessService.getAccessiblePracticeUids();
  
  if (accessInfo.scope === 'all') { return; }
  if (accessInfo.scope === 'own') { throw Error; }
  if (accessInfo.scope === 'organization') {
    const canAccess = userContext.accessible_organizations.some(...);
    if (!canAccess) { throw Error; }
  }
  if (accessInfo.scope === 'none') { throw Error; }
}
```

**ANALYSIS:** Code is 95% identical, just different logging component names

**DUPLICATION:** ~85 lines of validation + 20 lines of resolution = **~105 lines duplicated**

---

## Conversion Function Usage Map

### convertBaseFiltersToChartFilters (filter-converters.ts)

**Used By:**
1. `lib/services/analytics/dimension-expansion-renderer.ts` (line 131)
   - Input: `runtimeFilters as unknown as ResolvedBaseFilters` ⚠️ UNSAFE
   - Output: `ChartFilter[]`
   - Purpose: Pass filters to dimension discovery

**Usage Count:** 1 location (but DANGEROUS)

---

### convertBaseFiltersToRuntimeFilters (filter-converters.ts)

**Used By:**
- ❓ Need to verify if used at all

**Potential Usage:** May be dead code (to be verified)

---

### buildQueryParams (base-handler.ts)

**Used By:**
- All chart handlers (7 handlers inherit from BaseChartHandler)
- Called in `fetchData()` method (base-handler.ts line 56)

**Usage Count:** Used by ENTIRE handler system

---

### buildRuntimeFilters (chart-config-builder.ts)

**Used By:**
- `ChartConfigBuilderService.buildSingleChartConfig()` (line 69)
- Used by dashboard rendering AND dimension expansion

**Usage Count:** 2 major systems

---

## Root Cause Analysis

### Why Do We Have 5 Filter Formats?

**Historical Evolution:**
1. **Dashboard API** needs `DashboardUniversalFilters` (user-facing)
2. **Organization resolution** adds `practiceUids` → `ResolvedFilters`
3. **Query builder** needs `ChartFilter[]` (structured filters)
4. **Chart orchestrator** needs `runtimeFilters` (flat object)
5. **SQL builder** needs `AnalyticsQueryParams` (snake_case DB format)

Each layer added its own format **without consolidating previous layers**.

---

## Proposed Solution

### Single Filter Pipeline

```
UniversalChartFilters (input)
    ↓ [FilterBuilderService]
ChartExecutionFilters (normalized)
    ↓ [FilterBuilderService]
AnalyticsQueryParams (final)
```

**Only 3 types instead of 5:**
1. **Input:** `UniversalChartFilters` (external API)
2. **Internal:** `ChartExecutionFilters` (normalized internal format)
3. **Output:** `AnalyticsQueryParams` (SQL builder format)

### New FilterBuilderService

```typescript
/**
 * Filter Builder Service
 * Single responsibility: Convert and validate filters
 */
class FilterBuilderService {
  constructor(private userContext: UserContext) {}
  
  /**
   * Build chart execution filters from universal filters
   * Handles: validation, organization resolution, normalization
   */
  async buildExecutionFilters(
    universalFilters: UniversalChartFilters,
    chartConfig: ChartConfig
  ): Promise<ChartExecutionFilters> {
    // 1. Validate organization access (if present)
    // 2. Resolve organization → practiceUids
    // 3. Merge with chart config
    // 4. Return normalized filters
  }
  
  /**
   * Convert execution filters to analytics query params
   * Handles: date range extraction, practiceUids→advanced_filters, etc.
   */
  buildQueryParams(
    filters: ChartExecutionFilters,
    chartConfig: ChartConfig
  ): AnalyticsQueryParams {
    // Single implementation replacing 3 current locations
  }
  
  /**
   * Resolve organization filter with RBAC validation
   * Shared by dashboard AND dimension expansion
   */
  private async resolveOrganizationFilter(
    organizationId: string
  ): Promise<number[]> {
    // Single implementation replacing FilterService + organization-filter-resolver
  }
}
```

---

## Consolidation Plan

### Step 1: Create FilterBuilderService (New File)
**File:** `lib/services/filters/filter-builder-service.ts`

**Responsibilities:**
- ✅ Organization validation (from FilterService + organization-filter-resolver)
- ✅ Organization resolution (from FilterService + organization-filter-resolver)
- ✅ practiceUids handling (from base-handler + chart-config-builder + filter-converters)
- ✅ Date range extraction (from base-handler)
- ✅ Advanced filter merging (from base-handler)
- ✅ Type-safe transformations (no casting)

**Lines:** ~200-250 (consolidates ~400 lines from 4 locations)

---

### Step 2: Update Type Hierarchy

**New Types:**
```typescript
// lib/types/filters.ts (NEW FILE)

/** Universal chart filters (external API input) */
export interface UniversalChartFilters {
  startDate?: string;
  endDate?: string;
  dateRangePreset?: string;
  organizationId?: string;
  practiceUids?: number[];
  providerName?: string;
  measure?: string;
  frequency?: string;
  advancedFilters?: ChartFilter[];
}

/** Normalized chart execution filters (internal) */
export interface ChartExecutionFilters {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  practiceUids: number[]; // Always resolved (empty array if none)
  measure?: string;
  frequency?: string;
  advancedFilters: ChartFilter[];
}
```

**Benefit:** No more `Record<string, unknown>` or type casting

---

### Step 3: Refactor Call Sites

**Update these files to use FilterBuilderService:**
1. `lib/services/chart-handlers/base-handler.ts`
   - Replace buildQueryParams() (lines 161-289)
   - Call filterBuilderService.buildQueryParams()
   
2. `lib/services/dashboard-rendering/chart-config-builder.ts`
   - Replace buildRuntimeFilters() (lines 130-179)
   - Call filterBuilderService.buildExecutionFilters()
   
3. `lib/services/analytics/dimension-expansion-renderer.ts`
   - Replace organization resolution (lines 93-110)
   - Replace filter conversion (lines 131-133)
   - Call filterBuilderService.buildExecutionFilters()

4. `lib/utils/filter-converters.ts`
   - Delete both conversion functions
   - File becomes empty → DELETE

---

### Step 4: Delete Duplicates

**Files to DELETE:**
- `lib/utils/filter-converters.ts` (after migration complete)
- `lib/utils/organization-filter-resolver.ts` (consolidated into FilterBuilderService)

**Files to UPDATE:**
- `lib/services/dashboard-rendering/filter-service.ts` (delegate to FilterBuilderService)

---

## Benefits of Consolidation

### Code Reduction
| Component | Current | After | Savings |
|-----------|---------|-------|---------|
| Organization validation | ~170 lines (2x ~85) | ~85 lines | 85 lines |
| Organization resolution | ~40 lines (2x ~20) | ~20 lines | 20 lines |
| practiceUids handling | ~60 lines (3x ~20) | ~20 lines | 40 lines |
| Filter conversions | ~100 lines (2 functions) | 0 lines | 100 lines |
| base-handler buildQueryParams | ~130 lines | ~20 lines | 110 lines |
| **TOTAL** | **~500 lines** | **~145 lines** | **~355 lines** |

### Type Safety Improvements
- ❌ Remove `as unknown as` casts
- ✅ Strong typing throughout pipeline
- ✅ Compiler catches filter structure mismatches
- ✅ IDE autocomplete for filter properties

### Maintainability
- Single place to update filter logic
- Easier to add new filter types
- Clear filter flow documentation
- Reduced cognitive load

---

## Implementation Sequence

### Phase 2.1: Create Foundation (Todos 1-5)
1. ✅ Map all filter conversion locations (this document)
2. ⏳ Document filter flow (completing now)
3. ⏳ Analyze filter-converters.ts
4. ⏳ Identify duplicate practiceUids logic  
5. ⏳ Design unified filter types

### Phase 2.2: Build Service (Todos 6-7)
6. ⏳ Create FilterBuilderService
7. ⏳ Refactor base-handler.ts

### Phase 2.3: Consolidate (Todos 8-13)
8. ⏳ Refactor chart-config-builder.ts
9. ⏳ Refactor dimension-expansion-renderer.ts
10. ⏳ Remove duplicate org resolution
11. ⏳ Eliminate type casting
12. ⏳ Delete filter-converters.ts
13. ⏳ Update all usages

### Phase 2.4: QA (Todos 14-18)
14. ⏳ Run pnpm tsc
15. ⏳ Run pnpm lint
16. ⏳ Test dashboard rendering
17. ⏳ Test dimension expansion
18. ⏳ Test all chart types

### Phase 2.5: Documentation (Todos 19-20)
19. ⏳ Document changes
20. ⏳ Update architecture docs

---

## Key Files to Modify

### Core Service (NEW)
- `lib/services/filters/filter-builder-service.ts` (CREATE)
- `lib/types/filters.ts` (CREATE)

### Refactor (MODIFY)
- `lib/services/chart-handlers/base-handler.ts` (simplify buildQueryParams)
- `lib/services/dashboard-rendering/chart-config-builder.ts` (use new service)
- `lib/services/dashboard-rendering/filter-service.ts` (delegate to new service)
- `lib/services/analytics/dimension-expansion-renderer.ts` (remove duplication)

### Delete (REMOVE)
- `lib/utils/filter-converters.ts` (consolidate into service)
- `lib/utils/organization-filter-resolver.ts` (consolidate into service)

---

**Status:** Ready to proceed with implementation

