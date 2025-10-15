# Analytics Query Builder Refactoring Plan

**Status:** Planning
**Priority:** High
**Complexity:** Medium-High
**Estimated Timeline:** 3-4 weeks
**Last Updated:** 2025-01-15

## Executive Summary

The `analytics-query-builder.ts` file has grown to 1,093 lines with 125 conditional statements and 16 methods, making it the 4th most complex service file in the codebase. Critical issues include:

1. **~145 lines of duplicated code** between `queryMeasures()` and `executeBaseQuery()` (95% identical)
2. Multiple responsibilities mixed (validation, sanitization, building, execution)
3. Security-critical code mixed with business logic
4. High cyclomatic complexity (160+ conditional statements)
5. No unit test coverage for security validation

This document provides a complete implementation plan to refactor the query builder into smaller, testable, maintainable modules while integrating with our existing Redis cache infrastructure.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Root Cause: The Duplication Problem](#root-cause-the-duplication-problem)
3. [Proposed Architecture](#proposed-architecture)
4. [Cache Integration Strategy](#cache-integration-strategy)
5. [Implementation Plan (4 Phases)](#implementation-plan)
6. [Migration Strategy](#migration-strategy)
7. [Testing Strategy](#testing-strategy)
8. [Success Metrics](#success-metrics)
9. [Risk Assessment](#risk-assessment)
10. [Appendices](#appendices)

---

## Current State Analysis

### File Metrics

```
File: lib/services/analytics-query-builder.ts
├─ Lines: 1,093
├─ Methods: 16
├─ Conditionals: 160+
├─ Cyclomatic Complexity: High (avg 30+ per method)
└─ Test Coverage: 0%
```

### Code Structure

```
analytics-query-builder.ts (1,093 lines)
├── Security Validation (4 methods, ~88 lines)
│   ├── validateTable()
│   ├── validateField()
│   ├── validateOperator()
│   └── ALLOWED_OPERATORS constant
├── Input Sanitization (4 methods, ~91 lines)
│   ├── sanitizeValue()
│   ├── sanitizeSingleValue()
│   ├── isSafeString()
│   └── isValidDateString()
├── Query Building (2 methods, ~268 lines)
│   ├── buildWhereClause() - 107 lines, security filters + user filters
│   └── getColumnMappings() - 53 lines, metadata resolution
├── Query Execution (4 methods, ~535 lines)
│   ├── queryMeasures() - 171 lines (main entry point)
│   ├── executeBaseQuery() - 145 lines (DUPLICATE of queryMeasures)
│   ├── queryMultipleSeries() - 150 lines
│   └── queryWithPeriodComparison() - 142 lines
├── Convenience Methods (1 method, ~23 lines)
│   └── getPracticeRevenueTrend()
└── Advanced Filters (1 method, ~84 lines)
    └── processAdvancedFilters()
```

### Dependencies

**Inbound Dependencies (who calls this service):**
- `lib/services/chart-handlers/base-handler.ts` - Chart rendering
- `lib/services/chart-executor.ts` - Chart execution
- `app/api/admin/analytics/measures/route.ts` - API endpoint
- `app/api/admin/analytics/chart-data/route.ts` - API endpoint

**Outbound Dependencies (what this service uses):**
- `lib/services/analytics-db.ts` - Database execution
- `lib/services/chart-config-service.ts` - Metadata resolution
- `lib/utils/period-comparison.ts` - Date range calculations
- `lib/logger` - Logging

---

## Root Cause: The Duplication Problem

### Why We Have Both `queryMeasures()` and `executeBaseQuery()`

**TL;DR:** Infinite recursion prevention, but implemented via copy-paste instead of proper extraction.

### The Infinite Recursion Problem

```typescript
// WHAT WOULD HAPPEN WITHOUT executeBaseQuery():

User requests: "Show me Q4 revenue compared to Q3"
  ↓
queryMeasures({ period_comparison: { enabled: true } })
  ↓
Sees period_comparison.enabled = true
  ↓
Calls queryWithPeriodComparison()
  ↓
Needs to execute TWO queries:
  1. Current period (Q4)
  2. Comparison period (Q3)
  ↓
If it called queryMeasures() for each...
  ↓
queryMeasures() would see period_comparison STILL in params
  ↓
Would call queryWithPeriodComparison() AGAIN
  ↓
INFINITE RECURSION! 💥
```

### The Current (Flawed) Solution

```typescript
// analytics-query-builder.ts:344
async queryMeasures(params, context) {
  // ROUTER: Dispatches to specialized handlers

  if (params.multiple_series?.length > 0) {
    return this.queryMultipleSeries(params, context);
  }

  if (params.period_comparison?.enabled) {
    return this.queryWithPeriodComparison(params, context);
  }

  // Normal query execution (lines 361-504)
  // ... 145 lines of query execution code ...
}

// analytics-query-builder.ts:829
private async queryWithPeriodComparison(params, context) {
  // Strip period_comparison to avoid recursion
  const { period_comparison: _removed, ...baseParams } = params;

  const comparisonParams = {
    ...baseParams,
    start_date: comparisonRange.start,
    end_date: comparisonRange.end,
  };

  // Execute BOTH queries in parallel
  // MUST use executeBaseQuery to avoid recursion
  [currentResult, comparisonResult] = await Promise.all([
    this.executeBaseQuery(params, context),
    this.executeBaseQuery(comparisonParams, context),
  ]);
}

// analytics-query-builder.ts:521
private async executeBaseQuery(params, context) {
  // DUPLICATE of queryMeasures() lines 361-504
  // 145 lines of IDENTICAL code
  // Does NOT check for period_comparison or multiple_series
}
```

### Why This Is A Problem

| Issue | Impact | Evidence |
|-------|--------|----------|
| **Code Duplication** | 145 lines (95% identical) | Lines 361-504 vs 527-669 |
| **Maintenance Burden** | Bug fixes in 2 places | Any change must be applied twice |
| **Divergence Risk** | Implementations drift apart | No mechanism to keep them in sync |
| **Testing Complexity** | Same logic tested twice | Doubles test surface area |
| **Performance Updates** | Must optimize twice | Cache improvements needed in both |

### The Correct Solution

**Extract the core query execution logic into a separate method:**

```typescript
class AnalyticsQueryBuilder {
  /**
   * PUBLIC API: Query with routing
   */
  async queryMeasures(params, context) {
    // Route to specialized handlers
    if (params.multiple_series?.length > 0) {
      return this.queryMultipleSeries(params, context);
    }

    if (params.period_comparison?.enabled) {
      return this.queryWithPeriodComparison(params, context);
    }

    // Delegate to core executor
    return this.executeCoreQuery(params, context);
  }

  /**
   * PRIVATE: Core query execution (no routing)
   * Single source of truth for query execution
   */
  private async executeCoreQuery(params, context) {
    // All actual query logic here (currently duplicated)
    // Used by queryMeasures() and queryWithPeriodComparison()
  }

  /**
   * PRIVATE: Period comparison
   */
  private async queryWithPeriodComparison(params, context) {
    const { period_comparison: _removed, ...baseParams } = params;

    // Safe! executeCoreQuery has no routing logic
    [currentResult, comparisonResult] = await Promise.all([
      this.executeCoreQuery(params, context),
      this.executeCoreQuery(comparisonParams, context),
    ]);
  }
}
```

**Benefits:**
- ✅ Eliminates 145 lines of duplication
- ✅ Single source of truth for query execution
- ✅ Bug fixes in one place
- ✅ Performance improvements in one place
- ✅ Easier to test
- ✅ No recursion risk

---

## Proposed Architecture

### Target Structure

```
lib/services/analytics/
├── cache/
│   ├── query-cache.ts              ← NEW: Query-level caching
│   └── index.ts                    ← Export queryCache singleton
├── query-validator.ts              ← Security validation
├── query-sanitizer.ts              ← Input sanitization
├── query-builder.ts                ← SQL generation
├── query-executor.ts               ← Database execution (uses cache)
├── query-orchestrator.ts           ← Main entry point (router)
├── query-types.ts                  ← Shared types
└── index.ts                        ← Public API

lib/cache/                           ← EXISTING (no changes)
├── base.ts                         ← CacheService base class
├── chart-config-cache.ts           ← Data source metadata (Layer 3)
├── chart-data-cache.ts             ← Chart render results
├── analytics-cache.ts              ← Dashboard/chart lists
└── types.ts                        ← Cache types
```

### Module Responsibilities

#### 1. query-validator.ts (Security Layer)

**Purpose:** Security-critical validation, separate for auditing

```typescript
export class QueryValidator {
  /**
   * Validate table name against database configuration
   * @throws Error if table not authorized
   */
  async validateTable(
    tableName: string,
    schemaName: string,
    config?: DataSourceConfig
  ): Promise<void>

  /**
   * Validate field name against database configuration
   * @throws Error if field not authorized
   */
  async validateField(
    fieldName: string,
    tableName: string,
    schemaName: string,
    config?: DataSourceConfig
  ): Promise<void>

  /**
   * Validate operator against whitelist
   * @throws Error if operator not allowed
   */
  validateOperator(operator: string): void

  /**
   * Validate complete query parameters
   * Returns validation result with errors
   */
  async validateQueryParams(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<ValidationResult>
}

// Constants
export const ALLOWED_OPERATORS = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  not_in: 'NOT IN',
  like: 'ILIKE',
  between: 'BETWEEN',
}
```

**Key Features:**
- Security-focused, separate for auditing
- All validation throws errors (fail-closed)
- Uses data source config for dynamic validation
- Testable in isolation

#### 2. query-sanitizer.ts (Input Sanitization)

**Purpose:** SQL injection prevention layer

```typescript
export class QuerySanitizer {
  /**
   * Sanitize filter value based on operator type
   * Handles arrays (IN/NOT IN), ranges (BETWEEN), and single values
   */
  sanitizeValue(value: unknown, operator: string): unknown

  /**
   * Sanitize single value based on type
   * - Strings: Remove SQL injection characters
   * - Numbers: Validate finite
   * - Dates: Validate format
   */
  private sanitizeSingleValue(value: unknown): unknown

  /**
   * Check if string contains only safe characters
   * Pattern: alphanumeric, spaces, hyphens, underscores, common punctuation
   */
  private isSafeString(value: string): boolean

  /**
   * Validate date string format (YYYY-MM-DD)
   */
  private isValidDateString(dateString: string): boolean

  /**
   * Sanitize array of filters
   * Processes all filter values in a filter array
   */
  sanitizeFilters(filters: ChartFilter[]): ChartFilter[]
}
```

**Key Features:**
- Centralized sanitization logic
- Type-aware sanitization
- Conservative approach (removes dangerous characters)
- Testable with edge cases

#### 3. query-builder.ts (SQL Construction)

**Purpose:** Pure SQL query construction (no side effects)

```typescript
export class QueryBuilder {
  /**
   * Build complete WHERE clause with security + user filters
   * Returns parameterized query parts
   */
  async buildWhereClause(
    filters: ChartFilter[],
    context: ChartRenderContext,
    config: QueryBuilderConfig
  ): Promise<{ clause: string; params: unknown[] }>

  /**
   * Build security filters from user context
   * Handles practice_uid and provider_uid filtering
   */
  private buildSecurityFilters(
    context: ChartRenderContext
  ): { conditions: string[]; params: unknown[] }

  /**
   * Build user-specified filters
   * Converts ChartFilter[] to SQL conditions
   */
  private buildUserFilters(
    filters: ChartFilter[],
    startIndex: number
  ): { conditions: string[]; params: unknown[] }

  /**
   * Build SELECT column list
   * Maps column names to aliases for consistent interface
   */
  buildSelectColumns(columnMappings: ColumnMappings): string[]

  /**
   * Build ORDER BY clause
   */
  buildOrderByClause(
    columnMappings: ColumnMappings,
    sortField?: string
  ): string

  /**
   * Build complete query
   * Assembles all parts into final SQL
   */
  buildQuery(config: QueryBuilderConfig): { sql: string; params: unknown[] }

  /**
   * Build aggregation query (for totals)
   */
  buildAggregationQuery(
    config: QueryBuilderConfig
  ): { sql: string; params: unknown[] }
}

interface QueryBuilderConfig {
  tableName: string
  schemaName: string
  columnMappings: ColumnMappings
  filters: ChartFilter[]
  context: ChartRenderContext
  limit?: number
  offset?: number
}
```

**Key Features:**
- Pure functions (no database calls)
- Returns SQL + params (parameterized queries)
- Security filters isolated in separate method
- Easy to test (input → output, no side effects)

#### 4. query-executor.ts (Database Operations)

**Purpose:** Database execution with caching

```typescript
export class QueryExecutor {
  constructor(
    private queryBuilder: QueryBuilder,
    private validator: QueryValidator
  ) {}

  /**
   * Execute query with caching
   * MAIN METHOD: Used by orchestrator for simple queries
   */
  async executeQuery(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult>

  /**
   * Execute query without cache
   * Used by period comparison and multiple series
   */
  async executeQueryDirect(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult>

  /**
   * Execute multiple series query (optimized with IN clause)
   */
  async executeMultipleSeries(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult>

  /**
   * Execute period comparison (parallel queries)
   */
  async executePeriodComparison(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult>

  /**
   * Get column mappings with caching
   * Caches metadata for 1 hour
   */
  async getColumnMappings(
    tableName: string,
    schemaName: string,
    dataSourceConfig?: DataSourceConfig
  ): Promise<ColumnMappings>

  /**
   * Calculate totals for query
   * Used by all query types
   */
  private async calculateTotals(
    config: QueryBuilderConfig
  ): Promise<number>

  /**
   * Execute with retry logic
   * Handles transient database errors
   */
  private async executeWithRetry<T>(
    query: string,
    params: unknown[],
    maxRetries: number = 3
  ): Promise<T[]>
}
```

**Key Features:**
- Integrates query cache (5 min TTL)
- Integrates column mapping cache (1 hour TTL)
- Retry logic for transient errors
- Used by orchestrator

#### 5. query-orchestrator.ts (Main Entry Point)

**Purpose:** Coordinates all components, main entry point

```typescript
export class QueryOrchestrator {
  constructor(
    private validator: QueryValidator,
    private sanitizer: QuerySanitizer,
    private builder: QueryBuilder,
    private executor: QueryExecutor
  ) {}

  /**
   * Main query method (replaces queryMeasures)
   * PUBLIC API
   */
  async query(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    // 1. Validate params
    const validation = await this.validator.validateQueryParams(params, context);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // 2. Resolve data source config
    const config = await this.resolveDataSourceConfig(params);

    // 3. Build filters
    const filters = await this.buildFilters(params, config);

    // 4. Sanitize filters
    const sanitizedFilters = this.sanitizer.sanitizeFilters(filters);

    // 5. Route to appropriate executor
    if (params.multiple_series?.length > 0) {
      return this.executor.executeMultipleSeries(
        { ...params, filters: sanitizedFilters },
        context
      );
    }

    if (params.period_comparison?.enabled) {
      return this.executor.executePeriodComparison(
        { ...params, filters: sanitizedFilters },
        context
      );
    }

    return this.executor.executeQuery(
      { ...params, filters: sanitizedFilters },
      context
    );
  }

  /**
   * Convenience method: Get practice revenue trend
   * Maintains backward compatibility
   */
  async getPracticeRevenueTrend(
    context: ChartRenderContext,
    practiceUid?: string,
    months: number = 12
  ): Promise<AggAppMeasure[]>

  /**
   * Helper: Resolve data source configuration
   */
  private async resolveDataSourceConfig(
    params: AnalyticsQueryParams
  ): Promise<DataSourceConfig>

  /**
   * Helper: Build filters from params
   */
  private async buildFilters(
    params: AnalyticsQueryParams,
    config: DataSourceConfig
  ): Promise<ChartFilter[]>
}
```

**Key Features:**
- Single entry point
- Coordinates all components
- Clear execution flow
- Eliminates duplication (no more executeBaseQuery)

#### 6. query-types.ts (Shared Types)

```typescript
export interface QueryBuilderConfig {
  tableName: string
  schemaName: string
  columnMappings: ColumnMappings
  filters: ChartFilter[]
  context: ChartRenderContext
  limit?: number
  offset?: number
}

export interface ColumnMappings {
  dateField: string
  timePeriodField: string
  measureValueField: string
  measureTypeField: string
  allColumns: string[]
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export const ALLOWED_OPERATORS = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  not_in: 'NOT IN',
  like: 'ILIKE',
  between: 'BETWEEN',
}

export const OPERATOR_MAPPING: Record<string, string> = {
  'equals': 'eq',
  'not_equals': 'neq',
  'greater_than': 'gt',
  'greater_than_or_equal': 'gte',
  'less_than': 'lt',
  'less_than_or_equal': 'lte',
  'contains': 'like',
  'starts_with': 'like',
  'ends_with': 'like',
  'in': 'in',
  'not_in': 'not_in',
}
```

#### 7. index.ts (Public API)

```typescript
// Module exports
export { QueryOrchestrator } from './query-orchestrator'
export { QueryValidator } from './query-validator'
export { QuerySanitizer } from './query-sanitizer'
export { QueryBuilder } from './query-builder'
export { QueryExecutor } from './query-executor'
export { queryCache } from './cache/query-cache'

// Type exports
export type {
  QueryBuilderConfig,
  ColumnMappings,
  ValidationResult,
} from './query-types'

export {
  ALLOWED_OPERATORS,
  OPERATOR_MAPPING,
} from './query-types'

// Singleton instance for backward compatibility
import { QueryOrchestrator } from './query-orchestrator'
import { QueryValidator } from './query-validator'
import { QuerySanitizer } from './query-sanitizer'
import { QueryBuilder } from './query-builder'
import { QueryExecutor } from './query-executor'

const queryValidator = new QueryValidator()
const querySanitizer = new QuerySanitizer()
const queryBuilder = new QueryBuilder()
const queryExecutor = new QueryExecutor(queryBuilder, queryValidator)
const analyticsQueryBuilder = new QueryOrchestrator(
  queryValidator,
  querySanitizer,
  queryBuilder,
  queryExecutor
)

// Export singleton (maintains existing API)
export { analyticsQueryBuilder }
```

---

## Cache Integration Strategy

### Three-Layer Cache Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Query Results (5 min TTL)                          │
│ analytics:query:result:{hash}                                │
│ - Full query results with data                               │
│ - Invalidated when data source changes                       │
│ - NEW: query-cache.ts                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Column Mappings (1 hour TTL)                       │
│ analytics:query:columns:{schema}:{table}                     │
│ - Metadata about table structure                             │
│ - Invalidated when data source config changes                │
│ - NEW: query-cache.ts                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Data Source Config (24 hour TTL)                   │
│ chartconfig:datasource:{dataSourceId}                        │
│ - Table/column definitions                                   │
│ - Rarely changes                                             │
│ - EXISTING: chart-config-cache.ts                            │
└─────────────────────────────────────────────────────────────┘
```

### New Cache Service: query-cache.ts

**Location:** `lib/services/analytics/cache/query-cache.ts`

```typescript
import { CacheService } from '@/lib/cache/base';
import { log } from '@/lib/logger';
import type {
  AnalyticsQueryResult,
  ChartRenderContext,
  AnalyticsQueryParams,
} from '@/lib/types/analytics';
import { createHash } from 'crypto';

export interface CachedColumnMappings {
  dateField: string;
  timePeriodField: string;
  measureValueField: string;
  measureTypeField: string;
  allColumns: string[];
}

export interface CachedValidationResult {
  isValid: boolean;
  errors: string[];
  validatedAt: number;
}

class QueryCacheService extends CacheService {
  protected namespace = 'analytics:query';
  protected defaultTTL = 300; // 5 minutes

  private readonly QUERY_RESULT_TTL = 300; // 5 minutes
  private readonly COLUMN_MAPPING_TTL = 3600; // 1 hour
  private readonly VALIDATION_TTL = 3600; // 1 hour

  /**
   * Generate deterministic cache key from params + context
   * SECURITY-CRITICAL: Must include security context to prevent
   * cache poisoning (user A seeing user B's data)
   */
  generateQueryKey(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): string {
    const keyData = {
      // Query params
      dataSourceId: params.data_source_id,
      measure: params.measure,
      frequency: params.frequency,
      startDate: params.start_date,
      endDate: params.end_date,
      filters: params.advanced_filters,
      multipleSeries: params.multiple_series,
      periodComparison: params.period_comparison,

      // SECURITY: Include context to isolate cache per user
      accessiblePractices: context.accessible_practices.sort(),
      accessibleProviders: context.accessible_providers.sort(),
      permissionScope: context.permission_scope,
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);

    return this.buildKey('result', hash);
  }

  async getQueryResult(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult | null> {
    const key = this.generateQueryKey(params, context);
    const cached = await this.get<AnalyticsQueryResult>(key);

    if (cached) {
      log.debug('Query result cache hit', {
        component: 'query-cache',
        dataSourceId: params.data_source_id,
        resultCount: cached.data.length,
      });

      return { ...cached, cache_hit: true };
    }

    return null;
  }

  async setQueryResult(
    params: AnalyticsQueryParams,
    context: ChartRenderContext,
    result: AnalyticsQueryResult
  ): Promise<boolean> {
    const key = this.generateQueryKey(params, context);
    return await this.set(key, result, { ttl: this.QUERY_RESULT_TTL });
  }

  async getColumnMappings(
    tableName: string,
    schemaName: string
  ): Promise<CachedColumnMappings | null> {
    const key = this.buildKey('columns', schemaName, tableName);
    return await this.get<CachedColumnMappings>(key);
  }

  async setColumnMappings(
    tableName: string,
    schemaName: string,
    mappings: CachedColumnMappings
  ): Promise<boolean> {
    const key = this.buildKey('columns', schemaName, tableName);
    return await this.set(key, mappings, { ttl: this.COLUMN_MAPPING_TTL });
  }

  async invalidateDataSource(dataSourceId: number): Promise<void> {
    const pattern = this.buildKey('result', '*');
    const deletedCount = await this.delPattern(pattern);

    log.info('Query results invalidated by data source', {
      component: 'query-cache',
      dataSourceId,
      keysDeleted: deletedCount,
    });
  }

  async invalidateColumnMappings(
    tableName: string,
    schemaName: string
  ): Promise<void> {
    const key = this.buildKey('columns', schemaName, tableName);
    await this.del(key);
  }

  async invalidate(): Promise<void> {
    const pattern = this.buildKey('*');
    const deletedCount = await this.delPattern(pattern);

    log.warn('All query cache invalidated', {
      component: 'query-cache',
      keysDeleted: deletedCount,
    });
  }
}

export const queryCache = new QueryCacheService();
```

### Cache Invalidation Coordination

When data sources change, invalidate all cache layers:

```typescript
// In chart-config-service.ts or data source mutation handlers
async function updateDataSource(
  dataSourceId: number,
  updates: DataSourceUpdates
): Promise<void> {
  // 1. Update database
  await db.update(chart_data_sources)
    .set(updates)
    .where(eq(chart_data_sources.data_source_id, dataSourceId));

  // 2. Invalidate all cache layers (coordinated)
  await Promise.all([
    chartConfigCache.invalidateDataSource(dataSourceId), // Layer 3
    queryCache.invalidateDataSource(dataSourceId),       // Layer 2 & 1
  ]);

  log.info('Data source updated and caches invalidated', {
    dataSourceId,
    updates: Object.keys(updates),
  });
}
```

### Performance Impact

**Before (No Query Cache):**
```
Request 1: DB query → 234ms
Request 2: DB query → 245ms (same query, no cache)
Request 3: DB query → 238ms (same query, no cache)
Total: 717ms
```

**After (With Query Cache):**
```
Request 1: DB query → 234ms → cache write (5ms)
Request 2: Cache hit → 3ms ✅ (99% faster)
Request 3: Cache hit → 2ms ✅ (99% faster)
Total: 244ms (66% faster overall)
```

---

## Implementation Plan

### Phase 1: Foundation & Quick Wins (Week 1)

**Goal:** Create new structure, add caching, eliminate duplication

#### 1.1 Create Directory Structure

```bash
mkdir -p lib/services/analytics/cache
```

#### 1.2 Create query-cache.ts

**File:** `lib/services/analytics/cache/query-cache.ts`

- Create `QueryCacheService` extending `CacheService`
- Implement query result caching with deterministic key generation
- Implement column mapping caching
- Add invalidation methods
- Export singleton instance

**Testing:**
- Unit tests for cache key generation
- Test security context inclusion in keys
- Test invalidation patterns

**Estimated Time:** 1 day

#### 1.3 Extract query-types.ts

**File:** `lib/services/analytics/query-types.ts`

- Move all interface definitions
- Move constants (ALLOWED_OPERATORS, OPERATOR_MAPPING)
- Document each type

**Estimated Time:** 2 hours

#### 1.4 Quick Fix: Eliminate Duplication

**Immediate fix before full refactor:**

1. In `analytics-query-builder.ts`:
   - Rename `executeBaseQuery()` → `executeCoreQuery()`
   - Update `queryMeasures()` to delegate to `executeCoreQuery()`:

```typescript
async queryMeasures(params, context) {
  if (params.multiple_series?.length > 0) {
    return this.queryMultipleSeries(params, context);
  }

  if (params.period_comparison?.enabled) {
    return this.queryWithPeriodComparison(params, context);
  }

  // Delegate to core executor (eliminates duplication)
  return this.executeCoreQuery(params, context);
}
```

2. Update `queryWithPeriodComparison()` to use `executeCoreQuery()`
3. Remove duplicate code from `queryMeasures()` (lines 368-504)

**Benefits:**
- ✅ Eliminates 145 lines immediately
- ✅ No breaking changes
- ✅ Easier to extract later

**Testing:**
- Run existing integration tests
- Verify period comparison still works
- Verify multiple series still works

**Estimated Time:** 4 hours

#### 1.5 Add Cache to Existing Code

**Integrate query cache into `executeCoreQuery()`:**

```typescript
private async executeCoreQuery(params, context) {
  // Check cache first
  const cached = await queryCache.getQueryResult(params, context);
  if (cached) {
    return cached;
  }

  // Execute query (existing logic)
  const result = await this.executeQueryLogic(params, context);

  // Cache result (fire and forget)
  queryCache.setQueryResult(params, context, result).catch(() => {});

  return result;
}
```

**Testing:**
- Test cache hits
- Test cache misses
- Test cache invalidation
- Performance benchmarks

**Estimated Time:** 1 day

**Phase 1 Deliverables:**
- ✅ New cache infrastructure
- ✅ Types extracted
- ✅ Duplication eliminated (145 lines removed)
- ✅ Query caching working
- ✅ No breaking changes

---

### Phase 2: Extract Modules (Week 2)

**Goal:** Extract validation and sanitization into separate modules

#### 2.1 Extract query-validator.ts

**File:** `lib/services/analytics/query-validator.ts`

**Extract from analytics-query-builder.ts:**
- `validateTable()` method
- `validateField()` method
- `validateOperator()` method
- `ALLOWED_OPERATORS` constant
- Add `validateQueryParams()` method

**Changes:**
1. Create `QueryValidator` class
2. Move validation methods
3. Add comprehensive JSDoc
4. Export singleton instance

**Update analytics-query-builder.ts:**
```typescript
import { queryValidator } from './analytics/query-validator';

// Replace this.validateTable() calls with:
await queryValidator.validateTable(tableName, schemaName, config);
```

**Testing:**
- Unit tests for each validation method
- Test error cases (unauthorized table, field, operator)
- Test edge cases
- Security audit tests

**Estimated Time:** 2 days

#### 2.2 Extract query-sanitizer.ts

**File:** `lib/services/analytics/query-sanitizer.ts`

**Extract from analytics-query-builder.ts:**
- `sanitizeValue()` method
- `sanitizeSingleValue()` method
- `isSafeString()` method
- `isValidDateString()` method
- Add `sanitizeFilters()` method

**Changes:**
1. Create `QuerySanitizer` class
2. Move sanitization methods
3. Add comprehensive JSDoc
4. Export singleton instance

**Update analytics-query-builder.ts:**
```typescript
import { querySanitizer } from './analytics/query-sanitizer';

// Replace this.sanitizeValue() calls with:
const sanitized = querySanitizer.sanitizeValue(value, operator);
```

**Testing:**
- Unit tests for SQL injection attempts
- Test safe string patterns
- Test date validation
- Test array value sanitization
- Test BETWEEN operator

**Estimated Time:** 2 days

**Phase 2 Deliverables:**
- ✅ Security validation isolated
- ✅ Input sanitization isolated
- ✅ Comprehensive test coverage
- ✅ No breaking changes

---

### Phase 3: Extract Builder & Executor (Week 3)

**Goal:** Extract SQL building and execution logic

#### 3.1 Extract query-builder.ts

**File:** `lib/services/analytics/query-builder.ts`

**Extract from analytics-query-builder.ts:**
- `buildWhereClause()` method
- Column mapping logic from `executeCoreQuery()`
- SELECT column building logic
- Add new methods:
  - `buildSecurityFilters()`
  - `buildUserFilters()`
  - `buildSelectColumns()`
  - `buildOrderByClause()`
  - `buildQuery()`
  - `buildAggregationQuery()`

**Changes:**
1. Create `QueryBuilder` class
2. Extract all SQL building logic
3. Make all methods pure (no DB calls)
4. Return `{ sql: string; params: unknown[] }`

**Example:**
```typescript
export class QueryBuilder {
  async buildWhereClause(
    filters: ChartFilter[],
    context: ChartRenderContext,
    config: QueryBuilderConfig
  ): Promise<{ clause: string; params: unknown[] }> {
    const { conditions, params } = this.buildSecurityFilters(context);

    // Add user filters
    const userFilters = this.buildUserFilters(filters, params.length + 1);
    conditions.push(...userFilters.conditions);
    params.push(...userFilters.params);

    const clause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return { clause, params };
  }

  private buildSecurityFilters(context: ChartRenderContext) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Practice UID filtering
    if (context.accessible_practices.length > 0) {
      conditions.push(`practice_uid = ANY($${paramIndex})`);
      params.push(context.accessible_practices);
      paramIndex++;
    }

    // Provider UID filtering
    if (context.accessible_providers.length > 0) {
      conditions.push(`(provider_uid IS NULL OR provider_uid = ANY($${paramIndex}))`);
      params.push(context.accessible_providers);
      paramIndex++;
    }

    return { conditions, params };
  }

  // ... other methods
}
```

**Testing:**
- Unit tests for WHERE clause building
- Test security filter generation
- Test parameterized queries
- Test SELECT column generation
- Test aggregation query building

**Estimated Time:** 3 days

#### 3.2 Extract query-executor.ts

**File:** `lib/services/analytics/query-executor.ts`

**Extract from analytics-query-builder.ts:**
- `executeCoreQuery()` method
- `queryMultipleSeries()` method
- `queryWithPeriodComparison()` method
- `getColumnMappings()` method
- Total calculation logic

**Changes:**
1. Create `QueryExecutor` class
2. Inject `QueryBuilder` and `QueryValidator` dependencies
3. Integrate query cache
4. Add retry logic
5. Add column mapping cache

**Example:**
```typescript
export class QueryExecutor {
  constructor(
    private queryBuilder: QueryBuilder,
    private validator: QueryValidator
  ) {}

  async executeQuery(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    // Check cache
    const cached = await queryCache.getQueryResult(params, context);
    if (cached) return cached;

    // Execute
    const result = await this.executeQueryDirect(params, context);

    // Cache
    queryCache.setQueryResult(params, context, result).catch(() => {});

    return result;
  }

  async getColumnMappings(
    tableName: string,
    schemaName: string,
    config?: DataSourceConfig
  ): Promise<ColumnMappings> {
    // Check cache
    const cached = await queryCache.getColumnMappings(tableName, schemaName);
    if (cached) return cached;

    // Resolve
    const mappings = await this.resolveColumnMappings(
      tableName,
      schemaName,
      config
    );

    // Cache
    queryCache.setColumnMappings(tableName, schemaName, mappings).catch(() => {});

    return mappings;
  }
}
```

**Testing:**
- Integration tests with database
- Test caching behavior
- Test retry logic
- Test period comparison
- Test multiple series

**Estimated Time:** 3 days

**Phase 3 Deliverables:**
- ✅ SQL building isolated
- ✅ Query execution isolated
- ✅ Cache fully integrated
- ✅ No breaking changes

---

### Phase 4: Create Orchestrator & Cleanup (Week 4)

**Goal:** Create orchestrator, update imports, deprecate old file

#### 4.1 Create query-orchestrator.ts

**File:** `lib/services/analytics/query-orchestrator.ts`

**Responsibilities:**
- Coordinate all components
- Main entry point
- Route queries to appropriate executor
- Maintain backward compatibility

```typescript
export class QueryOrchestrator {
  constructor(
    private validator: QueryValidator,
    private sanitizer: QuerySanitizer,
    private builder: QueryBuilder,
    private executor: QueryExecutor
  ) {}

  async query(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    // 1. Validate
    await this.validator.validateQueryParams(params, context);

    // 2. Resolve config
    const config = await this.resolveDataSourceConfig(params);

    // 3. Build filters
    const filters = await this.buildFilters(params, config);

    // 4. Sanitize
    const sanitized = this.sanitizer.sanitizeFilters(filters);

    // 5. Route to executor
    if (params.multiple_series?.length > 0) {
      return this.executor.executeMultipleSeries(
        { ...params, filters: sanitized },
        context
      );
    }

    if (params.period_comparison?.enabled) {
      return this.executor.executePeriodComparison(
        { ...params, filters: sanitized },
        context
      );
    }

    return this.executor.executeQuery(
      { ...params, filters: sanitized },
      context
    );
  }

  // Convenience method for backward compatibility
  async queryMeasures(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    return this.query(params, context);
  }
}
```

**Testing:**
- Integration tests for full flow
- Test routing logic
- Test error handling
- Test backward compatibility

**Estimated Time:** 2 days

#### 4.2 Create analytics/index.ts

**File:** `lib/services/analytics/index.ts`

```typescript
// Module exports
export { QueryOrchestrator } from './query-orchestrator'
export { QueryValidator } from './query-validator'
export { QuerySanitizer } from './query-sanitizer'
export { QueryBuilder } from './query-builder'
export { QueryExecutor } from './query-executor'
export { queryCache } from './cache/query-cache'

// Type exports
export type {
  QueryBuilderConfig,
  ColumnMappings,
  ValidationResult,
} from './query-types'

export {
  ALLOWED_OPERATORS,
  OPERATOR_MAPPING,
} from './query-types'

// Singleton for backward compatibility
const queryValidator = new QueryValidator()
const querySanitizer = new QuerySanitizer()
const queryBuilder = new QueryBuilder()
const queryExecutor = new QueryExecutor(queryBuilder, queryValidator)

export const analyticsQueryBuilder = new QueryOrchestrator(
  queryValidator,
  querySanitizer,
  queryBuilder,
  queryExecutor
)
```

**Estimated Time:** 1 hour

#### 4.3 Update Dependent Files

**Files to update:**
1. `lib/services/chart-handlers/base-handler.ts`
2. `lib/services/chart-executor.ts`
3. `app/api/admin/analytics/measures/route.ts`
4. `app/api/admin/analytics/chart-data/route.ts`

**Change:**
```typescript
// Before
import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';

// After
import { analyticsQueryBuilder } from '@/lib/services/analytics';
```

**Testing:**
- Run all integration tests
- Test all API endpoints
- Test chart rendering

**Estimated Time:** 1 day

#### 4.4 Deprecate Old File

1. Move `analytics-query-builder.ts` → `analytics-query-builder.deprecated.ts`
2. Add deprecation notice at top of file
3. Update to export from new location:

```typescript
/**
 * @deprecated This file is deprecated. Use '@/lib/services/analytics' instead.
 * This file will be removed in a future version.
 *
 * Migration:
 * - import { analyticsQueryBuilder } from '@/lib/services/analytics'
 */

// Re-export from new location for backward compatibility
export { analyticsQueryBuilder } from './analytics';
```

4. Update documentation
5. Add removal to backlog (6 months out)

**Estimated Time:** 2 hours

#### 4.5 Update Documentation

**Files to update:**
1. `docs/query_builder_refactor.md` - Mark as completed
2. `docs/services/STANDARDIZATION_PROGRESS.md` - Update analytics section
3. Create `docs/services/analytics-query-service.md` - New documentation

**New documentation should include:**
- Architecture overview
- Module responsibilities
- Cache strategy
- Security model
- Usage examples
- Migration guide

**Estimated Time:** 1 day

**Phase 4 Deliverables:**
- ✅ Orchestrator created
- ✅ All imports updated
- ✅ Old file deprecated
- ✅ Documentation updated
- ✅ Full test coverage

---

## Migration Strategy

### Backward Compatibility

**Key Principle:** No breaking changes during migration

1. **Maintain existing API:**
   ```typescript
   // Old code continues to work
   import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';
   const result = await analyticsQueryBuilder.queryMeasures(params, context);
   ```

2. **New code can use new API:**
   ```typescript
   // New code can use new imports
   import { analyticsQueryBuilder } from '@/lib/services/analytics';
   const result = await analyticsQueryBuilder.query(params, context);
   ```

3. **Gradual migration:**
   - Phase 1-3: Old file still works
   - Phase 4: Old file deprecated but functional
   - 6 months later: Old file removed

### Rollback Plan

**If issues arise during any phase:**

1. **Revert Git commits** - Each phase is a separate commit
2. **Feature flag** - Can disable cache layer if issues
3. **Keep old file** - Maintain original until fully validated

### Testing During Migration

**Each phase includes:**
1. Unit tests for new modules
2. Integration tests for full flow
3. Regression tests for existing functionality
4. Performance benchmarks

**Test coverage requirements:**
- Unit tests: >80% coverage
- Integration tests: All major flows
- Security tests: All validation paths
- Performance tests: No regression

---

## Testing Strategy

### Unit Tests

#### query-validator.test.ts
```typescript
describe('QueryValidator', () => {
  describe('validateTable', () => {
    it('should allow valid table names')
    it('should reject unauthorized table names')
    it('should reject inactive tables')
  })

  describe('validateField', () => {
    it('should allow valid field names')
    it('should reject unauthorized field names')
    it('should use cached config when provided')
  })

  describe('validateOperator', () => {
    it('should allow whitelisted operators')
    it('should reject non-whitelisted operators')
  })

  describe('validateQueryParams', () => {
    it('should validate complete query params')
    it('should return validation errors')
  })
})
```

#### query-sanitizer.test.ts
```typescript
describe('QuerySanitizer', () => {
  describe('sanitizeValue', () => {
    it('should handle single values')
    it('should handle arrays for IN operator')
    it('should handle BETWEEN operator')
  })

  describe('sanitizeSingleValue', () => {
    it('should remove SQL injection attempts')
    it('should preserve safe strings')
    it('should validate date formats')
    it('should validate numbers')
  })

  describe('isSafeString', () => {
    it('should accept alphanumeric + safe punctuation')
    it('should reject SQL keywords')
    it('should reject special characters')
  })

  describe('isValidDateString', () => {
    it('should accept valid YYYY-MM-DD dates')
    it('should reject invalid date formats')
    it('should reject invalid dates (Feb 31)')
  })
})
```

#### query-builder.test.ts
```typescript
describe('QueryBuilder', () => {
  describe('buildWhereClause', () => {
    it('should build security filters')
    it('should build user filters')
    it('should combine filters with AND')
    it('should generate parameterized queries')
  })

  describe('buildSecurityFilters', () => {
    it('should add practice_uid filter')
    it('should add provider_uid filter with NULL handling')
    it('should handle empty arrays (fail-closed)')
  })

  describe('buildSelectColumns', () => {
    it('should build column list with aliases')
    it('should use dynamic column mappings')
  })

  describe('buildQuery', () => {
    it('should assemble complete query')
    it('should include ORDER BY')
    it('should include LIMIT')
  })
})
```

#### query-executor.test.ts
```typescript
describe('QueryExecutor', () => {
  describe('executeQuery', () => {
    it('should check cache first')
    it('should execute on cache miss')
    it('should cache results')
    it('should handle database errors')
  })

  describe('getColumnMappings', () => {
    it('should check cache first')
    it('should resolve on cache miss')
    it('should cache mappings')
  })

  describe('executeMultipleSeries', () => {
    it('should use IN operator for efficiency')
    it('should add series metadata')
  })

  describe('executePeriodComparison', () => {
    it('should execute queries in parallel')
    it('should combine results')
    it('should add comparison metadata')
  })
})
```

#### query-cache.test.ts
```typescript
describe('QueryCache', () => {
  describe('generateQueryKey', () => {
    it('should generate deterministic keys')
    it('should include security context')
    it('should handle same params + different context')
  })

  describe('getQueryResult', () => {
    it('should return cached result')
    it('should return null on miss')
    it('should mark cache hit')
  })

  describe('invalidateDataSource', () => {
    it('should invalidate all results for data source')
    it('should use pattern matching')
  })
})
```

### Integration Tests

#### analytics-query-builder.integration.test.ts
```typescript
describe('Analytics Query Builder Integration', () => {
  describe('Simple queries', () => {
    it('should execute basic query')
    it('should apply security filters')
    it('should cache results')
  })

  describe('Multiple series', () => {
    it('should execute multiple series query')
    it('should add series metadata')
  })

  describe('Period comparison', () => {
    it('should execute period comparison')
    it('should calculate correct date ranges')
    it('should combine results')
  })

  describe('Security', () => {
    it('should fail-closed for empty practice_uids')
    it('should isolate cache by user')
    it('should prevent SQL injection')
  })
})
```

### Performance Tests

#### query-performance.test.ts
```typescript
describe('Query Performance', () => {
  it('should cache hit < 10ms', async () => {
    // First request (cache miss)
    const start1 = Date.now();
    await queryBuilder.query(params, context);
    const miss = Date.now() - start1;

    // Second request (cache hit)
    const start2 = Date.now();
    await queryBuilder.query(params, context);
    const hit = Date.now() - start2;

    expect(hit).toBeLessThan(10);
    expect(hit).toBeLessThan(miss / 10); // 90% faster
  });

  it('should not degrade query execution', async () => {
    const baseline = await getBaselineQueryTime();
    const current = await getCurrentQueryTime();

    expect(current).toBeLessThanOrEqual(baseline * 1.1); // Max 10% slower
  });
});
```

---

## Success Metrics

### Code Quality Metrics

| Metric | Current | Target | Validation |
|--------|---------|--------|------------|
| Lines per file | 1,093 | <400 | File size check |
| Cyclomatic complexity | 30+ | <20 | ESLint complexity rule |
| Code duplication | 40% | <5% | SonarQube analysis |
| Test coverage | 0% | >80% | Jest coverage report |
| Methods per class | 16 | <10 | Manual audit |

### Performance Metrics

| Metric | Current | Target | Validation |
|--------|---------|--------|------------|
| Cache hit latency | N/A | <10ms | Performance tests |
| Cache miss latency | ~240ms | ~240ms | No regression |
| Query result caching | 0% | 80%+ | Cache hit rate metric |
| Column mapping lookups | Every query | Cached | Call count metric |

### Maintainability Metrics

| Metric | Current | Target | Validation |
|--------|---------|--------|------------|
| Security code isolation | Mixed | Separate module | Architecture review |
| Single Responsibility | No | Yes | Module responsibility audit |
| Pure functions | Few | Most | Function purity analysis |
| Testability | Low | High | Test coverage + mocking ease |

### Validation Checklist

**Code Quality:**
- [ ] All files <400 lines
- [ ] Complexity <20 per method
- [ ] Duplication <5%
- [ ] Test coverage >80%

**Functionality:**
- [ ] All existing tests pass
- [ ] No breaking API changes
- [ ] Security validation works
- [ ] Cache hit/miss working

**Performance:**
- [ ] Cache hits <10ms
- [ ] No query regression
- [ ] 80%+ cache hit rate
- [ ] Column mapping cached

**Documentation:**
- [ ] Architecture documented
- [ ] Module responsibilities clear
- [ ] Cache strategy documented
- [ ] Migration guide complete

---

## Risk Assessment

### High Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Breaking existing functionality** | HIGH | MEDIUM | - Comprehensive integration tests<br>- Maintain backward compatibility<br>- Phased rollout<br>- Easy rollback plan |
| **Security regression** | HIGH | LOW | - Security-focused testing<br>- Separate security module<br>- Audit logging<br>- Code review by security team |
| **Cache poisoning** | HIGH | LOW | - Include security context in cache keys<br>- User isolation in cache<br>- Cache key validation<br>- Security tests |

### Medium Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Performance degradation** | MEDIUM | LOW | - Performance benchmarks<br>- Column mapping cache<br>- Query result cache<br>- Load testing |
| **Cache invalidation bugs** | MEDIUM | MEDIUM | - Coordinated invalidation<br>- Pattern matching tests<br>- Cache consistency tests<br>- Monitoring |
| **Incomplete migration** | MEDIUM | MEDIUM | - Clear checklist<br>- Phase-by-phase validation<br>- Automated tests<br>- Code review |

### Low Risk Items

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Developer confusion** | LOW | MEDIUM | - Clear documentation<br>- Migration guide<br>- Deprecation warnings<br>- Team training |
| **Test maintenance** | LOW | HIGH | - Well-structured tests<br>- Test helpers<br>- Clear naming<br>- Documentation |

### Rollback Plan

**If critical issues are discovered:**

1. **Immediate:** Revert to previous Git commit
2. **Short-term:** Disable cache layer via feature flag
3. **Investigation:** Identify root cause
4. **Fix:** Address issue in isolated environment
5. **Re-deploy:** With additional tests

**Rollback triggers:**
- API endpoint failures >1%
- Query execution errors >0.1%
- Security violations detected
- Performance regression >20%

---

## Appendices

### Appendix A: File Mapping

**Current → New Structure:**

```
analytics-query-builder.ts (1,093 lines)
  ├─ Lines 28-88   → query-validator.ts (Security)
  ├─ Lines 90-174  → query-sanitizer.ts (Sanitization)
  ├─ Lines 179-286 → query-builder.ts (SQL building)
  ├─ Lines 288-339 → query-executor.ts (Column mappings)
  ├─ Lines 344-515 → query-orchestrator.ts (Main entry)
  ├─ Lines 521-669 → query-executor.ts (Core execution)
  ├─ Lines 671-824 → query-executor.ts (Multiple series)
  ├─ Lines 826-970 → query-executor.ts (Period comparison)
  ├─ Lines 974-1001 → query-orchestrator.ts (Convenience)
  └─ Lines 1003-1089 → query-sanitizer.ts (Advanced filters)
```

### Appendix B: Import Changes

**Files that import analytics-query-builder:**

1. `lib/services/chart-handlers/base-handler.ts`
   ```typescript
   // Before
   import { analyticsQueryBuilder } from '../analytics-query-builder';

   // After
   import { analyticsQueryBuilder } from '../analytics';
   ```

2. `lib/services/chart-executor.ts`
   ```typescript
   // Before
   import { analyticsQueryBuilder } from './analytics-query-builder';

   // After
   import { analyticsQueryBuilder } from './analytics';
   ```

3. `app/api/admin/analytics/measures/route.ts`
   ```typescript
   // Before
   import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';

   // After
   import { analyticsQueryBuilder } from '@/lib/services/analytics';
   ```

4. `app/api/admin/analytics/chart-data/route.ts`
   ```typescript
   // Before
   import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';

   // After
   import { analyticsQueryBuilder } from '@/lib/services/analytics';
   ```

**No other code changes needed** - API remains identical.

### Appendix C: Cache Key Examples

```typescript
// Query result cache (5 min TTL)
// Format: analytics:query:result:{hash}
analytics:query:result:a3f5b8c9d2e1f4g6

// Column mappings cache (1 hour TTL)
// Format: analytics:query:columns:{schema}:{table}
analytics:query:columns:ih:agg_app_measures

// Validation cache (1 hour TTL)
// Format: analytics:query:validation:{hash}
analytics:query:validation:table:ih.agg_app_measures

// Data source config (24 hour TTL - existing)
// Format: chartconfig:datasource:{dataSourceId}
chartconfig:datasource:1

// Chart data (5 min TTL - existing)
// Format: chart:data:{chartType}:{dataSourceId}:{hash}
chart:data:line:1:a3f5b8c9d2e1f4g6
```

### Appendix D: Testing Checklist

**Unit Tests:**
- [ ] query-validator.test.ts
- [ ] query-sanitizer.test.ts
- [ ] query-builder.test.ts
- [ ] query-executor.test.ts
- [ ] query-orchestrator.test.ts
- [ ] query-cache.test.ts

**Integration Tests:**
- [ ] Simple queries work
- [ ] Multiple series work
- [ ] Period comparison works
- [ ] Security filters applied
- [ ] Cache hit/miss behavior
- [ ] Invalidation works

**Performance Tests:**
- [ ] Cache hit <10ms
- [ ] No query regression
- [ ] Cache hit rate >80%
- [ ] Column mapping cached

**Security Tests:**
- [ ] SQL injection blocked
- [ ] Unauthorized table rejected
- [ ] Unauthorized field rejected
- [ ] Unauthorized operator rejected
- [ ] Cache isolation by user
- [ ] Fail-closed for empty arrays

**Regression Tests:**
- [ ] All API endpoints work
- [ ] All chart types render
- [ ] Dashboard rendering works
- [ ] No breaking changes

### Appendix E: Timeline

```
Week 1: Foundation & Quick Wins
├─ Day 1: Create cache infrastructure
├─ Day 2: Extract types
├─ Day 3: Quick fix (eliminate duplication)
├─ Day 4: Add cache integration
└─ Day 5: Testing & validation

Week 2: Extract Modules
├─ Day 1-2: Extract query-validator.ts
├─ Day 3-4: Extract query-sanitizer.ts
└─ Day 5: Testing & validation

Week 3: Extract Builder & Executor
├─ Day 1-3: Extract query-builder.ts
├─ Day 4-5: Extract query-executor.ts

Week 4: Create Orchestrator & Cleanup
├─ Day 1-2: Create query-orchestrator.ts
├─ Day 3: Update imports
├─ Day 4: Documentation
└─ Day 5: Final testing & validation
```

---

## Approval & Sign-off

**Document Version:** 1.0
**Author:** Claude AI Assistant
**Date:** 2025-01-15

**Approvals Required:**
- [ ] Tech Lead Review
- [ ] Architecture Review
- [ ] Security Review
- [ ] QA Review

**Sign-off Criteria:**
- [ ] Document reviewed and approved
- [ ] Timeline agreed upon
- [ ] Resources allocated
- [ ] Risks acknowledged
- [ ] Success metrics defined

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-01-15 | 1.0 | Initial document | Claude AI |

---

*End of Document*
