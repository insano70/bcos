# FilterBuilderService Migration Guide

**For Developers:** How to use the new type-safe filter system

---

## Quick Start

```typescript
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import type { UniversalChartFilters } from '@/lib/types/filters';

// Create service with user context
const filterBuilder = createFilterBuilderService(userContext);

// Build execution filters
const executionFilters = await filterBuilder.buildExecutionFilters(
  { startDate: '2024-01-01', endDate: '2024-12-31', organizationId: 'org-123' },
  { component: 'my-feature' }
);

// Convert to ChartFilter array if needed
const chartFilters = filterBuilder.toChartFilterArray(universalFilters);
```

---

## When to Use

### ✅ Use FilterBuilderService When:
- Building filters for analytics queries
- Resolving organization filters to practice UIDs
- Converting between filter formats
- Need type-safe filter operations

### ❌ Don't Use When:
- Simple property access (just use the object)
- Client-side filtering (not available on client)
- Non-analytics contexts

---

## API Reference

### createFilterBuilderService(userContext)

Factory function to create service instance.

```typescript
const filterBuilder = createFilterBuilderService(userContext);
```

---

### buildExecutionFilters(universalFilters, options)

Main method - converts and validates filters.

```typescript
const executionFilters = await filterBuilder.buildExecutionFilters(
  {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    organizationId: 'org-123',
    measure: 'Charges',
    frequency: 'Monthly',
  },
  {
    component: 'dashboard-rendering',
    failClosedSecurity: true,
  }
);

// Returns: ChartExecutionFilters
// {
//   dateRange: { startDate: '2024-01-01', endDate: '2024-12-31' },
//   practiceUids: [100, 101], // Resolved from org
//   measure: 'Charges',
//   frequency: 'Monthly',
//   advancedFilters: []
// }
```

---

### toChartFilterArray(universalFilters)

Convert to ChartFilter[] format (for dimension discovery, validation).

```typescript
const chartFilters = filterBuilder.toChartFilterArray({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  practiceUids: [100, 101],
  measure: 'Charges',
});

// Returns: ChartFilter[]
// [
//   { field: 'date', operator: 'gte', value: '2024-01-01' },
//   { field: 'date', operator: 'lte', value: '2024-12-31' },
//   { field: 'practice_uid', operator: 'in', value: [100, 101] },
//   { field: 'measure', operator: 'eq', value: 'Charges' }
// ]
```

---

### fromChartFilterArray(filters, component)

Convert from ChartFilter[] to UniversalChartFilters.

```typescript
const universalFilters = filterBuilder.fromChartFilterArray(
  [
    { field: 'date', operator: 'gte', value: '2024-01-01' },
    { field: 'practice_uid', operator: 'in', value: [100] },
  ],
  'my-component'
);

// Returns: UniversalChartFilters
// { startDate: '2024-01-01', practiceUids: [100] }
```

---

### mergeFilters(universalFilters, chartFilters)

Merge dashboard-level and chart-level filters.

```typescript
const merged = filterBuilder.mergeFilters(
  { startDate: '2024-06-01' }, // Universal (overrides)
  { startDate: '2024-01-01', measure: 'Charges' } // Chart (base)
);

// Returns: { startDate: '2024-06-01', measure: 'Charges' }
```

---

## Migration Patterns

### Pattern 1: Replace Manual Organization Resolution

**Before:**
```typescript
if (baseFilters.organizationId) {
  const resolved = await resolveOrganizationFilter(
    baseFilters.organizationId,
    userContext,
    'my-component'
  );
  filters.practiceUids = resolved.practiceUids;
}
```

**After:**
```typescript
const filterBuilder = createFilterBuilderService(userContext);
const executionFilters = await filterBuilder.buildExecutionFilters(
  baseFilters,
  { component: 'my-component' }
);
// practiceUids already resolved in executionFilters.practiceUids
```

---

### Pattern 2: Replace filter-converters.ts

**Before:**
```typescript
import { convertBaseFiltersToChartFilters } from '@/lib/utils/filter-converters';

const chartFilters = convertBaseFiltersToChartFilters(baseFilters);
```

**After:**
```typescript
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';

const filterBuilder = createFilterBuilderService(userContext);
const chartFilters = filterBuilder.toChartFilterArray(baseFilters);
```

---

### Pattern 3: Type-Safe Filter Building

**Before:**
```typescript
const filters: Record<string, unknown> = {};
filters.startDate = something.startDate; // No type checking
```

**After:**
```typescript
const filters: UniversalChartFilters = {};
if (typeof something.startDate === 'string') {
  filters.startDate = something.startDate; // Type-safe
}
```

---

## Type Guards

Use type guards for conditional logic:

```typescript
import {
  hasOrganizationFilter,
  hasPracticeUidsFilter,
  hasDateRangeFilter,
} from '@/lib/types/filters';

if (hasOrganizationFilter(filters)) {
  // TypeScript knows: filters.organizationId is string
  console.log(`Filtering by org: ${filters.organizationId}`);
}

if (hasPracticeUidsFilter(filters)) {
  // TypeScript knows: filters.practiceUids is number[]
  console.log(`Filtering ${filters.practiceUids.length} practices`);
}
```

---

## Common Scenarios

### Scenario 1: Dashboard Rendering

```typescript
const filterBuilder = createFilterBuilderService(userContext);

const executionFilters = await filterBuilder.buildExecutionFilters(
  dashboardUniversalFilters,
  { component: 'dashboard-rendering' }
);

// Use executionFilters.practiceUids for chart queries
```

### Scenario 2: Dimension Expansion

```typescript
const filterBuilder = createFilterBuilderService(userContext);

// Build execution filters (validates & resolves organization)
const executionFilters = await filterBuilder.buildExecutionFilters(
  baseFilters,
  { component: 'dimension-expansion' }
);

// Convert to ChartFilter[] for dimension discovery
const chartFilters = filterBuilder.toChartFilterArray({
  ...baseFilters,
  practiceUids: executionFilters.practiceUids, // Use resolved
  startDate: executionFilters.dateRange.startDate,
  endDate: executionFilters.dateRange.endDate,
});
```

### Scenario 3: Chart Handler

```typescript
// In fetchData() or buildQueryParams()
const universalFilters: UniversalChartFilters = {};

if (typeof config.startDate === 'string') universalFilters.startDate = config.startDate;
if (typeof config.endDate === 'string') universalFilters.endDate = config.endDate;
if (Array.isArray(config.practiceUids)) universalFilters.practiceUids = config.practiceUids;

// Use for query building
const { startDate, endDate } = getDateRange(
  universalFilters.dateRangePreset,
  universalFilters.startDate,
  universalFilters.endDate
);
```

---

## Error Handling

### Organization Access Errors

```typescript
try {
  const executionFilters = await filterBuilder.buildExecutionFilters(
    { organizationId: 'org-123' },
    { component: 'my-feature' }
  );
} catch (error) {
  if (error.message.includes('Access denied')) {
    // User doesn't have permission
    // Show error or fall back to default filters
  }
}
```

**Common Error Messages:**
- `"Provider-level users cannot filter by organization"`
- `"You do not have permission to filter by organization {id}"`
- `"You do not have analytics permissions"`

---

## Best Practices

### DO ✅

```typescript
// Use type guards
if (hasOrganizationFilter(filters)) {
  // TypeScript enforcement
}

// Build filters type-safely
const filters: UniversalChartFilters = {};
if (typeof value === 'string') filters.startDate = value;

// Use FilterBuilderService for organization resolution
const executionFilters = await filterBuilder.buildExecutionFilters(...);
```

### DON'T ❌

```typescript
// Don't use type casting
const filters = something as unknown as SomeType;

// Don't use Record<string, unknown> for filters
const filters: Record<string, unknown> = {};

// Don't manually resolve organizations
const org = await organizationHierarchyService.getHierarchyPracticeUids(...);
```

---

## Files Reference

- `lib/types/filters.ts` - Filter type definitions
- `lib/services/filters/filter-builder-service.ts` - Service implementation
- `tests/unit/services/filter-builder-service.test.ts` - Unit tests
- `tests/unit/types/filter-type-guards.test.ts` - Type guard tests

---

**Last Updated:** November 20, 2025

