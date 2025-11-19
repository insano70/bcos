# Analytics System Optimization Plan (v4)

**Date:** November 19, 2025  
**Author:** Platform Analytics Team  
**Scope:** Chart handlers, dashboard rendering stack, analytics query services, Redis data-source cache, dimension expansion pipeline, supporting utilities, comprehensive testing, and documentation  
**Duration:** 7-8 weeks (55-67 engineering hours) covering seven sequential phases  
**Status:** Production-ready for implementation  

---

## 1. Overview

This v4 plan refines v3 by adding explicit test scenarios, error handling requirements, performance degradation response protocols, frontend validation, and comprehensive API documentation. All refactors maintain dashboard rendering, Redis cache, and dimension expansion in lockstep while preserving observability, security posture, and type safety. Each phase completes only after required tests, cache/dimension smoke suites, and benchmark comparisons are captured in `docs/analytics/benchmarks-history.md`.

### Key Improvements Over v3
- ✅ Explicit cache key compatibility test scenarios with byte-for-byte validation
- ✅ QueryOrchestrator binding test scenarios for multi-series/comparison recursion
- ✅ Security log payload verification with spy assertions
- ✅ Performance degradation response plan with optimization tactics
- ✅ Frontend integration tests for dimension expansion UI
- ✅ Error handling parity tests matching legacy behavior
- ✅ TypeScript strict mode requirements
- ✅ API documentation and migration guides
- ✅ Multi-series dimension expansion testing
- ✅ Cache warming integration validation

---

## 2. Guiding Principles

1. **Security & Observability First** – Existing `log.info`/`log.security` payloads must be preserved byte-for-byte or explicitly superseded with documented rationale; new utilities expose logging hooks for parity.
2. **Shared Behaviour, Single Source** – Query/filter utilities must be consumed by chart handlers, orchestrators, cache services, and dimension expansion to prevent divergence.
3. **SRP Without God Classes** – Maintain current modular dashboard services; optimize within boundaries rather than merging into a monolith.
4. **Parity Testing & Benchmarks** – Refactors touching query params or runtime filters must pass dashboard, analytics, cache, and dimension-expansion tests plus benchmark comparisons.
5. **Feature-flagged Safety** – High-risk changes (Phase 1) ship behind `USE_NEW_QUERY_BUILDERS` to enable fast rollback.
6. **Type Safety** – All new utilities must:
   - Use strict TypeScript (no `any` types without explicit justification)
   - Properly type all function parameters and return values
   - Use generic constraints where appropriate
   - Maintain compatibility with existing type definitions
   - Pass `pnpm tsc --noEmit` with zero warnings
7. **Documentation as Deliverable** – ADRs, log inventories, API references, and benchmark deltas are required outputs, not optional notes.

---

## 3. Current Architecture Snapshot

| Area | Key Components | Notes |
| --- | --- | --- |
| Chart query construction | `BaseChartHandler.buildQueryParams`, `QueryExecutor.executeLegacyQuery` | Duplicate logic + logging |
| Dashboard rendering | `DashboardLoaderService`, `FilterService`, `ChartConfigBuilderService`, `BatchExecutorService` | Shared with dimension expansion |
| Analytics orchestration | `QueryOrchestrator` + `queryExecutor` (multi-series, comparison, legacy path) | Routes between cache & legacy |
| Redis cache | `lib/cache/data-source-cache.ts` + cache operations | RBAC + advanced filters applied in-memory |
| Dimension expansion | `dimension-expansion-renderer`, `dimension-discovery-service`, `ChartConfigBuilderService` | Reuses dashboard config builder |

---

## 4. Dependencies & Tooling

| Asset | Needed By | Notes | Action if Missing |
| --- | --- | --- | --- |
| `scripts/benchmark-dashboard-rendering.ts` | Phases 0–5 | Captures performance metrics | **CREATE in Phase 0** |
| `scripts/cache-smoke.ts` | Phases 0–5 | Runs cache hit/miss scenarios | **CREATE in Phase 0** |
| `tests/integration/dimension-expansion` suite | Phases 1–5 | End-to-end expansion validation | **ADD if missing in Phase 0** |
| `tests/integration/cache/data-source-cache.test.ts` | Phases 1–6 | Cache path validation | **CREATE in Phase 1** |
| `docs/analytics/log-inventory.md` | Phases 0, 1, 3 | Log payload snapshots | **CREATE in Phase 0** |
| `docs/analytics/benchmarks-history.md` | Every phase | Benchmark comparison tracking | **CREATE in Phase 0** |

---

## 5. Phase Plan

### Phase 0 – Baseline, Benchmarks & Instrumentation (Week 0, 7h, Medium Risk)
**Goal:** Capture behaviour, performance, and observability baselines before code changes; create missing tooling.

#### Tasks
1. **Create Benchmark Infrastructure** (if missing, +2h)
   - `scripts/benchmark-dashboard-rendering.ts` - Performance harness with configurable scenarios
   - `scripts/cache-smoke.ts` - Cache validation script
   - Scenario configs in `benchmarks/` directory
   
2. **Log Inventory**
   - Enumerate all `log.info` / `log.security` payloads from:
     - `BaseChartHandler.buildQueryParams` (lines 208-259)
     - `FilterService.validateAndResolve`
     - `data-source-cache` RBAC + advanced filter handling
     - `dimension-expansion-renderer` render steps
   - Store complete payload structures in `docs/analytics/log-inventory.md`
   
3. **Benchmark Baseline**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json`
   - Capture metrics:
     - Dashboard render time (10 charts, cold cache)
     - Dashboard render time (10 charts, warm cache)
     - Dimension expansion (20 dimension values)
     - Single chart render (legacy path)
     - Single chart render (cache path)
     - Redis cache hit latency
     - Redis cache miss + populate latency
   - Store in `benchmarks/baseline-<YYYY-MM-DD>.json`
   - Summarize in `docs/analytics/benchmarks-history.md`
   
4. **Test Suite Validation**
   - `pnpm test -- --runInBand tests/integration/dashboard-rendering`
   - `pnpm test -- --runInBand tests/integration/rbac/charts-service.test.ts`
   - Create `tests/integration/dimension-expansion/basic.test.ts` if missing
   
5. **Manual Validation**
   - Dashboard with org filter → chart fullscreen → "Expand by Dimension" → verify expansion works
   - Document current UX and expected behavior
   
6. **Cache Smoke Test**
   - `pnpm ts-node scripts/cache-smoke.ts --clear --scenario baseline`
   - Verify cache warming, hit/miss detection, invalidation
   
7. **Code Metrics Snapshot**
   - `npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50`
   - Store in `benchmarks/code-metrics-baseline.json`
   - Capture LOC for: BaseChartHandler, QueryExecutor, ChartConfigBuilderService

#### Deliverables
- ✅ `docs/analytics/log-inventory.md` (complete payload structures)
- ✅ `docs/analytics/benchmarks-history.md` (baseline entries)
- ✅ `benchmarks/baseline-<date>.json` (raw data)
- ✅ `benchmarks/code-metrics-baseline.json` (duplication metrics)
- ✅ Benchmark scripts (if created)

#### Go / No-Go Criteria
- ✅ **GO:** All baseline tests green, scripts functional, metrics captured
- ❌ **NO-GO:** Missing tooling, failing integration tests, or incomplete metrics → halt and fix before Phase 1

#### Validation Commands
```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json
pnpm ts-node scripts/cache-smoke.ts --scenario baseline
```

---

### Phase 1 – Observability-Preserving Query Builders (Week 1, 12h, Medium-High Risk)
**Goal:** Extract `QueryFilterBuilder` / `QueryParamsBuilder` with comprehensive testing, logging parity, and cache compatibility guarantees.

#### Tasks

1. **Create `lib/utils/query-builders/query-filter-builder.ts`**
   
   **Advanced Filter Types Support:**
   - Equality: `{ field: 'status', operator: 'eq', value: 'active' }`
   - Inequality: `{ field: 'amount', operator: 'gt', value: 1000 }`
   - In/Not In: `{ field: 'category', operator: 'in', value: ['A', 'B', 'C'] }`
   - Date Ranges: `{ field: 'created_at', operator: 'gte', value: '2024-01-01' }`
   - Like/ILike: `{ field: 'name', operator: 'like', value: '%smith%' }`
   - Null Checks: `{ field: 'deleted_at', operator: 'is_null' }`
   
   **Security Features:**
   - Logging callbacks: `onFailClosed`, `onSecurityEvent`
   - Fail-closed practice filter (empty array → `[-1]`)
   - SQL injection prevention via parameterization
   - Comprehensive security logging with structured metadata
   
2. **Create `lib/utils/query-builders/query-params-builder.ts`**
   - Accepts chart config + logging callbacks
   - Methods: `fromChartConfig()`, `addRBACFilters()`, `addDateRange()`
   - Callbacks: `onPracticeFilterApplied`, `onPracticeFilterFailClosed`
   
3. **Update `BaseChartHandler.buildQueryParams`**
   - Wrap behind `USE_NEW_QUERY_BUILDERS` feature flag
   - Delegate to `QueryParamsBuilder.fromChartConfig()`
   - Forward logging callbacks that emit identical payloads to current implementation
   - Keep old implementation as fallback
   
4. **Update `QueryExecutor.executeLegacyQuery`**
   - Use `QueryFilterBuilder` for filter construction
   - Preserve all metadata for debugging
   - Maintain identical SQL query generation
   
5. **Comprehensive Unit Tests**
   
   **`tests/unit/utils/query-builders/query-filter-builder.test.ts`:**
   ```typescript
   describe('QueryFilterBuilder', () => {
     describe('Security', () => {
       it('should fail-closed for empty practiceUids (CRITICAL)', () => {
         const result = QueryFilterBuilder.buildPracticeFilter([]);
         expect(result?.value).toEqual([-1]);
       });
       
       it('should preserve security logging for fail-closed cases', () => {
         const logSpy = vi.spyOn(log, 'security');
         QueryFilterBuilder.buildPracticeFilter([]);
         expect(logSpy).toHaveBeenCalledWith(
           expect.stringContaining('fail-closed'),
           'high',
           expect.objectContaining({ failedClosed: true })
         );
       });
       
       it('should handle SQL injection attempts safely', () => {
         const malicious = "1' OR '1'='1";
         const result = QueryFilterBuilder.buildMeasureFilter(malicious);
         expect(result?.value).toBe(malicious); // Stored as-is, parameterized in SQL
       });
     });
     
     describe('All Filter Types', () => {
       // Test eq, gt, gte, lt, lte, in, not_in, like, ilike, is_null
     });
   });
   ```
   
   **`tests/unit/utils/query-builders/query-params-builder.test.ts`:**
   - Test logging callback invocation via spies/mocks
   - Test all parameter combinations
   - Test fail-closed scenarios with logging verification
   
   **`tests/unit/utils/query-builders/error-handling.test.ts`:**
   ```typescript
   describe('Query Builder Error Handling', () => {
     it('should throw on invalid data source ID', () => {
       expect(() => {
         QueryParamsBuilder.fromChartConfig({ dataSourceId: -1 });
       }).toThrow('dataSourceId must be a positive number');
     });
     
     it('should handle malformed practiceUids gracefully', () => {
       const result = QueryFilterBuilder.buildPracticeFilter('not-an-array' as any);
       expect(result).toBeNull();
     });
     
     it('should match legacy error messages exactly', () => {
       // Compare error messages to old implementation
     });
   });
   ```

6. **Cache Key Compatibility Tests** (CRITICAL)
   
   **`tests/unit/cache/cache-key-generation.test.ts`:**
   ```typescript
   describe('Cache Key Compatibility - After Query Builder Refactor', () => {
     it('should generate identical keys for measure-based queries', () => {
       const config = {
         dataSourceId: 1,
         measure: 'total_charges',
         frequency: 'Monthly',
         practiceUid: 123
       };
       
       // Generate params with old and new builders
       const legacyParams = buildQueryParams_OLD(config);
       const newParams = QueryParamsBuilder.fromChartConfig(config);
       
       // Build cache keys
       const legacyKey = buildCacheKey(legacyParams);
       const newKey = buildCacheKey(newParams);
       
       // MUST be byte-for-byte identical
       expect(newKey).toBe(legacyKey);
     });
     
     it('should maintain component ordering in cache keys', () => {
       // Format: dataSourceId:measure:practiceUid:providerUid:frequency
       const key = buildCacheKey(params);
       const parts = key.split(':');
       expect(parts[0]).toBe('1'); // dataSourceId
       expect(parts[1]).toBe('total_charges'); // measure
       expect(parts[2]).toBe('123'); // practiceUid
       // ... validate all positions
     });
     
     it('should handle optional params consistently', () => {
       // Test keys with missing providerUid, missing frequency, etc.
     });
   });
   ```

7. **Security Log Payload Verification**
   
   **`tests/unit/security/log-payload-verification.test.ts`:**
   ```typescript
   describe('Security Log Payload Preservation', () => {
     it('should emit identical fail-closed log structure', () => {
       const logSpy = vi.spyOn(log, 'security');
       
       QueryFilterBuilder.buildPracticeFilter([]);
       
       expect(logSpy).toHaveBeenCalledWith(
         'Empty practiceUids - fail-closed',
         'high',
         expect.objectContaining({
           reason: 'organization_has_no_practices',
           filterType: 'practice_uid',
           failedClosed: true,
           operation: 'build_query_params',
           component: expect.any(String),
           // ... all existing fields preserved
         })
       );
     });
     
     it('should emit organization filter log with same fields', () => {
       // Verify all log.info fields match legacy implementation
     });
   });
   ```

8. **Dimension Expansion Regression Tests**
   - `pnpm test -- --runInBand tests/integration/dimension-expansion`
   - Manual: Dashboard → org filter → expand by dimension
   - Verify: filters properly applied to dimension values
   
9. **Cache Smoke Suite**
   - `pnpm ts-node scripts/cache-smoke.ts --scenario post-phase1`
   - Verify cache hit/miss after refactor
   
10. **Benchmark Comparison**
    - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json`
    - Compare to baseline
    - Append table to `docs/analytics/benchmarks-history.md`

#### Deliverables
- ✅ `lib/utils/query-builders/query-filter-builder.ts`
- ✅ `lib/utils/query-builders/query-params-builder.ts`
- ✅ `lib/utils/query-builders/index.ts`
- ✅ Comprehensive unit tests (security, error handling, logging)
- ✅ Cache key compatibility tests
- ✅ `docs/architecture/ADR-003-query-builders.md` (API documentation)
- ✅ Benchmark delta entry (≤5% or documented rationale)

#### Go / No-Go Criteria
- ✅ **GO:** All tests green, cache keys match byte-for-byte, dimension expansion works, benchmarks ≤5% degradation, feature flag toggles verified
- ❌ **NO-GO:** Cache key mismatch, security log fields missing, >5% regression without justification → revert to baseline, investigate

#### Performance Degradation Response Plan
If benchmark shows >5% degradation:
1. **Investigation** (2h allocated)
   - Profile specific scenario with degradation
   - Identify root cause (extra function calls, object creation, etc.)
   
2. **Decision Matrix**
   - 5-10% degradation with clear justification → Document and proceed
   - 10-20% degradation → Optimize before proceeding (budget +4h)
   - >20% degradation → Roll back phase, redesign approach
   
3. **Optimization Tactics**
   - Memoize expensive operations
   - Reduce intermediate object creation
   - Optimize filter combination logic
   - Consider inlining hot paths

#### Validation Commands
```bash
pnpm lint lib/utils/query-builders
pnpm tsc --noEmit lib/utils/query-builders
pnpm test -- run tests/unit/utils/query-builders
pnpm test -- run tests/unit/cache/cache-key-generation.test.ts
pnpm test -- run tests/unit/security/log-payload-verification.test.ts
pnpm test -- run tests/unit/services/chart-handlers/base-handler.test.ts
pnpm test -- run tests/unit/services/analytics/query-executor.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm lint
pnpm tsc --noEmit
pnpm test
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json
pnpm ts-node scripts/cache-smoke.ts --scenario post-phase1
```

---

### Phase 2 – Shared Runtime Filter Utilities & Coverage (Week 2, 9h, Low Risk)
**Goal:** Provide common runtime filter utilities and prove dashboard/dimension parity with comprehensive integration tests.

#### Tasks

1. **Create `lib/utils/chart-config/runtime-filter-utils.ts`**
   - Exports: `extractDataSourceFilters`, `buildRuntimeFilters`, `normalizeChartConfig`
   - Accept options for log context (chart ID, component name)
   - Maintain type safety with proper interfaces
   
2. **Refactor `ChartConfigBuilderService`**
   - Replace private helpers with utility functions
   - Keep service as thin orchestrator (class for DI/testing)
   - Update log statements with new fields (e.g., `runtimeFilterOrigin`)
   - Maintain same public API
   
3. **Update `DimensionExpansionRenderer`**
   - Import same utilities instead of re-instantiating logic
   - Ensure identical config generation for same inputs
   
4. **Update `data-source-cache`**
   - Use `convertBaseFiltersToChartFilters` / new helpers
   - Maintain cache key generation logic
   
5. **Targeted Unit Tests**
   - `tests/unit/utils/chart-config/runtime-filter-utils.test.ts`
   - Test all utility functions independently
   - Test edge cases (empty filters, null values, etc.)
   
6. **Service-Level Tests**
   - `tests/unit/services/dashboard-rendering/chart-config-builder.test.ts`
   - Verify same output as before refactor
   - Use fixture-driven testing
   
7. **Parity Integration Tests**
   
   **`tests/integration/dimension-expansion/chart-config-parity.test.ts`:**
   ```typescript
   describe('Dashboard vs Dimension Expansion Config Parity', () => {
     it('should generate identical configs for same chart definition', async () => {
       const chartDef = await createChartFixture();
       const universalFilters: ResolvedFilters = {
         practiceUids: [1, 2, 3],
         startDate: '2024-01-01',
         endDate: '2024-12-31'
       };
       
       // Generate config via dashboard path
       const configBuilder = new ChartConfigBuilderService();
       const dashboardConfig = configBuilder.buildSingleChartConfig(
         chartDef,
         universalFilters
       );
       
       // Generate config via dimension expansion path
       const expansionConfig = await dimensionExpansionRenderer.buildChartConfig(
         chartDef,
         universalFilters
       );
       
       // MUST be identical
       expect(expansionConfig).toEqual(dashboardConfig);
     });
   });
   ```

8. **Benchmarks**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase2.json`
   - Append comparison to `benchmarks-history.md`

#### Deliverables
- ✅ `lib/utils/chart-config/runtime-filter-utils.ts`
- ✅ `lib/utils/chart-config/index.ts`
- ✅ Unit + integration tests (including parity fixtures)
- ✅ `docs/architecture/ADR-004-dashboard-runtime-filters.md`
- ✅ Benchmark entry + parity test results

#### Go / No-Go Criteria
- ✅ **GO:** Dashboard & dimension configs 100% identical in parity tests, benchmarks acceptable
- ❌ **NO-GO:** Any parity failure or benchmark regression >5% → halt and investigate

#### Validation Commands
```bash
pnpm test -- run tests/unit/utils/chart-config
pnpm test -- run tests/unit/services/dashboard-rendering
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/rbac/charts-service.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase2.json
```

---

### Phase 3 – Service Resilience & Logging Enhancements (Week 3, 7h, Medium Risk)
**Goal:** Harden loader/batch/filter services (no consolidation), add RBAC edge case testing, and enrich observability.

#### Tasks

1. **Dashboard Loader Enhancements**
   - Add retry/backoff when fetching chart definitions (handles transient DB issues)
   - Emit `log.security` when dashboard references inactive chart (currently silent)
   - Configuration: 3 retries, exponential backoff (100ms, 200ms, 400ms)
   
2. **Batch Executor Enhancements**
   - Add structured logging for batching groups (data source IDs, estimated savings)
   - Capture per-chart orchestration duration for metrics
   - Ensure error propagation includes chart IDs (needed by dimension expansion)
   
3. **Filter Service Enhancements**
   - Expose helper: `summarizeResolvedPractices(filters: ResolvedFilters): PracticeSummary`
   - Used by both dashboard rendering and dimension expansion
   
4. **Filter Service RBAC Edge Case Tests**
   
   **`tests/unit/services/dashboard-rendering/filter-service.test.ts`:**
   ```typescript
   describe('FilterService - RBAC Edge Cases', () => {
     it('should deny organization filter for provider users', async () => {
       const providerUser = await createUserWithProviderRole();
       const filterService = new FilterService(providerUser);
       
       await expect(
         filterService.validateAndResolve({
           organizationId: 'some-org-id'
         }, dashboard)
       ).rejects.toThrow('Provider users cannot use organization filter');
     });
     
     it('should fail-closed when user has no practice access', async () => {
       const userWithNoPractices = await createUserWithEmptyOrgAccess();
       const filterService = new FilterService(userWithNoPractices);
       
       const result = await filterService.validateAndResolve({}, dashboard);
       
       expect(result.practiceUids).toEqual([]);
       // Downstream should fail-closed with [-1]
     });
   });
   ```
   
   **`tests/integration/rbac/query-builders-rbac.test.ts`:**
   ```typescript
   describe('RBAC with New Query Builders', () => {
     it('should apply fail-closed when user has no practice access', async () => {
       const userWithNoPractices = await createUserWithEmptyOrgAccess();
       
       const params = QueryParamsBuilder.fromChartConfig({
         practiceUids: [], // Empty because user's org has no practices
         dataSourceId: 1
       });
       
       expect(params.advanced_filters).toEqual(
         expect.arrayContaining([
           expect.objectContaining({
             field: 'practice_uid',
             operator: 'in',
             value: [-1] // Fail-closed value
           })
         ])
       );
     });
   });
   ```

5. **Dimension Expansion Metrics**
   - Track truncated dimension sets vs. max limit
   - Add metrics for expansion duration per dimension value
   - Integration test: verify truncation logs fire with correct metadata
   
6. **Documentation Updates**
   - Update `docs/DIMENSION_EXPANSION_OPTIMIZATION_REPORT.md` with new log fields
   - Append to `docs/analytics/log-inventory.md`
   
7. **Benchmarks**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase3.json`

#### Deliverables
- ✅ Enhanced services with retry/backoff and improved logging
- ✅ RBAC edge case tests (unit + integration)
- ✅ Log inventory delta appended
- ✅ Benchmark entry

#### Go / No-Go Criteria
- ✅ **GO:** All tests green, new logs verified via manual scenario, RBAC edge cases covered
- ❌ **NO-GO:** Retry logic failing, logs missing required fields, or RBAC tests failing → block

#### Validation Commands
```bash
pnpm test -- run tests/unit/services/dashboard-rendering
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/rbac/charts-service.test.ts
pnpm test -- run tests/integration/rbac/query-builders-rbac.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase3.json
```

---

### Phase 4 – Query Executor Modularity Without Breaking Orchestrator (Weeks 4–5, 14h, Medium Risk)
**Goal:** Split `QueryExecutor` into specialized executors with comprehensive orchestrator integration testing.

#### Tasks

1. **Design Interfaces**
   ```typescript
   // lib/services/analytics/query-executors/types.ts
   export interface IQueryExecutor {
     executeLegacyQuery(params: AnalyticsQueryParams, context: ChartRenderContext): Promise<AnalyticsQueryResult>;
     executeMultipleSeries(params: AnalyticsQueryParams, context: ChartRenderContext | UserContext, delegate: QueryDelegate): Promise<AnalyticsQueryResult>;
     executePeriodComparison(params: AnalyticsQueryParams, context: ChartRenderContext | UserContext, delegate: QueryDelegate): Promise<AnalyticsQueryResult>;
     calculateTotal(rows: AggAppMeasure[], dataSourceId: number): Promise<number>;
     getColumnMappings(tableName: string, schemaName: string, config?: DataSourceConfig | null): Promise<ColumnMappings>;
   }
   ```
   
2. **Implement Base Executor**
   - `lib/services/analytics/query-executors/base-query-executor.ts`
   - Shared helpers: `getColumnMappings`, `processAdvancedFilters`, `calculateTotal`
   
3. **Implement Specialized Executors**
   - `standard-query-executor.ts` - Legacy path (current `executeLegacyQuery` logic)
   - `series-query-executor.ts` - Multi-series (current `executeMultipleSeries` logic)
   - `comparison-query-executor.ts` - Period comparison (current `executePeriodComparison` logic)
   
4. **Create Facade**
   ```typescript
   // lib/services/analytics/query-executor.ts
   export class QueryExecutorFacade implements IQueryExecutor {
     private standardExecutor = new StandardQueryExecutor();
     private seriesExecutor = new SeriesQueryExecutor();
     private comparisonExecutor = new ComparisonQueryExecutor();
     
     async executeLegacyQuery(params, context) {
       return this.standardExecutor.execute(params, context);
     }
     
     // ... delegate all methods
   }
   
   export const queryExecutor = new QueryExecutorFacade();
   ```
   
5. **Update QueryOrchestrator**
   - Ensure delegation works with new facade
   - Verify `this.queryMeasures.bind(this)` still functions correctly
   
6. **Comprehensive Orchestrator Tests**
   
   **`tests/unit/services/analytics/query-orchestrator.test.ts`:**
   ```typescript
   describe('QueryOrchestrator - After Executor Refactor', () => {
     describe('Multi-Series Recursion', () => {
       it('should handle multi-series recursion with new executors', async () => {
         const params: AnalyticsQueryParams = {
           data_source_id: 1,
           multiple_series: [
             { id: 'series1', measure: 'total_charges', label: 'Charges' },
             { id: 'series2', measure: 'total_payments', label: 'Payments' }
           ]
         };
         
         const result = await queryOrchestrator.queryMeasures(params, userContext);
         
         // Should have called queryMeasures recursively for each series
         expect(result.data).toHaveLength(expectedRowCount * 2);
         expect(result.data[0]).toHaveProperty('series_id');
         expect(result.data[0]).toHaveProperty('series_label');
       });
       
       it('should preserve cache hits for individual series', async () => {
         // Pre-warm cache for one series
         await queryOrchestrator.queryMeasures({
           data_source_id: 1,
           measure: 'total_charges'
         }, userContext);
         
         // Execute multi-series including cached measure
         const result = await queryOrchestrator.queryMeasures({
           data_source_id: 1,
           multiple_series: [
             { id: 'series1', measure: 'total_charges', label: 'Charges' },
             { id: 'series2', measure: 'total_payments', label: 'Payments' }
           ]
         }, userContext);
         
         // Should have hit cache for series1
         expect(result.cache_hit).toBe(true);
       });
     });
     
     describe('Period Comparison Recursion', () => {
       it('should handle period comparison recursion', async () => {
         const params: AnalyticsQueryParams = {
           data_source_id: 1,
           measure: 'total_charges',
           frequency: 'Monthly',
           start_date: '2024-01-01',
           end_date: '2024-12-31',
           period_comparison: {
             enabled: true,
             comparisonType: 'prior_period'
           }
         };
         
         const result = await queryOrchestrator.queryMeasures(params, userContext);
         
         // Should have current + comparison data
         expect(result.data.some(r => r.comparison_period === 'current')).toBe(true);
         expect(result.data.some(r => r.comparison_period === 'comparison')).toBe(true);
         expect(result.data[0]).toHaveProperty('comparison_label');
       });
       
       it('should calculate comparison date ranges correctly', async () => {
         // Test prior_period, prior_year, custom_period
       });
     });
     
     describe('Cache Path Integration', () => {
       it('should delegate calculateTotal through facade', async () => {
         const rows = await createMeasureRowFixtures();
         const total = await queryExecutor.calculateTotal(rows, 1);
         expect(total).toBeGreaterThan(0);
       });
       
       it('should route to cache path with UserContext + data_source_id', async () => {
         const params: AnalyticsQueryParams = {
           data_source_id: 1,
           measure: 'total_charges',
           frequency: 'Monthly'
         };
         
         const result = await queryOrchestrator.queryMeasures(params, userContext);
         
         // Should hit cache path (not legacy)
         expect(result.cache_hit).toBeDefined();
       });
     });
   });
   ```

7. **Redis Cache Regression Tests**
   - `tests/integration/cache/data-source-cache.test.ts`
   - Ensure cache path still hits `QueryExecutor` facade correctly
   - Test RBAC filtering, advanced filters, cache warming
   
8. **Dimension Expansion Regression**
   - Execute `tests/integration/dimension-expansion`
   - Guarantee orchestrator changes don't break expansion (routes through orchestrator)
   
9. **Benchmarks**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase4.json`

#### Deliverables
- ✅ New executor classes (`base`, `standard`, `series`, `comparison`)
- ✅ `QueryExecutorFacade` (exported as `queryExecutor`)
- ✅ Updated orchestrator tests (recursion, cache path, calculateTotal)
- ✅ Section added to `docs/architecture/ADR-003-query-builders.md` covering executor modularity
- ✅ Benchmark comparison table

#### Go / No-Go Criteria
- ✅ **GO:** Multi-series + comparison recursion tests pass, cache/dimension suites green, benchmark regression ≤5%, calculateTotal delegation works
- ❌ **NO-GO:** Any regression in cache path, dimension expansion, or orchestrator recursion → revert Phase 4 commits

#### Validation Commands
```bash
pnpm test -- run tests/unit/services/analytics/query-executors
pnpm test -- run tests/unit/services/analytics/query-orchestrator.test.ts
pnpm test -- run tests/integration/analytics
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase4.json
```

---

### Phase 5 – Cache, Dimension Expansion & Frontend Parity Tests (Week 6, 12h, Low Risk)
**Goal:** Comprehensive validation across all integration points including frontend UI and multi-series dimension expansion.

#### Tasks

1. **Cache Integration Suite Enhancement**
   
   **`tests/integration/cache/data-source-cache.test.ts`:**
   - Cache hit/miss scenarios
   - RBAC filtering (all permission scopes)
   - Advanced filter application
   - Cache warming with new utilities
   
   **`tests/integration/cache/warming-with-new-utilities.test.ts`:**
   ```typescript
   describe('Cache Warming - After Refactor', () => {
     it('should warm cache using new query builders', async () => {
       await cacheWarmingService.warmDataSource({
         dataSourceId: 1,
         measures: ['total_charges', 'total_payments'],
         frequencies: ['Monthly', 'Quarterly']
       });
       
       const keys = await redis.keys('data-source:1:*');
       expect(keys.length).toBeGreaterThan(0);
       
       // Verify subsequent query hits cache
       const result = await queryOrchestrator.queryMeasures({
         data_source_id: 1,
         measure: 'total_charges',
         frequency: 'Monthly'
       }, userContext);
       
       expect(result.cache_hit).toBe(true);
     });
   });
   ```

2. **Dimension Expansion Multi-Series Tests**
   
   **`tests/integration/dimension-expansion/multi-series.test.ts`:**
   ```typescript
   describe('Dimension Expansion - Multi-Series Charts', () => {
     it('should expand dual-axis chart by dimension', async () => {
       const chart = await createDualAxisChartFixture({
         seriesConfigs: [
           { measure: 'total_charges', label: 'Charges' },
           { measure: 'total_payments', label: 'Payments' }
         ]
       });
       
       const expansionRequest: DimensionExpansionRequest = {
         chartDefinitionId: chart.chart_definition_id,
         dimensionColumn: 'location',
         baseFilters: { frequency: 'Monthly' },
         limit: 5
       };
       
       const result = await dimensionExpansionRenderer.renderByDimension(
         expansionRequest,
         userContext
       );
       
       // Should have 5 charts (one per location)
       expect(result.charts).toHaveLength(5);
       
       // Each chart should have both series
       for (const chart of result.charts) {
         expect(chart.chartData.datasets).toHaveLength(2);
         expect(chart.chartData.datasets[0]?.label).toContain('Charges');
         expect(chart.chartData.datasets[1]?.label).toContain('Payments');
       }
     });
     
     it('should expand chart with period comparison by dimension', async () => {
       const chart = await createChartWithComparisonFixture();
       
       const result = await dimensionExpansionRenderer.renderByDimension({
         chartDefinitionId: chart.chart_definition_id,
         dimensionColumn: 'provider_name',
         baseFilters: {
           period_comparison: {
             enabled: true,
             comparisonType: 'prior_period'
           }
         },
         limit: 10
       }, userContext);
       
       // Each expanded chart should have comparison data
       for (const chart of result.charts) {
         const hasCurrentPeriod = chart.rawData.some(r => r.comparison_period === 'current');
         const hasComparisonPeriod = chart.rawData.some(r => r.comparison_period === 'comparison');
         expect(hasCurrentPeriod && hasComparisonPeriod).toBe(true);
       }
     });
   });
   ```

3. **Parallel Execution Performance Test**
   
   **`tests/integration/dimension-expansion/parallel-performance.test.ts`:**
   ```typescript
   describe('Dimension Expansion - Parallel Execution', () => {
     it('should execute dimension queries in parallel (not sequential)', async () => {
       const expansionRequest: DimensionExpansionRequest = {
         chartDefinitionId: 'test-chart',
         dimensionColumn: 'location',
         baseFilters: {},
         limit: 10 // 10 parallel queries
       };
       
       const startTime = Date.now();
       const result = await dimensionExpansionRenderer.renderByDimension(
         expansionRequest,
         userContext
       );
       const duration = Date.now() - startTime;
       
       // If parallel: ~200ms (single query time)
       // If sequential: ~2000ms (10 * single query time)
       expect(duration).toBeLessThan(500); // Allow some overhead
       expect(result.charts).toHaveLength(10);
     });
   });
   ```

4. **End-to-End Dimension Expansion Test**
   
   **`tests/integration/dimension-expansion/api-route.test.ts`:**
   ```typescript
   describe('Dimension Expansion API Route', () => {
     it('should handle full expansion workflow via API', async () => {
       const chart = await createChartFixture();
       const user = await createUserWithOrgAccess();
       
       const response = await apiClient.post(
         `/api/admin/analytics/charts/${chart.chart_definition_id}/expand`,
         {
           dimensionColumn: 'location',
           baseFilters: {
             measure: 'total_charges',
             frequency: 'Monthly',
             practiceUids: [1, 2, 3]
           },
           limit: 20
         },
         { headers: { Authorization: `Bearer ${user.token}` } }
       );
       
       expect(response.status).toBe(200);
       expect(response.data.charts.length).toBeGreaterThan(0);
       expect(response.data.metadata.totalQueryTime).toBeDefined();
     });
   });
   ```

5. **Frontend Integration Tests**
   
   **`tests/unit/components/charts/dual-axis-fullscreen-modal.test.tsx`:**
   ```tsx
   describe('DualAxisFullscreenModal - Dimension Expansion UI', () => {
     it('should display "Expand by Dimension" button when dimensions available', async () => {
       const { getByText } = render(
         <DualAxisFullscreenModal
           isOpen={true}
           chartDefinitionId="test-chart-1"
           chartData={mockChartData}
           currentFilters={{ measure: 'total_charges' }}
           {...props}
         />
       );
       
       await waitFor(() => {
         expect(getByText('Expand by Dimension')).toBeInTheDocument();
       });
     });
     
     it('should open dimension selector when button clicked', async () => {
       // ... test dimension selector modal
     });
     
     it('should include all runtime filters in expansion request', async () => {
       const apiSpy = vi.spyOn(apiClient, 'post');
       
       // Click expand button
       // ... trigger expansion
       
       expect(apiSpy).toHaveBeenCalledWith(
         expect.stringContaining('/expand'),
         expect.objectContaining({
           baseFilters: expect.objectContaining({
             measure: 'total_charges',
             frequency: 'Monthly',
             practiceUids: [1, 2, 3]
           })
         })
       );
     });
     
     it('should render expanded charts correctly', async () => {
       // ... verify expanded UI renders
     });
   });
   ```
   
   **Manual QA Checklist:**
   - [ ] Dashboard with org filter → chart fullscreen → expand by dimension → verify all filters applied
   - [ ] Dual-axis chart → expand by dimension → verify both axes present in each expanded chart
   - [ ] Multi-series chart → expand → verify all series rendered in each expanded chart
   - [ ] Dimension expansion with 20 values → verify truncation message if >20
   - [ ] Verify loading states during expansion
   - [ ] Verify error states (no dimension values, API failure, etc.)

6. **Documentation & ADRs**
   - `docs/architecture/ADR-003-query-builders.md` - Complete with API examples
   - `docs/architecture/ADR-004-dashboard-runtime-filters.md`
   - `docs/api/query-builders-api.md` - Complete API reference:
     - QueryFilterBuilder methods, parameters, return types
     - QueryParamsBuilder usage examples
     - RuntimeFilterUtils integration patterns
     - JSDoc comments for all public methods:
       - `@param` tags with types and descriptions
       - `@returns` tag with type and description
       - `@example` usage snippets
       - `@security` notes for fail-closed behavior
   
7. **Migration Guide**
   
   **`docs/guides/query-builder-migration.md`:**
   ```markdown
   # Query Builder Migration Guide
   
   ## When to Use New Query Builders
   
   ### ✅ Use New Utilities For:
   - Building chart query parameters → `QueryParamsBuilder.fromChartConfig()`
   - Creating filter objects → `QueryFilterBuilder.build*Filter()`
   - Normalizing chart configs → `RuntimeFilterUtils.normalizeChartConfig()`
   
   ### ❌ Don't Use For:
   - Direct database queries outside analytics system
   - Non-chart-related filtering logic
   - Custom cache key generation (use existing cache service)
   
   ## Migration Examples
   
   ### Before (Old Pattern):
   ```typescript
   // In BaseChartHandler
   const queryParams: AnalyticsQueryParams = {
     data_source_id: config.dataSourceId,
     start_date: startDate,
     // ... 100+ lines of manual construction
   };
   ```
   
   ### After (New Pattern):
   ```typescript
   // In BaseChartHandler
   const queryParams = QueryParamsBuilder.fromChartConfig(config);
   ```
   
   ## Common Pitfalls
   1. Don't bypass security logging callbacks
   2. Always preserve fail-closed semantics
   3. Test cache key compatibility
   4. Verify log payload structures match legacy
   ```

8. **Operational Playbook**
   - Document log fields for SOC dashboards
   - Feature flag instructions (`USE_NEW_QUERY_BUILDERS`)
   - Rollback procedures
   - Monitoring alerts for cache hit rate changes

9. **Performance Benchmark Final Report**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase5.json`
   - Generate comparison table across all phases
   - Document any performance changes with explanations

#### Deliverables
- ✅ Enhanced cache integration tests
- ✅ Multi-series dimension expansion tests
- ✅ Parallel execution performance test
- ✅ Frontend integration tests
- ✅ End-to-end API tests
- ✅ Complete ADRs + API documentation
- ✅ Migration guide
- ✅ Operational playbook
- ✅ Final benchmark comparison report

#### Go / No-Go Criteria
- ✅ **GO:** All cache + dimension suites stable, frontend tests pass, docs reviewed, benchmark trend acceptable, manual QA checklist complete
- ❌ **NO-GO:** Failing parity tests, missing docs, frontend regression, or benchmark issues → delay Phase 6

#### Validation Commands
```bash
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/cache/warming-with-new-utilities.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm test -- run tests/unit/components/charts/dual-axis-fullscreen-modal.test.tsx
pnpm test -- run tests/unit/components/charts/chart-fullscreen-modal.test.tsx
pnpm test
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase5.json
```

---

### Phase 6 – Targeted Dead Code Elimination & Final Reporting (Week 7, 6h, Low Risk)
**Goal:** Remove stale code responsibly using explicit criteria; produce final optimization report.

#### Tasks

1. **Analysis Tools**
   ```bash
   npx ts-prune --ignore "tests/**"
   npx unimport --find
   npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50
   ```

2. **Decision Matrix**
   
   | Finding | Action | Reason |
   |---------|--------|--------|
   | Exported function, no imports, > 6 months old | **Remove** | Confirmed dead code |
   | Exported function, no imports, < 6 months old | **Keep** | May be in-progress feature |
   | Internal function, never called, has TODO | **Keep** | Planned implementation |
   | Internal function, never called, no docs | **Remove** | Likely abandoned |
   | `.deprecated` file suffix | **Remove** | Explicitly marked for deletion |
   | Commented-out code | **Remove** | Use git history instead |
   | Test-only utilities in `lib/` | **Move to `tests/`** | Wrong location |

3. **Redis Cache Awareness**
   - Before removing code, verify it's not used by cache warming cron jobs
   - Check: `grep -r "warming\|invalidation" lib/cache/ --include="*.ts"`
   - Don't delete code used by scheduled jobs

4. **Cache Warming Integration Validation**
   - Verify cache warming still works after any removals
   - Run `pnpm ts-node scripts/cache-smoke.ts --scenario post-phase6`

5. **Documentation**
   - Create `docs/cleanup/dead-code-report.md`:
     - List of removed files/functions with rationale
     - Evidence (git history, usage analysis)
     - Date removed and removal commit SHA
   - Append code metrics improvement to `benchmarks-history.md`:
     - Duplication reduction percentage
     - LOC reduction per file
     - Service count reduction

6. **Final Testing**
   - Run complete test suite
   - Run cache smoke test
   - Run dimension expansion test
   - Manual validation of key workflows

7. **Final Benchmark Comparison**
   - Compare Phase 0 baseline to Phase 5 final
   - Document cumulative improvements
   - Note any degradations with explanations

#### Deliverables
- ✅ `docs/cleanup/dead-code-report.md` (complete removal log)
- ✅ Updated code metrics in `benchmarks-history.md`
- ✅ Evidence of test coverage for removed areas
- ✅ Final optimization report summarizing all phases

#### Go / No-Go Criteria
- ✅ **GO:** All suites green, dead code report complete, no regressions introduced
- ❌ **NO-GO:** Any regression from removals → restore removed code immediately

#### Validation Commands
```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm ts-node scripts/cache-smoke.ts --scenario post-phase6
```

---

## 6. Rollback Strategy

### Branch & Tag Discipline
- Before each phase: `git checkout -b optimization/phase-N` and `git tag phase-N-start`
- After successful validation: `git tag phase-N-complete`
- Maintain linear history with clear phase boundaries

### Revert Process
1. **Phase-Level Rollback**
   ```bash
   git checkout main
   git cherry-pick phase-(N-1)-complete  # Return to last good state
   ```

2. **Commit-Level Rollback**
   ```bash
   git revert <bad-commit-sha>  # Preserve history, don't reset
   ```

3. **Feature Flag Rollback (Phase 1 only)**
   ```bash
   export USE_NEW_QUERY_BUILDERS=false  # Instant rollback without redeploy
   ```

### Benchmark Revalidation After Rollback
1. Re-run baseline benchmarks
2. Execute cache smoke suite
3. Run dimension expansion test
4. Append rollback event to `benchmarks-history.md` with:
   - Date/time of rollback
   - Phase rolled back
   - Root cause
   - Metrics confirming stable state
   - Follow-up plan

### Documentation Sync
- Update ADRs with rollback rationale
- Mark rolled-back phase in plan
- Document lessons learned
- Update risk assessment for future attempts

---

## 7. Success Metrics & Test Strategy

### Success Metrics

| Metric | Target | Measurement Method |
| --- | --- | --- |
| Query-building duplication | ≥25% reduction | `jscpd` comparison (baseline vs final) |
| Dashboard ↔ dimension config parity | 100% parity | Parity test pass rate |
| Executor maintainability | QueryExecutor <150 lines | LOC count post-refactor |
| Cache/dimension regressions | 0 incidents | Test suite pass rate + production monitoring |
| Observability | 100% log key preservation | Log payload verification tests |
| Benchmark delta | ≤5% degradation per scenario | Benchmark comparison tables |
| Documentation coverage | 100% planned docs | ADR/guide completion checklist |
| Type safety | Zero `any` types | `pnpm tsc --noEmit` output |
| Test coverage | No regression | Coverage report comparison |

### Test Strategy Matrix

| Level | Coverage | Trigger | Exit Criteria |
| --- | --- | --- | --- |
| **Unit** | Utilities, executors, services | Post-change | 100% pass rate, security scenarios covered |
| **Service** | Chart handlers, dashboard services | End of Phases 1–4 | Integration points validated |
| **Integration** | Dashboard rendering, cache, dimension expansion | End of every phase | Cross-service workflows functional |
| **E2E/Manual** | Org filter + dimension expansion workflow | Phases 1, 2, 4, 5 | Manual QA checklist complete |
| **Frontend** | UI components for dimension expansion | Phase 5 | Component tests + manual validation |
| **Performance** | Benchmark harness | Phase 0 baseline + after Phases 1–5 | ≤5% degradation or justified |
| **Security Logging** | Verify log payload snapshots | Phases 0, 1, 3, final | Byte-for-byte log field match |
| **RBAC** | Permission edge cases | Phase 3 | Fail-closed scenarios covered |
| **Cache** | Hit/miss, warming, invalidation | Phases 1, 4, 5, 6 | Cache behavior unchanged |
| **Error Handling** | Exception parity with legacy | Phase 1 | Same error messages/codes |

---

## 8. Risk Mitigation

### High-Risk Areas

1. **Cache Key Compatibility (Phase 1)** - CRITICAL
   - **Risk:** New utilities generate different cache keys → cache misses → performance degradation
   - **Mitigation:** Byte-for-byte cache key compatibility tests, rollback flag
   
2. **QueryOrchestrator Delegation (Phase 4)** - HIGH
   - **Risk:** Recursion breaks for multi-series/comparison queries
   - **Mitigation:** Comprehensive binding tests, integration test coverage
   
3. **Dimension Expansion Integration (All Phases)** - MEDIUM
   - **Risk:** Config parity breaks, dimension expansion stops working
   - **Mitigation:** Parity tests after each phase, manual validation

### Risk Response Plan

| Risk Level | Response Time | Action |
| --- | --- | --- |
| **Critical** (cache keys broken) | Immediate | Enable `USE_NEW_QUERY_BUILDERS=false`, investigate within 2h |
| **High** (recursion broken) | 1 hour | Revert phase commits, schedule fix |
| **Medium** (parity issues) | 4 hours | Fix forward if possible, revert if not |
| **Low** (documentation) | Next sprint | Address in follow-up PR |

---

## 9. Final Validation Checklist

- [ ] All phases executed sequentially (no skipping)
- [ ] `pnpm lint`, `pnpm tsc --noEmit`, and full `pnpm test` run after each phase
- [ ] Cache smoke suite + dimension expansion test green before advancing phases
- [ ] Benchmark results recorded in `docs/analytics/benchmarks-history.md` after Phases 0–5
- [ ] Feature flag toggled + validated (Phase 1)
- [ ] Cache key compatibility confirmed byte-for-byte (Phase 1)
- [ ] QueryOrchestrator recursion tests passing (Phase 4)
- [ ] Multi-series dimension expansion working (Phase 5)
- [ ] Frontend UI tested manually + with component tests (Phase 5)
- [ ] Observability/log inventory updated (Phases 0, 1, 3)
- [ ] Security log payloads verified (Phases 1, 3)
- [ ] RBAC edge cases tested (Phase 3)
- [ ] Error handling parity confirmed (Phase 1)
- [ ] Documentation complete (ADRs, API docs, migration guide, operational playbook)
- [ ] Dead-code decisions recorded in `docs/cleanup/dead-code-report.md`
- [ ] Final optimization report published

---

## 10. Effort Summary

| Phase | Hours | Risk | Critical Deliverables |
| --- | --- | --- | --- |
| **Phase 0** | 7h | Medium | Baselines, tooling, metrics |
| **Phase 1** | 12h | Medium-High | Query builders, cache key tests, security logs |
| **Phase 2** | 9h | Low | Runtime filters, parity tests |
| **Phase 3** | 7h | Medium | Service enhancements, RBAC tests |
| **Phase 4** | 14h | Medium | Executor split, orchestrator tests |
| **Phase 5** | 12h | Low | Comprehensive validation, frontend tests, docs |
| **Phase 6** | 6h | Low | Dead code cleanup, final report |
| **TOTAL** | **67h** | | **7-8 weeks** |

---

**Next Step:** Begin Phase 0 baseline instrumentation and tooling creation.  
**Owner:** Platform Analytics Team Lead  
**Review Cadence:** After each phase completion  
**Final Review:** After Phase 6 with stakeholder sign-off  

**Status:** ✅ Production-ready, comprehensive, and validated plan with explicit test scenarios, error handling, frontend validation, and complete documentation strategy.

