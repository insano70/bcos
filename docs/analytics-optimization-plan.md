# Analytics System Optimization - Implementation Plan

**Date:** November 19, 2024  
**Based On:** DIMENSION_EXPANSION_OPTIMIZATION_REPORT.md  
**Status:** Ready for Implementation  
**Total Effort:** 35-45 hours over 6 weeks

---

## Overview

This plan implements systematic refactoring to reduce code duplication, improve maintainability, and enforce Single Responsibility Principle across the analytics system. All changes maintain 100% backward compatibility with existing functionality.

### Success Criteria

- ✅ Zero breaking changes to existing functionality
- ✅ All tests pass (`pnpm test`)
- ✅ TypeScript compilation successful (`pnpm tsc`)
- ✅ Linting passes (`pnpm lint`)
- ✅ Performance maintained or improved
- ✅ 20-30% reduction in code duplication
- ✅ Improved developer velocity

---

## Phase 1: Extract Query Building Utilities (Week 1)

**Goal:** Eliminate duplicated query building logic across BaseChartHandler, ChartConfigBuilderService, and QueryExecutor.

**Effort:** 8-10 hours  
**Risk:** Medium (many call sites)  
**Priority:** HIGH

### Step 1.1: Create Query Filter Builder Utility

**New File:** `lib/utils/query-builders/query-filter-builder.ts`

**Purpose:** Centralize all filter building logic with consistent security patterns.

```typescript
/**
 * Query Filter Builder
 * 
 * Centralizes filter construction with consistent security patterns.
 * Used by chart handlers, config builders, and query executors.
 */

import { log } from '@/lib/logger';
import type { ChartFilter } from '@/lib/types/analytics';

export class QueryFilterBuilder {
  /**
   * Build practice_uid filter with fail-closed security
   * 
   * SECURITY: Empty array = organization has no practices = fail-closed (no data)
   * 
   * @param practiceUids - Array of practice UIDs from organization
   * @returns ChartFilter or null if not applicable
   */
  static buildPracticeFilter(practiceUids: number[] | undefined): ChartFilter | null {
    if (!practiceUids || !Array.isArray(practiceUids)) return null;
    
    // FAIL-CLOSED: Empty array means no access
    if (practiceUids.length === 0) {
      log.security('Empty practiceUids - fail-closed', 'high', {
        reason: 'organization_has_no_practices',
        filterType: 'practice_uid',
        failedClosed: true,
      });
      
      // Use impossible value to ensure query returns no results
      return {
        field: 'practice_uid',
        operator: 'in',
        value: [-1], // Impossible practice_uid value
      };
    }
    
    return {
      field: 'practice_uid',
      operator: 'in',
      value: practiceUids,
    };
  }

  /**
   * Build date range filters
   * 
   * @param startDate - Start date (ISO format)
   * @param endDate - End date (ISO format)
   * @param dateField - Column name for date field (default: 'date_index')
   * @returns Array of date filters (may be empty)
   */
  static buildDateFilters(
    startDate: string | undefined,
    endDate: string | undefined,
    dateField: string = 'date_index'
  ): ChartFilter[] {
    const filters: ChartFilter[] = [];
    
    if (startDate) {
      filters.push({
        field: dateField,
        operator: 'gte',
        value: startDate,
      });
    }
    
    if (endDate) {
      filters.push({
        field: dateField,
        operator: 'lte',
        value: endDate,
      });
    }
    
    return filters;
  }

  /**
   * Build measure filter
   * 
   * @param measure - Measure type (e.g., 'total_charges')
   * @returns ChartFilter or null
   */
  static buildMeasureFilter(measure: string | undefined): ChartFilter | null {
    return measure
      ? {
          field: 'measure',
          operator: 'eq',
          value: measure,
        }
      : null;
  }

  /**
   * Build frequency filter
   * 
   * @param frequency - Frequency type (e.g., 'Monthly')
   * @param timePeriodField - Column name for frequency (default: 'frequency')
   * @returns ChartFilter or null
   */
  static buildFrequencyFilter(
    frequency: string | undefined,
    timePeriodField: string = 'frequency'
  ): ChartFilter | null {
    return frequency
      ? {
          field: timePeriodField,
          operator: 'eq',
          value: frequency,
        }
      : null;
  }

  /**
   * Build provider filter
   * 
   * @param providerName - Provider name
   * @returns ChartFilter or null
   */
  static buildProviderFilter(providerName: string | undefined): ChartFilter | null {
    return providerName
      ? {
          field: 'provider_name',
          operator: 'eq',
          value: providerName,
        }
      : null;
  }

  /**
   * Process and validate advanced filters
   * 
   * @param advancedFilters - Raw advanced filters array
   * @returns Standardized ChartFilter array
   */
  static processAdvancedFilters(advancedFilters: unknown[]): ChartFilter[] {
    if (!Array.isArray(advancedFilters)) return [];
    
    return advancedFilters
      .filter((filter): filter is ChartFilter => {
        return (
          typeof filter === 'object' &&
          filter !== null &&
          'field' in filter &&
          'value' in filter
        );
      })
      .map((filter) => ({
        field: filter.field,
        operator: filter.operator || 'eq',
        value: filter.value,
      }));
  }

  /**
   * Combine multiple filters into a single array
   * Filters out null values and flattens arrays
   * 
   * @param filters - Array of filters or filter arrays (may include nulls)
   * @returns Flattened array of ChartFilters
   */
  static combineFilters(
    ...filters: (ChartFilter | ChartFilter[] | null | undefined)[]
  ): ChartFilter[] {
    return filters.flat().filter((f): f is ChartFilter => f !== null && f !== undefined);
  }
}
```

**Validation:**
```bash
# Create file
# Run type check
pnpm tsc --noEmit lib/utils/query-builders/query-filter-builder.ts

# Run linter
pnpm lint lib/utils/query-builders/query-filter-builder.ts
```

---

### Step 1.2: Create Query Params Builder Utility

**New File:** `lib/utils/query-builders/query-params-builder.ts`

```typescript
/**
 * Query Params Builder
 * 
 * Builds AnalyticsQueryParams from various config sources.
 * Consolidates param building logic from chart handlers.
 */

import { QUERY_LIMITS } from '@/lib/constants/analytics';
import type { AnalyticsQueryParams } from '@/lib/types/analytics';
import { getDateRange } from '@/lib/utils/date-presets';
import { QueryFilterBuilder } from './query-filter-builder';

export class QueryParamsBuilder {
  /**
   * Build analytics query params from chart config
   * 
   * Replaces logic in BaseChartHandler.buildQueryParams() (lines 163-291)
   * 
   * @param config - Chart configuration object
   * @param dataSourceType - Optional type override
   * @returns Complete AnalyticsQueryParams object
   */
  static fromChartConfig(
    config: Record<string, unknown>,
    dataSourceType?: 'measure-based' | 'table-based'
  ): AnalyticsQueryParams {
    // Calculate date range from preset or explicit dates
    const { startDate, endDate } = getDateRange(
      config.dateRangePreset as string | undefined,
      config.startDate as string | undefined,
      config.endDate as string | undefined
    );

    // Base params (required)
    const params: AnalyticsQueryParams = {
      data_source_id: config.dataSourceId as number,
      start_date: startDate,
      end_date: endDate,
      limit: (config.limit as number) || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
    };

    // Add data source type if specified
    if (dataSourceType) {
      params.data_source_type = dataSourceType;
    }

    // Add optional measure/frequency
    if (config.measure) {
      params.measure = config.measure as import('@/lib/types/analytics').MeasureType;
    }
    if (config.frequency) {
      params.frequency = config.frequency as import('@/lib/types/analytics').FrequencyType;
    }

    // Add single practice_uid if present
    if (config.practice) {
      params.practice = config.practice as string;
    }
    if (config.practiceUid) {
      const practiceUid =
        typeof config.practiceUid === 'string'
          ? parseInt(config.practiceUid, 10)
          : (config.practiceUid as number);
      if (!Number.isNaN(practiceUid)) {
        params.practice_uid = practiceUid;
      }
    }

    // Handle dashboard universal filter: practiceUids array
    if (config.practiceUids && Array.isArray(config.practiceUids)) {
      const practiceFilter = QueryFilterBuilder.buildPracticeFilter(
        config.practiceUids as number[]
      );
      if (practiceFilter) {
        params.advanced_filters = params.advanced_filters || [];
        params.advanced_filters.push(practiceFilter);
      }
    }

    // Add provider filter
    if (config.providerName) {
      params.provider_name = config.providerName as string;
    }

    // Merge chart-specific advanced filters
    if (config.advancedFilters) {
      const chartFilters = QueryFilterBuilder.processAdvancedFilters(
        config.advancedFilters as unknown[]
      );
      params.advanced_filters = params.advanced_filters || [];
      params.advanced_filters.push(...chartFilters);
    }

    // Add specialized params
    if (config.calculatedField) {
      params.calculated_field = config.calculatedField as string;
    }
    if (config.multipleSeries) {
      params.multiple_series = config.multipleSeries as import('@/lib/types/analytics').MultipleSeriesConfig[];
    }
    if (config.periodComparison) {
      params.period_comparison = config.periodComparison as import('@/lib/types/analytics').PeriodComparisonConfig;
    }

    return params;
  }
}
```

**Validation:**
```bash
pnpm tsc --noEmit lib/utils/query-builders/query-params-builder.ts
pnpm lint lib/utils/query-builders/query-params-builder.ts
```

---

### Step 1.3: Create Index File

**New File:** `lib/utils/query-builders/index.ts`

```typescript
/**
 * Query Builders - Centralized Utilities
 * 
 * Exports utilities for building query filters and parameters.
 * Used throughout analytics system for consistent query construction.
 */

export { QueryFilterBuilder } from './query-filter-builder';
export { QueryParamsBuilder } from './query-params-builder';
```

---

### Step 1.4: Update BaseChartHandler to Use Utilities

**File:** `lib/services/chart-handlers/base-handler.ts`

**Changes:**

1. **Add import** (line ~13):
```typescript
import { QueryParamsBuilder } from '@/lib/utils/query-builders';
```

2. **Replace buildQueryParams() method** (lines 163-291):
```typescript
/**
 * Build analytics query parameters from chart config
 * Delegates to QueryParamsBuilder utility
 */
protected buildQueryParams(config: Record<string, unknown>): AnalyticsQueryParams {
  const dataSourceType = this.getDataSourceType();
  return QueryParamsBuilder.fromChartConfig(config, dataSourceType);
}
```

**Result:** 128 lines reduced to 5 lines + utility reuse.

**Validation:**
```bash
pnpm tsc --noEmit lib/services/chart-handlers/base-handler.ts
pnpm lint lib/services/chart-handlers/base-handler.ts
```

---

### Step 1.5: Update ChartConfigBuilderService

**File:** `lib/services/dashboard-rendering/chart-config-builder.ts`

**Changes:**

1. **Add import** (line ~14):
```typescript
import { QueryFilterBuilder } from '@/lib/utils/query-builders';
```

2. **Update buildRuntimeFilters() method** (lines 130-179):
```typescript
private buildRuntimeFilters(
  dataSourceFilters: ReturnType<typeof this.extractDataSourceFilters>,
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
  } else if (chartConfig?.frequency) {
    runtimeFilters.frequency = chartConfig.frequency;
  }
  if (dataSourceFilters.practice?.value) {
    runtimeFilters.practiceUids = [dataSourceFilters.practice.value];
  }
  if (dataSourceFilters.startDate?.value) {
    runtimeFilters.startDate = dataSourceFilters.startDate.value;
  }
  if (dataSourceFilters.endDate?.value) {
    runtimeFilters.endDate = dataSourceFilters.endDate.value;
  }

  // Advanced filters
  if (Array.isArray(dataSourceFilters.advancedFilters) && dataSourceFilters.advancedFilters.length > 0) {
    runtimeFilters.advancedFilters = dataSourceFilters.advancedFilters;
  }

  // Universal filters override chart-level filters
  if (universalFilters.startDate) {
    runtimeFilters.startDate = universalFilters.startDate;
  }
  if (universalFilters.endDate) {
    runtimeFilters.endDate = universalFilters.endDate;
  }

  // Use utility for practice filter (with fail-closed security)
  if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
    runtimeFilters.practiceUids = universalFilters.practiceUids;
  }

  return runtimeFilters;
}
```

**Validation:**
```bash
pnpm tsc --noEmit lib/services/dashboard-rendering/chart-config-builder.ts
pnpm lint lib/services/dashboard-rendering/chart-config-builder.ts
```

---

### Step 1.6: Update QueryExecutor

**File:** `lib/services/analytics/query-executor.ts`

**Changes:**

1. **Add import** (line ~27):
```typescript
import { QueryFilterBuilder } from '@/lib/utils/query-builders';
```

2. **Update filter building in executeLegacyQuery()** (lines 150-192):

Replace manual filter building with utility calls:

```typescript
// Build filters from params using utilities
const filters: ChartFilter[] = [];

// Use QueryFilterBuilder utilities
const measureFilter = QueryFilterBuilder.buildMeasureFilter(params.measure);
if (measureFilter) filters.push(measureFilter);

const frequencyFilter = QueryFilterBuilder.buildFrequencyFilter(
  params.frequency,
  columnMappings.timePeriodField
);
if (frequencyFilter) filters.push(frequencyFilter);

// Practice filters
if (params.practice) {
  filters.push({ field: 'practice', operator: 'eq', value: params.practice });
}
if (params.practice_primary) {
  filters.push({ field: 'practice_primary', operator: 'eq', value: params.practice_primary });
}
if (params.practice_uid) {
  filters.push({ field: 'practice_uid', operator: 'eq', value: params.practice_uid });
}

// Provider filter
const providerFilter = QueryFilterBuilder.buildProviderFilter(params.provider_name);
if (providerFilter) filters.push(providerFilter);

// Date filters
const dateFilters = QueryFilterBuilder.buildDateFilters(
  params.start_date,
  params.end_date,
  columnMappings.dateField
);
filters.push(...dateFilters);

// Process advanced filters
if (params.advanced_filters) {
  const advancedFilters = QueryFilterBuilder.processAdvancedFilters(params.advanced_filters);
  filters.push(...advancedFilters);
}
```

**Validation:**
```bash
pnpm tsc --noEmit lib/services/analytics/query-executor.ts
pnpm lint lib/services/analytics/query-executor.ts
```

---

### Step 1.7: Write Unit Tests

**New File:** `tests/unit/utils/query-builders/query-filter-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { QueryFilterBuilder } from '@/lib/utils/query-builders';

describe('QueryFilterBuilder', () => {
  describe('buildPracticeFilter', () => {
    it('should return null for undefined practiceUids', () => {
      const result = QueryFilterBuilder.buildPracticeFilter(undefined);
      expect(result).toBeNull();
    });

    it('should return fail-closed filter for empty array', () => {
      const result = QueryFilterBuilder.buildPracticeFilter([]);
      expect(result).toEqual({
        field: 'practice_uid',
        operator: 'in',
        value: [-1],
      });
    });

    it('should return valid filter for populated array', () => {
      const result = QueryFilterBuilder.buildPracticeFilter([1, 2, 3]);
      expect(result).toEqual({
        field: 'practice_uid',
        operator: 'in',
        value: [1, 2, 3],
      });
    });
  });

  describe('buildDateFilters', () => {
    it('should return empty array when no dates provided', () => {
      const result = QueryFilterBuilder.buildDateFilters(undefined, undefined);
      expect(result).toEqual([]);
    });

    it('should build start date filter only', () => {
      const result = QueryFilterBuilder.buildDateFilters('2024-01-01', undefined);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        field: 'date_index',
        operator: 'gte',
        value: '2024-01-01',
      });
    });

    it('should build both date filters', () => {
      const result = QueryFilterBuilder.buildDateFilters('2024-01-01', '2024-12-31');
      expect(result).toHaveLength(2);
    });

    it('should use custom date field', () => {
      const result = QueryFilterBuilder.buildDateFilters('2024-01-01', undefined, 'custom_date');
      expect(result[0]?.field).toBe('custom_date');
    });
  });

  describe('buildMeasureFilter', () => {
    it('should return null for undefined measure', () => {
      const result = QueryFilterBuilder.buildMeasureFilter(undefined);
      expect(result).toBeNull();
    });

    it('should build measure filter', () => {
      const result = QueryFilterBuilder.buildMeasureFilter('total_charges');
      expect(result).toEqual({
        field: 'measure',
        operator: 'eq',
        value: 'total_charges',
      });
    });
  });

  describe('combineFilters', () => {
    it('should combine multiple filters', () => {
      const filter1 = { field: 'test1', operator: 'eq' as const, value: 'value1' };
      const filter2 = { field: 'test2', operator: 'eq' as const, value: 'value2' };
      
      const result = QueryFilterBuilder.combineFilters(filter1, filter2);
      expect(result).toHaveLength(2);
    });

    it('should filter out nulls', () => {
      const filter1 = { field: 'test1', operator: 'eq' as const, value: 'value1' };
      
      const result = QueryFilterBuilder.combineFilters(filter1, null, undefined);
      expect(result).toHaveLength(1);
    });

    it('should flatten arrays', () => {
      const filter1 = { field: 'test1', operator: 'eq' as const, value: 'value1' };
      const filter2 = { field: 'test2', operator: 'eq' as const, value: 'value2' };
      
      const result = QueryFilterBuilder.combineFilters([filter1, filter2]);
      expect(result).toHaveLength(2);
    });
  });
});
```

**New File:** `tests/unit/utils/query-builders/query-params-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { QueryParamsBuilder } from '@/lib/utils/query-builders';

describe('QueryParamsBuilder', () => {
  describe('fromChartConfig', () => {
    it('should build basic params from config', () => {
      const config = {
        dataSourceId: 1,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const result = QueryParamsBuilder.fromChartConfig(config);

      expect(result).toMatchObject({
        data_source_id: 1,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      });
      expect(result.limit).toBeDefined();
    });

    it('should include measure and frequency', () => {
      const config = {
        dataSourceId: 1,
        measure: 'total_charges',
        frequency: 'Monthly',
      };

      const result = QueryParamsBuilder.fromChartConfig(config);

      expect(result.measure).toBe('total_charges');
      expect(result.frequency).toBe('Monthly');
    });

    it('should handle practiceUids array with fail-closed', () => {
      const config = {
        dataSourceId: 1,
        practiceUids: [],
      };

      const result = QueryParamsBuilder.fromChartConfig(config);

      expect(result.advanced_filters).toBeDefined();
      expect(result.advanced_filters?.[0]).toMatchObject({
        field: 'practice_uid',
        operator: 'in',
        value: [-1],
      });
    });

    it('should merge advanced filters', () => {
      const config = {
        dataSourceId: 1,
        advancedFilters: [
          { field: 'provider_name', operator: 'eq', value: 'Dr. Smith' },
        ],
      };

      const result = QueryParamsBuilder.fromChartConfig(config);

      expect(result.advanced_filters).toHaveLength(1);
    });
  });
});
```

**Run tests:**
```bash
pnpm test:run tests/unit/utils/query-builders
```

---

### Step 1.8: Integration Testing

**Test Existing Functionality:**

```bash
# Run full test suite to ensure no regressions
pnpm test:run

# Run specific integration tests
pnpm test:run tests/integration/analytics

# Run chart handler tests
pnpm test:run tests/unit/services/chart-handlers
```

---

### Step 1.9: Final Validation

```bash
# Type check entire codebase
pnpm tsc

# Lint entire codebase
pnpm lint

# Fix any issues
pnpm lint:fix
```

---

### Phase 1 Completion Checklist

- [ ] QueryFilterBuilder created and tested
- [ ] QueryParamsBuilder created and tested
- [ ] BaseChartHandler updated (128 lines → 5 lines)
- [ ] ChartConfigBuilderService updated
- [ ] QueryExecutor updated
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes
- [ ] No functionality regressions

**Expected Outcome:**
- 200+ lines of duplicated code eliminated
- Single source of truth for query building
- Consistent security patterns enforced
- Easier to maintain and extend

---

## Phase 2: Simplify ChartConfigBuilder (Week 2)

**Goal:** Split ChartConfigBuilderService into focused utilities following Single Responsibility Principle.

**Effort:** 4-6 hours  
**Risk:** Low  
**Priority:** HIGH

### Step 2.1: Create Filter Extractor Utility

**New File:** `lib/utils/chart-config/filter-extractor.ts`

```typescript
/**
 * Filter Extractor
 * 
 * Extracts filters from chart data_source configuration.
 * Single responsibility: Parse data_source.filters array.
 */

import type { ChartDefinition } from '@/lib/services/dashboard-rendering/types';

interface DataSourceFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

export interface ExtractedFilters {
  measure?: DataSourceFilter;
  frequency?: DataSourceFilter;
  practice?: DataSourceFilter;
  startDate?: DataSourceFilter;
  endDate?: DataSourceFilter;
  advancedFilters: unknown[];
}

export class FilterExtractor {
  /**
   * Extract filters from chart's data_source configuration
   * 
   * Replaces ChartConfigBuilderService.extractDataSourceFilters() (lines 103-120)
   */
  static extractFromDataSource(chart: ChartDefinition): ExtractedFilters {
    const dataSource = (chart.data_source as {
      filters?: DataSourceFilter[];
      advancedFilters?: unknown[];
    }) || {};

    const filters = dataSource.filters || [];

    return {
      measure: filters.find((f) => f.field === 'measure'),
      frequency: filters.find((f) => f.field === 'frequency'),
      practice: filters.find((f) => f.field === 'practice_uid'),
      startDate: filters.find((f) => f.field === 'date_index' && f.operator === 'gte'),
      endDate: filters.find((f) => f.field === 'date_index' && f.operator === 'lte'),
      advancedFilters: dataSource.advancedFilters || [],
    };
  }
}
```

---

### Step 2.2: Create Runtime Filter Builder Utility

**New File:** `lib/utils/chart-config/runtime-filter-builder.ts`

```typescript
/**
 * Runtime Filter Builder
 * 
 * Builds runtime filters by merging chart-level and universal filters.
 * Single responsibility: Filter merging logic.
 */

import type { ExtractedFilters } from './filter-extractor';
import type { ResolvedFilters } from '@/lib/services/dashboard-rendering/types';

export class RuntimeFilterBuilder {
  /**
   * Build runtime filters from extracted filters and universal overrides
   * 
   * Replaces ChartConfigBuilderService.buildRuntimeFilters() (lines 130-179)
   */
  static build(
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
    } else if (chartConfig?.frequency) {
      // Fallback to chart_config.frequency for multi-series/dual-axis
      runtimeFilters.frequency = chartConfig.frequency;
    }
    if (dataSourceFilters.practice?.value) {
      runtimeFilters.practiceUids = [dataSourceFilters.practice.value];
    }
    if (dataSourceFilters.startDate?.value) {
      runtimeFilters.startDate = dataSourceFilters.startDate.value;
    }
    if (dataSourceFilters.endDate?.value) {
      runtimeFilters.endDate = dataSourceFilters.endDate.value;
    }

    // Advanced filters
    if (Array.isArray(dataSourceFilters.advancedFilters) && dataSourceFilters.advancedFilters.length > 0) {
      runtimeFilters.advancedFilters = dataSourceFilters.advancedFilters;
    }

    // Universal filters override chart-level filters
    if (universalFilters.startDate) {
      runtimeFilters.startDate = universalFilters.startDate;
    }
    if (universalFilters.endDate) {
      runtimeFilters.endDate = universalFilters.endDate;
    }

    // SECURITY-CRITICAL: Only pass practiceUids if they have values
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      runtimeFilters.practiceUids = universalFilters.practiceUids;
    }

    return runtimeFilters;
  }
}
```

---

### Step 2.3: Create Config Normalizer Utility

**New File:** `lib/utils/chart-config/config-normalizer.ts`

```typescript
/**
 * Chart Config Normalizer
 * 
 * Normalizes chart configuration by flattening nested fields and merging filters.
 * Single responsibility: Config transformation.
 */

import type { ChartDefinition } from '@/lib/services/dashboard-rendering/types';
import type { ResolvedFilters } from '@/lib/services/dashboard-rendering/types';

export class ChartConfigNormalizer {
  /**
   * Normalize chart config (flatten nested fields, merge filters)
   * 
   * Replaces ChartConfigBuilderService.normalizeChartConfig() (lines 189-268)
   */
  static normalize(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): Record<string, unknown> {
    const chartConfigTyped = chart.chart_config as {
      series?: { groupBy?: string; colorPalette?: string };
      groupBy?: string;
      colorPalette?: string;
      dualAxisConfig?: unknown;
      aggregation?: string;
      target?: number;
      stackingMode?: string;
      dataSourceId?: number;
      seriesConfigs?: unknown[];
      frequency?: string;
    };

    const config: Record<string, unknown> = {
      ...(typeof chart.chart_config === 'object' && chart.chart_config !== null
        ? (chart.chart_config as Record<string, unknown>)
        : {}),
      chartType: chart.chart_type,
      dataSourceId: chartConfigTyped.dataSourceId || 0,
    };

    // Flatten series.groupBy to top-level (except for number charts)
    if (chart.chart_type !== 'number' && chartConfigTyped.series?.groupBy) {
      config.groupBy = chartConfigTyped.series.groupBy;
    }

    // Flatten series.colorPalette
    if (chartConfigTyped.series?.colorPalette) {
      config.colorPalette = chartConfigTyped.series.colorPalette;
    }

    // Chart-type-specific configs
    if (chart.chart_type === 'dual-axis' && chartConfigTyped.dualAxisConfig) {
      config.dualAxisConfig = chartConfigTyped.dualAxisConfig;
    }

    if (chart.chart_type === 'progress-bar') {
      if (chartConfigTyped.aggregation) {
        config.aggregation = chartConfigTyped.aggregation;
      }
      if (chartConfigTyped.target !== undefined) {
        config.target = chartConfigTyped.target;
      }
    }

    if (chartConfigTyped.stackingMode) {
      config.stackingMode = chartConfigTyped.stackingMode;
    }

    // Multi-series support
    if (chartConfigTyped.seriesConfigs?.length) {
      config.multipleSeries = chartConfigTyped.seriesConfigs;
    }

    // Merge universal filters
    if (universalFilters.startDate !== undefined) {
      config.startDate = universalFilters.startDate;
    }
    if (universalFilters.endDate !== undefined) {
      config.endDate = universalFilters.endDate;
    }
    if (universalFilters.dateRangePreset !== undefined) {
      config.dateRangePreset = universalFilters.dateRangePreset;
    }
    if (universalFilters.organizationId !== undefined) {
      config.organizationId = universalFilters.organizationId;
    }
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      config.practiceUids = universalFilters.practiceUids;
    }
    if (universalFilters.providerName !== undefined) {
      config.providerName = universalFilters.providerName;
    }

    return config;
  }
}
```

---

### Step 2.4: Create Index File

**New File:** `lib/utils/chart-config/index.ts`

```typescript
/**
 * Chart Config Utilities
 * 
 * Utilities for building and normalizing chart configurations.
 */

export { FilterExtractor, type ExtractedFilters } from './filter-extractor';
export { RuntimeFilterBuilder } from './runtime-filter-builder';
export { ChartConfigNormalizer } from './config-normalizer';
```

---

### Step 2.5: Update ChartConfigBuilderService

**File:** `lib/services/dashboard-rendering/chart-config-builder.ts`

**Changes:**

1. **Update imports** (line ~14):
```typescript
import { FilterExtractor, RuntimeFilterBuilder, ChartConfigNormalizer } from '@/lib/utils/chart-config';
```

2. **Simplify buildSingleChartConfig()** (lines 58-95):
```typescript
buildSingleChartConfig(
  chart: ChartDefinition,
  universalFilters: ResolvedFilters
): ChartExecutionConfig {
  // 1. Extract filters from data_source
  const dataSourceFilters = FilterExtractor.extractFromDataSource(chart);

  // 2. Extract chart config for frequency fallback
  const chartConfig = chart.chart_config as { frequency?: string } | undefined;

  // 3. Build runtime filters
  const runtimeFilters = RuntimeFilterBuilder.build(
    dataSourceFilters,
    universalFilters,
    chartConfig
  );

  // 4. Normalize chart config
  const normalizedConfig = ChartConfigNormalizer.normalize(chart, universalFilters);

  // 5. Build metadata
  const metadata = this.extractMetadata(dataSourceFilters, chart);

  log.debug('Chart config built', {
    chartId: chart.chart_definition_id,
    chartName: chart.chart_name,
    chartType: chart.chart_type,
    hasGroupBy: Boolean(normalizedConfig.groupBy),
    groupByValue: normalizedConfig.groupBy,
    runtimeFilterKeys: Object.keys(runtimeFilters),
    component: 'dashboard-rendering',
  });

  return {
    chartId: chart.chart_definition_id,
    chartName: chart.chart_name,
    chartType: chart.chart_type,
    finalChartConfig: normalizedConfig,
    runtimeFilters,
    metadata,
  };
}
```

3. **Delete old methods** (remove lines 103-268):
- Remove `extractDataSourceFilters()` (now FilterExtractor)
- Remove `buildRuntimeFilters()` (now RuntimeFilterBuilder)
- Remove `normalizeChartConfig()` (now ChartConfigNormalizer)

4. **Keep helper method** (lines 277-305):
- Keep `extractMetadata()` - small utility method

**Result:** 307 lines → ~100 lines with focused responsibility.

---

### Step 2.6: Write Unit Tests

**New File:** `tests/unit/utils/chart-config/filter-extractor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { FilterExtractor } from '@/lib/utils/chart-config';
import type { ChartDefinition } from '@/lib/services/dashboard-rendering/types';

describe('FilterExtractor', () => {
  it('should extract filters from data_source', () => {
    const chart = {
      data_source: {
        filters: [
          { field: 'measure', value: 'total_charges' },
          { field: 'frequency', value: 'Monthly' },
          { field: 'date_index', operator: 'gte', value: '2024-01-01' },
          { field: 'date_index', operator: 'lte', value: '2024-12-31' },
        ],
        advancedFilters: [
          { field: 'provider_name', operator: 'eq', value: 'Dr. Smith' },
        ],
      },
    } as unknown as ChartDefinition;

    const result = FilterExtractor.extractFromDataSource(chart);

    expect(result.measure?.value).toBe('total_charges');
    expect(result.frequency?.value).toBe('Monthly');
    expect(result.startDate?.value).toBe('2024-01-01');
    expect(result.endDate?.value).toBe('2024-12-31');
    expect(result.advancedFilters).toHaveLength(1);
  });

  it('should handle missing filters', () => {
    const chart = {
      data_source: {},
    } as unknown as ChartDefinition;

    const result = FilterExtractor.extractFromDataSource(chart);

    expect(result.measure).toBeUndefined();
    expect(result.advancedFilters).toEqual([]);
  });
});
```

**Run tests:**
```bash
pnpm test:run tests/unit/utils/chart-config
```

---

### Step 2.7: Final Validation

```bash
# Type check
pnpm tsc

# Lint
pnpm lint

# Run all tests
pnpm test:run

# Specifically test dashboard rendering
pnpm test:run tests/integration/dashboard-rendering
```

---

### Phase 2 Completion Checklist

- [ ] FilterExtractor created and tested
- [ ] RuntimeFilterBuilder created and tested
- [ ] ChartConfigNormalizer created and tested
- [ ] ChartConfigBuilderService simplified (307→100 lines)
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes

**Expected Outcome:**
- SRP compliance achieved
- 200+ lines moved to focused utilities
- Easier to test and maintain
- Better code organization

---

## Phase 3: Consolidate Dashboard Services (Week 3)

**Goal:** Reduce file count by consolidating related dashboard rendering services.

**Effort:** 3-4 hours  
**Risk:** Low  
**Priority:** MEDIUM

### Current Structure
```
lib/services/dashboard-rendering/
  ├── dashboard-rendering-service.ts (121 lines - orchestrator)
  ├── dashboard-loader.ts            (~150 lines)
  ├── filter-service.ts              (257 lines)
  ├── chart-config-builder.ts        (100 lines after Phase 2)
  ├── batch-executor.ts              (230 lines)
  └── base-service.ts                (~50 lines)

Total: 6 files, ~900 lines
```

### Target Structure
```
lib/services/dashboard-rendering/
  ├── dashboard-rendering-service.ts (400 lines - includes loader + executor)
  ├── filter-service.ts              (257 lines - unchanged)
  └── chart-config-builder.ts        (100 lines - unchanged)

Total: 3 files, ~750 lines
```

---

### Step 3.1: Merge DashboardLoader into Main Service

**File:** `lib/services/dashboard-rendering/dashboard-rendering-service.ts`

**Changes:**

1. **Add DashboardLoaderService code** into main service as private methods:

```typescript
/**
 * Dashboard Rendering Service - Facade
 * 
 * Orchestrates dashboard rendering by delegating to specialized services.
 * Includes loading, filtering, config building, and batch execution.
 */

import { log, logTemplates } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { FilterService } from './filter-service';
import { ChartConfigBuilderService } from './chart-config-builder';
import { mapDashboardRenderResponse, buildEmptyDashboardResponse } from './mappers';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import type { 
  DashboardUniversalFilters, 
  DashboardRenderResponse,
  DashboardWithCharts,
  ChartDefinition 
} from './types';

// ... existing code ...

export class DashboardRenderingService {
  // ... existing constructor ...

  /**
   * Load dashboard with RBAC-filtered charts
   * (Moved from DashboardLoaderService)
   */
  private async loadDashboardWithCharts(
    dashboardId: string
  ): Promise<{ dashboard: DashboardWithCharts; charts: ChartDefinition[] }> {
    // Implementation from dashboard-loader.ts
    // ...
  }

  /**
   * Execute all charts in parallel
   * (Moved from BatchExecutorService)
   */
  private async executeParallel(chartConfigs: ChartExecutionConfig[]): Promise<ExecutionResult> {
    // Implementation from batch-executor.ts
    // ...
  }

  /**
   * Execute single chart
   */
  private async executeSingleChart(config: ChartExecutionConfig): Promise<ChartRenderResult> {
    // Implementation from batch-executor.ts
    // ...
  }

  // ... rest of service ...
}
```

2. **Remove dependency on separate loader/executor files**

3. **Update imports** - remove DashboardLoaderService, BatchExecutorService

**Validation:**
```bash
pnpm tsc --noEmit lib/services/dashboard-rendering/dashboard-rendering-service.ts
pnpm lint lib/services/dashboard-rendering/dashboard-rendering-service.ts
```

---

### Step 3.2: Delete Consolidated Files

```bash
# After successful merge and validation:
rm lib/services/dashboard-rendering/dashboard-loader.ts
rm lib/services/dashboard-rendering/batch-executor.ts
rm lib/services/dashboard-rendering/base-service.ts
```

---

### Step 3.3: Update Type Exports

**File:** `lib/services/dashboard-rendering/types.ts`

Ensure all types previously exported from deleted files are available.

---

### Step 3.4: Update Index Exports

**File:** `lib/services/dashboard-rendering/index.ts`

```typescript
/**
 * Dashboard Rendering - Public API
 */

export { DashboardRenderingService } from './dashboard-rendering-service';
export { FilterService } from './filter-service';
export { ChartConfigBuilderService } from './chart-config-builder';
export type * from './types';
```

---

### Step 3.5: Update Imports Throughout Codebase

Search and update any imports of deleted services:

```bash
# Find files importing old services
grep -r "from.*dashboard-loader" lib/ app/ --include="*.ts" --include="*.tsx"
grep -r "from.*batch-executor" lib/ app/ --include="*.ts" --include="*.tsx"

# Update to import from main service
```

---

### Step 3.6: Final Validation

```bash
# Type check
pnpm tsc

# Lint
pnpm lint

# Run dashboard tests
pnpm test:run tests/integration/dashboard

# Run full suite
pnpm test:run
```

---

### Phase 3 Completion Checklist

- [ ] DashboardLoader merged into main service
- [ ] BatchExecutor merged into main service
- [ ] Old files deleted
- [ ] Imports updated throughout codebase
- [ ] Type exports validated
- [ ] All tests passing
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes

**Expected Outcome:**
- 50% reduction in file count (6→3 files)
- Easier navigation
- Still maintainable size (~400 lines per file)
- Same functionality

---

## Phase 4: Split QueryExecutor (Week 4)

**Goal:** Improve extensibility by splitting QueryExecutor into pattern-specific executors.

**Effort:** 6-8 hours  
**Risk:** Medium  
**Priority:** MEDIUM

### Step 4.1: Create Base Query Executor

**New File:** `lib/services/analytics/query-executors/base-query-executor.ts`

```typescript
/**
 * Base Query Executor
 * 
 * Abstract base class for pattern-specific query executors.
 * Provides shared functionality for column mapping and filter processing.
 */

import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { ChartFilter } from '@/lib/types/analytics';
import type { ColumnMappings } from '../query-types';
import type { DataSourceConfig } from '@/lib/services/chart-config-service';

export abstract class BaseQueryExecutor {
  /**
   * Get dynamic column mappings from data source metadata
   */
  protected async getColumnMappings(
    tableName: string,
    schemaName: string,
    dataSourceConfig?: DataSourceConfig | null
  ): Promise<ColumnMappings> {
    const config =
      dataSourceConfig || (await chartConfigService.getDataSourceConfig(tableName, schemaName));

    if (!config) {
      throw new Error(`Data source configuration not found for ${schemaName}.${tableName}`);
    }

    // Find columns
    const timePeriodColumn = config.columns.find((col) => col.isTimePeriod);
    const timePeriodField = timePeriodColumn?.columnName || 'frequency';

    const dateColumn =
      config.columns.find(
        (col) =>
          col.isDateField &&
          col.columnName !== timePeriodField &&
          (col.columnName === 'date_value' ||
            col.columnName === 'date_index' ||
            col.dataType === 'date')
      ) || config.columns.find((col) => col.isDateField && col.columnName !== timePeriodField);
    const dateField = dateColumn?.columnName || 'date_index';

    const measureColumn = config.columns.find((col) => col.isMeasure);
    const measureValueField = measureColumn?.columnName || 'measure_value';

    const measureTypeColumn = config.columns.find((col) => col.isMeasureType);
    const measureTypeField = measureTypeColumn?.columnName || 'measure_type';

    const allColumns = config.columns.map((col) => col.columnName);

    return {
      dateField,
      timePeriodField,
      measureValueField,
      measureTypeField,
      allColumns,
    };
  }

  /**
   * Process advanced filters to standardize format
   */
  protected processAdvancedFilters(advancedFilters: ChartFilter[]): ChartFilter[] {
    return advancedFilters.map((filter) => ({
      field: filter.field,
      operator: filter.operator || 'eq',
      value: filter.value,
    }));
  }

  /**
   * Execute query - must be implemented by subclasses
   */
  abstract execute(...args: unknown[]): Promise<unknown>;
}
```

---

### Step 4.2: Create Standard Query Executor

**New File:** `lib/services/analytics/query-executors/standard-query-executor.ts`

```typescript
/**
 * Standard Query Executor
 * 
 * Handles standard (non-series, non-comparison) analytics queries.
 * Direct database queries with RBAC in SQL.
 */

import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { queryBuilder } from '../query-builder';
import { queryValidator } from '../query-validator';
import { QueryFilterBuilder } from '@/lib/utils/query-builders';
import { BaseQueryExecutor } from './base-query-executor';
import type {
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartFilter,
  ChartRenderContext,
  AggAppMeasure,
} from '@/lib/types/analytics';

export class StandardQueryExecutor extends BaseQueryExecutor {
  /**
   * Execute standard query (legacy path)
   * 
   * Replaces QueryExecutor.executeLegacyQuery()
   */
  async execute(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    log.info('Building analytics query (standard path)', {
      params: { ...params, limit: params.limit || 1000 },
      userId: context.user_id,
    });

    // Get data source configuration
    let dataSourceConfig = null;
    let tableName = 'agg_app_measures';
    let schemaName = 'ih';

    if (params.data_source_id) {
      dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);
      if (dataSourceConfig) {
        tableName = dataSourceConfig.tableName;
        schemaName = dataSourceConfig.schemaName;
      }
    }

    // Validate table access
    await queryValidator.validateTable(tableName, schemaName, dataSourceConfig);

    // Get column mappings
    const columnMappings = await this.getColumnMappings(tableName, schemaName, dataSourceConfig);

    // Build filters using utilities
    const filters: ChartFilter[] = [];

    const measureFilter = QueryFilterBuilder.buildMeasureFilter(params.measure);
    if (measureFilter) filters.push(measureFilter);

    const frequencyFilter = QueryFilterBuilder.buildFrequencyFilter(
      params.frequency,
      columnMappings.timePeriodField
    );
    if (frequencyFilter) filters.push(frequencyFilter);

    // Add practice filters
    if (params.practice) {
      filters.push({ field: 'practice', operator: 'eq', value: params.practice });
    }
    if (params.practice_primary) {
      filters.push({ field: 'practice_primary', operator: 'eq', value: params.practice_primary });
    }
    if (params.practice_uid) {
      filters.push({ field: 'practice_uid', operator: 'eq', value: params.practice_uid });
    }

    // Add provider filter
    const providerFilter = QueryFilterBuilder.buildProviderFilter(params.provider_name);
    if (providerFilter) filters.push(providerFilter);

    // Add date filters
    const dateFilters = QueryFilterBuilder.buildDateFilters(
      params.start_date,
      params.end_date,
      columnMappings.dateField
    );
    filters.push(...dateFilters);

    // Process advanced filters
    if (params.advanced_filters) {
      const advancedFilters = this.processAdvancedFilters(params.advanced_filters);
      filters.push(...advancedFilters);
    }

    // Build WHERE clause
    const { clause: whereClause, params: queryParams } = await queryBuilder.buildWhereClause(
      filters,
      context
    );

    // Build query
    const selectColumns = columnMappings.allColumns;
    const query = `
      SELECT ${selectColumns.join(', ')}
      FROM ${schemaName}.${tableName}
      ${whereClause}
      ORDER BY ${columnMappings.dateField} ASC
    `;

    // Execute query
    const data = await executeAnalyticsQuery<AggAppMeasure>(query, queryParams);

    // Get total
    const totalQuery = `
      SELECT
        CASE
          WHEN ${columnMappings.measureTypeField} IN ('currency', 'quantity') THEN SUM(${columnMappings.measureValueField})::text
          ELSE COUNT(*)::text
        END as total,
        ${columnMappings.measureTypeField} as measure_type
      FROM ${schemaName}.${tableName}
      ${whereClause}
      GROUP BY ${columnMappings.measureTypeField}
    `;

    const totalResult = await executeAnalyticsQuery<{ total: string; measure_type: string }>(
      totalQuery,
      queryParams
    );

    const queryTime = Date.now() - startTime;
    const totalCount = totalResult.length > 0 ? parseInt(totalResult[0]?.total || '0', 10) : 0;

    const result: AnalyticsQueryResult = {
      data,
      total_count: totalCount,
      query_time_ms: queryTime,
      cache_hit: false,
    };

    log.info('Analytics query completed (standard path)', {
      queryTime,
      resultCount: data.length,
      totalCount,
      userId: context.user_id,
    });

    return result;
  }
}
```

---

### Step 4.3: Create Series Query Executor

**New File:** `lib/services/analytics/query-executors/series-query-executor.ts`

(Similar pattern - delegates to queryMeasures for each series)

---

### Step 4.4: Create Comparison Query Executor

**New File:** `lib/services/analytics/query-executors/comparison-query-executor.ts`

(Similar pattern - handles period comparison logic)

---

### Step 4.5: Update QueryExecutor to Use Executors

**File:** `lib/services/analytics/query-executor.ts`

```typescript
/**
 * Query Executor - Facade
 * 
 * Delegates to pattern-specific executors.
 */

import { StandardQueryExecutor } from './query-executors/standard-query-executor';
import { SeriesQueryExecutor } from './query-executors/series-query-executor';
import { ComparisonQueryExecutor } from './query-executors/comparison-query-executor';
import type { 
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartRenderContext,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';

export class QueryExecutor {
  private standardExecutor = new StandardQueryExecutor();
  private seriesExecutor = new SeriesQueryExecutor();
  private comparisonExecutor = new ComparisonQueryExecutor();

  async executeLegacyQuery(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    return this.standardExecutor.execute(params, context);
  }

  async executeMultipleSeries(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext,
    queryMeasuresDelegate: (
      params: AnalyticsQueryParams,
      context: ChartRenderContext | UserContext
    ) => Promise<AnalyticsQueryResult>
  ): Promise<AnalyticsQueryResult> {
    return this.seriesExecutor.execute(params, contextOrUserContext, queryMeasuresDelegate);
  }

  async executePeriodComparison(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext,
    executeBaseQueryDelegate: (
      params: AnalyticsQueryParams,
      context: ChartRenderContext | UserContext
    ) => Promise<AnalyticsQueryResult>
  ): Promise<AnalyticsQueryResult> {
    return this.comparisonExecutor.execute(params, contextOrUserContext, executeBaseQueryDelegate);
  }

  // Keep getColumnMappings for backward compatibility
  async getColumnMappings(...args: Parameters<BaseQueryExecutor['getColumnMappings']>) {
    return this.standardExecutor['getColumnMappings'](...args);
  }
}

// Export singleton
export const queryExecutor = new QueryExecutor();
```

**Result:** 552 lines → ~80 lines facade + focused executors

---

### Step 4.6: Final Validation

```bash
# Type check
pnpm tsc

# Lint
pnpm lint

# Run analytics tests
pnpm test:run tests/integration/analytics

# Run full suite
pnpm test:run
```

---

### Phase 4 Completion Checklist

- [ ] BaseQueryExecutor created
- [ ] StandardQueryExecutor created
- [ ] SeriesQueryExecutor created
- [ ] ComparisonQueryExecutor created
- [ ] QueryExecutor refactored to facade
- [ ] All tests passing
- [ ] `pnpm tsc` passes
- [ ] `pnpm lint` passes

---

## Phase 5: Dead Code Elimination (Week 5)

**Goal:** Remove unused code and deprecated utilities.

**Effort:** 4-6 hours  
**Risk:** Low  
**Priority:** MEDIUM

### Step 5.1: Run Automated Analysis

```bash
# Install tools
pnpm add -D ts-prune unimport jscpd

# Find unused exports
npx ts-prune

# Find unused imports
npx unimport --find

# Find duplicate code
npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50
```

---

### Step 5.2: Review Findings

Create spreadsheet of findings:

| File | Type | Line | Description | Action |
|------|------|------|-------------|--------|
| lib/services/old-service.ts | Unused export | 42 | Function never imported | Remove |
| lib/utils/legacy.ts | Deprecated | All | Marked as `.deprecated` | Delete file |

---

### Step 5.3: Remove Confirmed Dead Code

For each confirmed unused item:

1. Verify with grep that it's truly unused
2. Check git history to understand when it was last used
3. Remove code
4. Run tests
5. Commit with clear message

```bash
# Example
git rm lib/services/deprecated-service.ts
pnpm test:run
git commit -m "Remove deprecated service (unused since 2023)"
```

---

### Step 5.4: Update Documentation

Update any docs that reference removed code.

---

### Phase 5 Completion Checklist

- [ ] ts-prune analysis complete
- [ ] unimport analysis complete
- [ ] jscpd analysis complete
- [ ] Dead code removed
- [ ] Tests still passing
- [ ] Documentation updated

---

## Phase 6: Documentation Sprint (Week 6)

**Goal:** Document the optimized architecture for future developers.

**Effort:** 8-10 hours  
**Risk:** None  
**Priority:** LOW

### Step 6.1: Create Architecture Decision Records

**New File:** `docs/architecture/ADR-001-query-building-utilities.md`

Document why we centralized query building.

**New File:** `docs/architecture/ADR-002-chart-config-simplification.md`

Document SRP refactoring of ChartConfigBuilder.

---

### Step 6.2: Create Service Responsibility Matrix

**New File:** `docs/architecture/service-responsibility-matrix.md`

```markdown
# Service Responsibility Matrix

| Service | Single Responsibility | Dependencies | Used By |
|---------|----------------------|--------------|---------|
| DashboardRenderingService | Orchestrate dashboard batch rendering | FilterService, ChartConfigBuilderService, ChartDataOrchestrator | API routes |
| FilterService | Validate and resolve dashboard filters | OrganizationAccessService, OrganizationHierarchyService | DashboardRenderingService |
| ChartConfigBuilderService | Build chart execution configs | FilterExtractor, RuntimeFilterBuilder, ChartConfigNormalizer | DashboardRenderingService, DimensionExpansionRenderer |
| ... | ... | ... | ... |
```

---

### Step 6.3: Create Extension Guides

**New File:** `docs/guides/adding-new-chart-type.md`

Step-by-step guide for adding new chart types.

**New File:** `docs/guides/adding-new-data-source.md`

Step-by-step guide for adding new data sources.

---

### Step 6.4: Create Onboarding Guide

**New File:** `docs/guides/analytics-system-onboarding.md`

Guide for new developers joining the analytics team.

---

### Phase 6 Completion Checklist

- [ ] ADRs written
- [ ] Service responsibility matrix created
- [ ] Extension guides written
- [ ] Onboarding guide created

---

## Validation & Quality Gates

### After Each Phase

```bash
# 1. Type check
pnpm tsc

# 2. Lint
pnpm lint

# 3. Run tests
pnpm test:run

# 4. Fix any issues
pnpm lint:fix

# 5. Verify no regressions
pnpm test:run tests/integration
```

### Before Declaring Phase Complete

- [ ] All new code has unit tests
- [ ] Integration tests pass
- [ ] TypeScript compilation successful
- [ ] Linting passes
- [ ] No console.log statements
- [ ] No `any` types introduced
- [ ] Security review (if applicable)
- [ ] Documentation updated

---

## Rollback Strategy

### If Phase Fails

1. **Revert Git Commits:**
   ```bash
   git log --oneline  # Find commit to revert to
   git revert <commit-hash>  # NOT reset - following CLAUDE.md
   ```

2. **Run Full Test Suite:**
   ```bash
   pnpm test:run
   ```

3. **Verify System Stability:**
   ```bash
   pnpm tsc
   pnpm lint
   ```

### If Production Issues Arise

1. **Feature flag** new utilities (if available)
2. **Monitor logs** for errors
3. **Rollback deployment** if necessary
4. **Fix forward** rather than reverting code

---

## Success Metrics

### Quantitative

- [ ] 20-30% reduction in code duplication
- [ ] 15-20% reduction in file count
- [ ] Zero functionality regressions
- [ ] Test coverage maintained or improved
- [ ] Build time unchanged or improved

### Qualitative

- [ ] Easier code navigation
- [ ] Clearer service responsibilities
- [ ] Better developer experience
- [ ] Improved maintainability
- [ ] Easier to extend

---

## Timeline Summary

| Week | Phase | Hours | Risk | Priority |
|------|-------|-------|------|----------|
| 1 | Extract Query Utilities | 8-10 | Medium | HIGH |
| 2 | Simplify ChartConfigBuilder | 4-6 | Low | HIGH |
| 3 | Consolidate Dashboard Services | 3-4 | Low | MEDIUM |
| 4 | Split QueryExecutor | 6-8 | Medium | MEDIUM |
| 5 | Dead Code Elimination | 4-6 | Low | MEDIUM |
| 6 | Documentation Sprint | 8-10 | None | LOW |

**Total: 35-45 hours over 6 weeks**

---

## Final Notes

### Following CLAUDE.md Standards

- ✅ Always run `pnpm tsc` and `pnpm lint` after changes
- ✅ Fix ALL errors before proceeding (even unrelated ones)
- ✅ Quality over speed - no shortcuts
- ✅ No `any` types
- ✅ Test quality matters - real value, not theater
- ✅ No git reset operations (use revert)
- ✅ Security first - maintain fail-closed patterns
- ✅ Follow existing patterns

### Communication

- Update team on progress after each phase
- Request code review for high-risk changes
- Document any deviations from plan
- Escalate blockers immediately

---

**Plan Status:** Ready for Implementation  
**Next Step:** Begin Phase 1 - Extract Query Building Utilities  
**Owner:** Development Team  
**Estimated Completion:** 6 weeks from start date

