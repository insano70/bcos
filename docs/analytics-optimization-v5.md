# Analytics System Optimization Plan (v5)

**Date:** November 19, 2025  
**Author:** Platform Analytics Team  
**Scope:** Chart handlers, dashboard rendering stack, analytics query services, Redis data-source cache, dimension expansion pipeline, supporting utilities, comprehensive testing, and documentation  
**Duration:** 8-9 weeks (66-78 engineering hours) across eight sequential phases  
**Status:** Production-ready for execution  

---

## 1. Overview

This v5 plan addresses operational execution concerns from v4 by rebalancing phase workloads, clarifying non-existent APIs, providing a complete test asset creation checklist, and explicitly noting frontend team dependencies. Phase 5 has been split into backend validation (Phase 5) and frontend/documentation (Phase 6), with dead code cleanup moved to Phase 7. All validation commands have been streamlined to avoid redundancy.

### Key Improvements Over v4
- ✅ Phase 5 split: Backend parity (8h) separate from frontend/docs (10h)
- ✅ Dead code cleanup moved to Phase 7 for balanced workload
- ✅ Non-existent API references corrected (dimension expansion parity test)
- ✅ Complete test asset creation checklist (Appendix A)
- ✅ Frontend team dependency explicitly called out
- ✅ Phase 0 duration increased to 8h for benchmark tooling creation
- ✅ Validation commands streamlined (no duplication)
- ✅ Final optimization report location specified

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
8. **Cross-Team Coordination** – Frontend validation requires UI team involvement; dependencies must be scheduled before Phase 6.

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

| Asset | Needed By | Status | Action if Missing | Owner |
| --- | --- | --- | --- | --- |
| `scripts/benchmark-dashboard-rendering.ts` | Phases 0–6 | TBD | **CREATE in Phase 0** (+2h) | Analytics Team |
| `scripts/cache-smoke.ts` | Phases 0–6 | TBD | **CREATE in Phase 0** (+1h) | Analytics Team |
| `tests/integration/dimension-expansion` suite | Phases 1–6 | TBD | **ADD if missing in Phase 0** (+1h) | Analytics Team |
| `tests/integration/cache/data-source-cache.test.ts` | Phases 1–7 | Missing | **CREATE in Phase 1** | Analytics Team |
| Frontend component test infrastructure | Phase 6 | Exists | **Coordinate with UI team** | **UI Team** |
| `docs/analytics/log-inventory.md` | Phases 0, 1, 3 | Missing | **CREATE in Phase 0** | Analytics Team |
| `docs/analytics/benchmarks-history.md` | Every phase | Missing | **CREATE in Phase 0** | Analytics Team |

**Note:** See Appendix A for complete list of new test files to create.

---

## 5. Phase Plan

### Phase 0 – Baseline, Benchmarks & Instrumentation (Week 0, 8h, Medium Risk)
**Goal:** Capture behaviour, performance, and observability baselines before code changes; create missing tooling infrastructure.

#### Tasks
1. **Create Benchmark Infrastructure** (3h if missing)
   - `scripts/benchmark-dashboard-rendering.ts` - Performance harness with configurable scenarios
     - Accept `--config` parameter for JSON scenario definitions
     - Capture: render time, cache hit rate, query latency, Redis performance
     - Output structured JSON for comparison
   - `scripts/cache-smoke.ts` - Cache validation script
     - Clear cache, populate, verify hit/miss
     - Test RBAC filtering, advanced filters
     - Output pass/fail with metrics
   - Create `benchmarks/` directory structure
   - Create scenario configs: `baseline.json`, `post-phase{1-6}.json`
   
2. **Log Inventory** (1h)
   - Enumerate all `log.info` / `log.security` payloads from:
     - `BaseChartHandler.buildQueryParams` (lines 208-259)
     - `FilterService.validateAndResolve`
     - `data-source-cache` RBAC + advanced filter handling
     - `dimension-expansion-renderer` render steps
   - Store complete payload structures with field names and types in `docs/analytics/log-inventory.md`
   
3. **Benchmark Baseline** (1.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json`
   - Capture metrics for 6 scenarios:
     - Dashboard render time (10 charts, cold cache)
     - Dashboard render time (10 charts, warm cache)
     - Dimension expansion (20 dimension values)
     - Single chart render (legacy path)
     - Single chart render (cache path)
     - Redis cache hit/miss latency
   - Store raw data in `benchmarks/baseline-<YYYY-MM-DD>.json`
   - Create `docs/analytics/benchmarks-history.md` with formatted tables
   
4. **Test Suite Validation** (1h)
   - Verify existing tests pass:
     - `pnpm test -- --runInBand tests/integration/dashboard-rendering`
     - `pnpm test -- --runInBand tests/integration/rbac/charts-service.test.ts`
   - Create `tests/integration/dimension-expansion/basic.test.ts` if missing (+1h)
   - Document any missing test infrastructure
   
5. **Manual Validation** (0.5h)
   - Dashboard with org filter → chart fullscreen → "Expand by Dimension" → verify expansion works
   - Document current UX, expected behavior, and screenshot flows
   
6. **Cache Smoke Test** (0.5h)
   - `pnpm ts-node scripts/cache-smoke.ts --clear --scenario baseline`
   - Verify cache warming, hit/miss detection, invalidation
   - Document any issues for Phase 1 consideration
   
7. **Code Metrics Snapshot** (0.5h)
   - `npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50`
   - Store in `benchmarks/code-metrics-baseline.json`
   - Capture LOC for: BaseChartHandler (366 lines), QueryExecutor (552 lines), ChartConfigBuilderService (307 lines)

#### Deliverables
- ✅ `scripts/benchmark-dashboard-rendering.ts`
- ✅ `scripts/cache-smoke.ts`
- ✅ `docs/analytics/log-inventory.md` (complete payload structures)
- ✅ `docs/analytics/benchmarks-history.md` (baseline entries)
- ✅ `benchmarks/baseline-<date>.json` (raw data)
- ✅ `benchmarks/code-metrics-baseline.json` (duplication metrics)
- ✅ Test infrastructure assessment document

#### Go / No-Go Criteria
- ✅ **GO:** All baseline tests green, benchmark/cache scripts functional, metrics captured, missing tests documented
- ❌ **NO-GO:** Scripts fail to produce valid output, missing critical test infrastructure, or baseline tests failing → halt and fix before Phase 1

#### Validation Commands
```bash
# Specialized validation
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json
pnpm ts-node scripts/cache-smoke.ts --scenario baseline
npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50

# Standard validation (run once at end)
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 1 – Observability-Preserving Query Builders (Week 1, 12h, Medium-High Risk)
**Goal:** Extract `QueryFilterBuilder` / `QueryParamsBuilder` with comprehensive testing, logging parity, and cache compatibility guarantees.

#### Tasks

1. **Create `lib/utils/query-builders/query-filter-builder.ts`** (3h)
   
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
   
2. **Create `lib/utils/query-builders/query-params-builder.ts`** (2h)
   - Accepts chart config + logging callbacks
   - Methods: `fromChartConfig()`, `addRBACFilters()`, `addDateRange()`
   - Callbacks: `onPracticeFilterApplied`, `onPracticeFilterFailClosed`
   
3. **Update `BaseChartHandler.buildQueryParams`** (1h)
   - Wrap behind `USE_NEW_QUERY_BUILDERS` feature flag
   - Delegate to `QueryParamsBuilder.fromChartConfig()`
   - Forward logging callbacks that emit identical payloads to current implementation
   - Keep old implementation as fallback
   
4. **Update `QueryExecutor.executeLegacyQuery`** (1h)
   - Use `QueryFilterBuilder` for filter construction
   - Preserve all metadata for debugging
   - Maintain identical SQL query generation
   
5. **Comprehensive Unit Tests** (3h)
   - See Appendix A for complete test file list
   - Security scenarios (fail-closed, SQL injection, logging)
   - Error handling parity with legacy implementation
   - All advanced filter types
   - Cache key compatibility (byte-for-byte validation)
   - Security log payload verification
   
6. **Integration Testing** (1.5h)
   - Dimension expansion regression: `tests/integration/dimension-expansion`
   - Cache smoke suite: `pnpm ts-node scripts/cache-smoke.ts --scenario post-phase1`
   - Manual: Dashboard → org filter → expand by dimension
   
7. **Benchmark Comparison** (0.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json`
   - Compare to baseline
   - Append formatted table to `docs/analytics/benchmarks-history.md`

#### Deliverables
- ✅ `lib/utils/query-builders/query-filter-builder.ts`
- ✅ `lib/utils/query-builders/query-params-builder.ts`
- ✅ `lib/utils/query-builders/index.ts`
- ✅ Comprehensive unit tests (12 test files - see Appendix A)
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
# Specialized tests
pnpm test -- run tests/unit/utils/query-builders
pnpm test -- run tests/unit/cache/cache-key-generation.test.ts
pnpm test -- run tests/unit/security/log-payload-verification.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm test -- run tests/integration/cache/data-source-cache.test.ts

# Benchmark
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json

# Standard validation (run once at end)
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 2 – Shared Runtime Filter Utilities & Coverage (Week 2, 9h, Low Risk)
**Goal:** Provide common runtime filter utilities and prove dashboard/dimension parity with comprehensive integration tests.

#### Tasks

1. **Create `lib/utils/chart-config/runtime-filter-utils.ts`** (2h)
   - Exports: `extractDataSourceFilters`, `buildRuntimeFilters`, `normalizeChartConfig`
   - Accept options for log context (chart ID, component name)
   - Maintain type safety with proper interfaces
   
2. **Refactor `ChartConfigBuilderService`** (1.5h)
   - Replace private helpers with utility functions
   - Keep service as thin orchestrator (class for DI/testing)
   - Update log statements with new fields (e.g., `runtimeFilterOrigin`)
   - Maintain same public API
   
3. **Update `DimensionExpansionRenderer`** (1h)
   - Import same utilities instead of re-instantiating logic
   - Ensure identical config generation for same inputs
   
4. **Update `data-source-cache`** (0.5h)
   - Use `convertBaseFiltersToChartFilters` / new helpers
   - Maintain cache key generation logic
   
5. **Targeted Unit Tests** (2h)
   - See Appendix A for test file list
   - Test all utility functions independently
   - Test edge cases (empty filters, null values, etc.)
   
6. **Parity Integration Tests** (1.5h)
   
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
       // NOTE: dimensionExpansionRenderer uses ChartConfigBuilderService internally
       // We test that it produces same config when called with same inputs
       const expansionRenderer = new DimensionExpansionRenderer();
       const expansionResult = await expansionRenderer.renderByDimension({
         chartDefinitionId: chartDef.chart_definition_id,
         dimensionColumn: 'location',
         baseFilters: {
           practiceUids: [1, 2, 3],
           startDate: '2024-01-01',
           endDate: '2024-12-31'
         },
         limit: 1
       }, userContext);
       
       // Extract config used by expansion (from first chart's metadata)
       const expansionConfig = expansionResult.charts[0]?.metadata.chartConfig;
       
       // Compare relevant config fields (excluding dimension-specific additions)
       expect(expansionConfig?.practiceUids).toEqual(dashboardConfig.finalChartConfig.practiceUids);
       expect(expansionConfig?.startDate).toEqual(dashboardConfig.finalChartConfig.startDate);
       expect(expansionConfig?.endDate).toEqual(dashboardConfig.finalChartConfig.endDate);
     });
   });
   ```

7. **Benchmarks** (0.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase2.json`
   - Append comparison to `benchmarks-history.md`

#### Deliverables
- ✅ `lib/utils/chart-config/runtime-filter-utils.ts`
- ✅ `lib/utils/chart-config/index.ts`
- ✅ Unit + integration tests (6 test files - see Appendix A)
- ✅ `docs/architecture/ADR-004-dashboard-runtime-filters.md`
- ✅ Benchmark entry + parity test results

#### Go / No-Go Criteria
- ✅ **GO:** Dashboard & dimension configs match on relevant fields, benchmarks acceptable
- ❌ **NO-GO:** Any parity failure or benchmark regression >5% → halt and investigate

#### Validation Commands
```bash
# Specialized tests
pnpm test -- run tests/unit/utils/chart-config
pnpm test -- run tests/unit/services/dashboard-rendering
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/dimension-expansion

# Benchmark
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase2.json

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 3 – Service Resilience & Logging Enhancements (Week 3, 7h, Medium Risk)
**Goal:** Harden loader/batch/filter services (no consolidation), add RBAC edge case testing, and enrich observability.

#### Tasks

1. **Dashboard Loader Enhancements** (1h)
   - Add retry/backoff when fetching chart definitions (handles transient DB issues)
   - Emit `log.security` when dashboard references inactive chart (currently silent)
   - Configuration: 3 retries, exponential backoff (100ms, 200ms, 400ms)
   
2. **Batch Executor Enhancements** (1h)
   - Add structured logging for batching groups (data source IDs, estimated savings)
   - Capture per-chart orchestration duration for metrics
   - Ensure error propagation includes chart IDs (needed by dimension expansion)
   
3. **Filter Service Enhancements** (1h)
   - Expose helper: `summarizeResolvedPractices(filters: ResolvedFilters): PracticeSummary`
   - Used by both dashboard rendering and dimension expansion
   
4. **Filter Service RBAC Edge Case Tests** (2h)
   - See Appendix A for test file list
   - Provider denial scenarios
   - Empty practice access fail-closed validation
   - Integration tests combining RBAC + new query builders

5. **Dimension Expansion Metrics** (0.5h)
   - Track truncated dimension sets vs. max limit
   - Add metrics for expansion duration per dimension value
   - Integration test: verify truncation logs fire with correct metadata
   
6. **Documentation Updates** (1h)
   - Update `docs/DIMENSION_EXPANSION_OPTIMIZATION_REPORT.md` with new log fields
   - Append to `docs/analytics/log-inventory.md`
   
7. **Benchmarks** (0.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase3.json`

#### Deliverables
- ✅ Enhanced services with retry/backoff and improved logging
- ✅ RBAC edge case tests (4 test files - see Appendix A)
- ✅ Log inventory delta appended
- ✅ Benchmark entry

#### Go / No-Go Criteria
- ✅ **GO:** All tests green, new logs verified via manual scenario, RBAC edge cases covered
- ❌ **NO-GO:** Retry logic failing, logs missing required fields, or RBAC tests failing → block

#### Validation Commands
```bash
# Specialized tests
pnpm test -- run tests/unit/services/dashboard-rendering
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/rbac

# Benchmark
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase3.json

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 4 – Query Executor Modularity Without Breaking Orchestrator (Weeks 4–5, 14h, Medium Risk)
**Goal:** Split `QueryExecutor` into specialized executors with comprehensive orchestrator integration testing.

#### Tasks

1. **Design Interfaces** (1h)
   - Create `lib/services/analytics/query-executors/types.ts`
   - Define `IQueryExecutor` interface with all public methods
   
2. **Implement Base Executor** (2h)
   - `lib/services/analytics/query-executors/base-query-executor.ts`
   - Shared helpers: `getColumnMappings`, `processAdvancedFilters`, `calculateTotal`
   
3. **Implement Specialized Executors** (6h)
   - `standard-query-executor.ts` - Legacy path (current `executeLegacyQuery` logic) - 2h
   - `series-query-executor.ts` - Multi-series (current `executeMultipleSeries` logic) - 2h
   - `comparison-query-executor.ts` - Period comparison (current `executePeriodComparison` logic) - 2h
   
4. **Create Facade** (1h)
   - `lib/services/analytics/query-executor.ts` - Facade pattern
   - Export as `queryExecutor` singleton
   
5. **Update QueryOrchestrator** (1h)
   - Ensure delegation works with new facade
   - Verify `this.queryMeasures.bind(this)` still functions correctly
   
6. **Comprehensive Orchestrator Tests** (2.5h)
   - See Appendix A for test file list
   - Multi-series recursion scenarios
   - Period comparison recursion scenarios
   - Cache path integration via facade
   - calculateTotal delegation verification

7. **Integration Testing** (1h)
   - Redis cache regression tests
   - Dimension expansion regression tests
   
8. **Benchmarks** (0.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase4.json`

#### Deliverables
- ✅ New executor classes (`base`, `standard`, `series`, `comparison`)
- ✅ `QueryExecutorFacade` (exported as `queryExecutor`)
- ✅ Updated orchestrator tests (5 test files - see Appendix A)
- ✅ Section added to `docs/architecture/ADR-003-query-builders.md` covering executor modularity
- ✅ Benchmark comparison table

#### Go / No-Go Criteria
- ✅ **GO:** Multi-series + comparison recursion tests pass, cache/dimension suites green, benchmark regression ≤5%, calculateTotal delegation works
- ❌ **NO-GO:** Any regression in cache path, dimension expansion, or orchestrator recursion → revert Phase 4 commits

#### Validation Commands
```bash
# Specialized tests
pnpm test -- run tests/unit/services/analytics/query-executors
pnpm test -- run tests/unit/services/analytics/query-orchestrator.test.ts
pnpm test -- run tests/integration/analytics
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion

# Benchmark
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase4.json

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 5 – Backend Cache & Dimension Expansion Parity (Week 6, 8h, Medium Risk)
**Goal:** Comprehensive backend validation across cache and dimension expansion integration points.

#### Tasks

1. **Cache Integration Suite Enhancement** (3h)
   - See Appendix A for test file list
   - Cache hit/miss scenarios
   - RBAC filtering (all permission scopes)
   - Advanced filter application
   - Cache warming with new utilities
   
2. **Dimension Expansion Multi-Series Tests** (2.5h)
   - See Appendix A for test file list
   - Dual-axis expansion with both series validation
   - Period comparison in expanded charts
   - Each expanded chart should contain all series
   
3. **Parallel Execution Performance Test** (1h)
   - Validate Promise.all implementation
   - 10 parallel queries in <500ms (vs 2000ms sequential)
   - Ensures no sequential regression
   
4. **End-to-End Dimension Expansion Test** (1h)
   - API route testing via `/api/admin/analytics/charts/:chartId/expand`
   - Full workflow validation with fixtures
   
5. **Benchmarks** (0.5h)
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase5.json`

#### Deliverables
- ✅ Enhanced cache integration tests (4 test files - see Appendix A)
- ✅ Multi-series dimension expansion tests (3 test files - see Appendix A)
- ✅ Parallel execution performance test
- ✅ End-to-end API tests
- ✅ Benchmark comparison table

#### Go / No-Go Criteria
- ✅ **GO:** All cache + dimension suites stable, parallel execution validated, benchmarks acceptable
- ❌ **NO-GO:** Failing cache tests, dimension expansion regression, or parallel execution issues → delay Phase 6

#### Validation Commands
```bash
# Specialized tests
pnpm test -- run tests/integration/cache
pnpm test -- run tests/integration/dimension-expansion
pnpm test -- run tests/integration/analytics

# Benchmark
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase5.json

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 6 – Frontend Validation & Documentation (Week 7, 10h, Low-Medium Risk)
**Goal:** Complete frontend UI validation and produce comprehensive documentation suite.

**DEPENDENCY:** Requires coordination with **UI Team** for component test infrastructure and manual QA support.

#### Tasks

1. **Frontend Integration Tests** (4h - **UI Team involvement required**)
   
   **Prerequisites:**
   - ✅ Component test infrastructure exists (Vitest + React Testing Library)
   - ✅ UI team available for test review
   - ✅ Manual QA resources allocated
   
   **Test Implementation:**
   - See Appendix A for test file list
   - `tests/unit/components/charts/dual-axis-fullscreen-modal.test.tsx`
   - `tests/unit/components/charts/chart-fullscreen-modal.test.tsx`
   - Test "Expand by Dimension" button visibility
   - Test dimension selector modal
   - Test runtime filter inclusion in API requests
   - Test expanded chart rendering
   
   **Manual QA Checklist:**
   - [ ] Dashboard with org filter → chart fullscreen → expand by dimension → verify all filters applied
   - [ ] Dual-axis chart → expand by dimension → verify both axes present in each expanded chart
   - [ ] Multi-series chart → expand → verify all series rendered in each expanded chart
   - [ ] Dimension expansion with 20 values → verify truncation message if >20
   - [ ] Verify loading states during expansion
   - [ ] Verify error states (no dimension values, API failure, etc.)

2. **API Documentation** (2h)
   - `docs/api/query-builders-api.md` - Complete API reference:
     - QueryFilterBuilder methods, parameters, return types
     - QueryParamsBuilder usage examples
     - RuntimeFilterUtils integration patterns
     - JSDoc comments for all public methods
     - @param, @returns, @example, @security tags
   
3. **ADRs** (2h)
   - `docs/architecture/ADR-003-query-builders.md` - Complete with API examples
   - `docs/architecture/ADR-004-dashboard-runtime-filters.md`
   - Add executor modularity section to ADR-003
   
4. **Migration Guide** (1h)
   - `docs/guides/query-builder-migration.md`
   - When to use new utilities
   - Before/after code examples
   - Common pitfalls and best practices
   
5. **Operational Playbook** (1h)
   - `docs/operations/analytics-optimization-playbook.md`
   - Log fields for SOC dashboards
   - Feature flag instructions (`USE_NEW_QUERY_BUILDERS`)
   - Rollback procedures
   - Monitoring alerts for cache hit rate changes

#### Deliverables
- ✅ Frontend integration tests (2 test files - see Appendix A)
- ✅ Manual QA checklist completed with screenshots
- ✅ Complete API documentation
- ✅ ADRs published
- ✅ Migration guide
- ✅ Operational playbook

#### Go / No-Go Criteria
- ✅ **GO:** Frontend tests pass (with UI team sign-off), manual QA complete, all docs published
- ❌ **NO-GO:** Frontend regression, incomplete manual QA, or missing UI team review → delay Phase 7

#### Validation Commands
```bash
# Frontend tests (with UI team)
pnpm test -- run tests/unit/components/charts

# Verify all documentation exists
ls -la docs/api/query-builders-api.md
ls -la docs/architecture/ADR-003-query-builders.md
ls -la docs/architecture/ADR-004-dashboard-runtime-filters.md
ls -la docs/guides/query-builder-migration.md
ls -la docs/operations/analytics-optimization-playbook.md

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
```

---

### Phase 7 – Dead Code Elimination & Final Reporting (Week 8, 6h, Low Risk)
**Goal:** Remove stale code responsibly using explicit criteria; produce final optimization report.

#### Tasks

1. **Analysis Tools** (1h)
   ```bash
   npx ts-prune --ignore "tests/**"
   npx unimport --find
   npx jscpd lib/services lib/cache --min-lines 10 --min-tokens 50
   ```

2. **Apply Decision Matrix** (2h)
   
   | Finding | Action | Reason |
   |---------|--------|--------|
   | Exported function, no imports, > 6 months old | **Remove** | Confirmed dead code |
   | Exported function, no imports, < 6 months old | **Keep** | May be in-progress feature |
   | Internal function, never called, has TODO | **Keep** | Planned implementation |
   | Internal function, never called, no docs | **Remove** | Likely abandoned |
   | `.deprecated` file suffix | **Remove** | Explicitly marked for deletion |
   | Commented-out code | **Remove** | Use git history instead |
   | Test-only utilities in `lib/` | **Move to `tests/`** | Wrong location |

3. **Redis Cache Awareness** (0.5h)
   - Before removing code, verify it's not used by cache warming cron jobs
   - Check: `grep -r "warming\|invalidation" lib/cache/ --include="*.ts"`
   - Don't delete code used by scheduled jobs

4. **Documentation** (1.5h)
   - Create `docs/cleanup/dead-code-report-<date>.md`:
     - List of removed files/functions with rationale
     - Evidence (git history, usage analysis)
     - Date removed and removal commit SHA
   - Append code metrics improvement to `benchmarks-history.md`:
     - Duplication reduction percentage
     - LOC reduction per file
     - Service count reduction

5. **Final Testing** (0.5h)
   - Run complete test suite
   - Run cache smoke test
   - Run dimension expansion test
   - Manual validation of key workflows

6. **Final Optimization Report** (0.5h)
   - Create `docs/analytics/final-optimization-report-<date>.md`:
     - Executive summary of all phases
     - Cumulative benchmark improvements (Phase 0 vs Phase 6)
     - Code quality metrics (duplication, LOC, file count)
     - Test coverage improvements
     - Known issues and future work
     - Sign-off section for stakeholders

#### Deliverables
- ✅ `docs/cleanup/dead-code-report-<date>.md` (complete removal log)
- ✅ Updated code metrics in `benchmarks-history.md`
- ✅ `docs/analytics/final-optimization-report-<date>.md` (comprehensive summary)
- ✅ Evidence of test coverage for removed areas

#### Go / No-Go Criteria
- ✅ **GO:** All suites green, dead code report complete, no regressions introduced, final report published
- ❌ **NO-GO:** Any regression from removals → restore removed code immediately

#### Validation Commands
```bash
# Specialized tests
pnpm ts-node scripts/cache-smoke.ts --scenario post-phase7
pnpm test -- run tests/integration/dimension-expansion

# Verify final report exists
ls -la docs/analytics/final-optimization-report-*.md

# Standard validation
pnpm lint && pnpm tsc --noEmit && pnpm test
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
| Dashboard ↔ dimension config parity | 100% on relevant fields | Parity test pass rate |
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
| **Frontend** | UI components for dimension expansion | Phase 6 | Component tests + manual validation (with UI team) |
| **Performance** | Benchmark harness | Phase 0 baseline + after Phases 1–6 | ≤5% degradation or justified |
| **Security Logging** | Verify log payload snapshots | Phases 0, 1, 3, final | Byte-for-byte log field match |
| **RBAC** | Permission edge cases | Phase 3 | Fail-closed scenarios covered |
| **Cache** | Hit/miss, warming, invalidation | Phases 1, 4, 5, 7 | Cache behavior unchanged |
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

4. **Frontend Team Dependency (Phase 6)** - MEDIUM
   - **Risk:** UI team unavailable or component test infrastructure incomplete
   - **Mitigation:** Schedule UI team involvement before Phase 6, verify infrastructure in Phase 0

### Risk Response Plan

| Risk Level | Response Time | Action |
| --- | --- | --- |
| **Critical** (cache keys broken) | Immediate | Enable `USE_NEW_QUERY_BUILDERS=false`, investigate within 2h |
| **High** (recursion broken) | 1 hour | Revert phase commits, schedule fix |
| **Medium** (parity issues) | 4 hours | Fix forward if possible, revert if not |
| **Low** (documentation) | Next sprint | Address in follow-up PR |

---

## 9. Final Validation Checklist

**Phase Execution:**
- [ ] All phases executed sequentially (no skipping)
- [ ] `pnpm lint && pnpm tsc --noEmit && pnpm test` run after each phase
- [ ] Cache smoke suite green before advancing phases
- [ ] Dimension expansion test green before advancing phases

**Testing:**
- [ ] Cache key compatibility confirmed byte-for-byte (Phase 1)
- [ ] QueryOrchestrator recursion tests passing (Phase 4)
- [ ] Multi-series dimension expansion working (Phase 5)
- [ ] Frontend UI tested manually + with component tests (Phase 6, with UI team sign-off)
- [ ] Security log payloads verified (Phases 1, 3)
- [ ] RBAC edge cases tested (Phase 3)
- [ ] Error handling parity confirmed (Phase 1)

**Artifacts:**
- [ ] Benchmark results recorded in `docs/analytics/benchmarks-history.md` (Phases 0–6)
- [ ] Feature flag validated (Phase 1)
- [ ] Observability/log inventory updated (Phases 0, 1, 3)
- [ ] Documentation complete (ADRs, API docs, migration guide, operational playbook)
- [ ] Dead-code decisions in `docs/cleanup/dead-code-report-<date>.md`
- [ ] Final report published: `docs/analytics/final-optimization-report-<date>.md`

---

## 10. Effort Summary

| Phase | Hours | Risk | Key Deliverables | Dependencies |
| --- | --- | --- | --- | --- |
| **Phase 0** | 8h | Medium | Baselines, tooling, metrics | None |
| **Phase 1** | 12h | Medium-High | Query builders, cache key tests, security logs | Phase 0 |
| **Phase 2** | 9h | Low | Runtime filters, parity tests | Phase 1 |
| **Phase 3** | 7h | Medium | Service enhancements, RBAC tests | Phase 2 |
| **Phase 4** | 14h | Medium | Executor split, orchestrator tests | Phase 3 |
| **Phase 5** | 8h | Medium | Backend cache + dimension validation | Phase 4 |
| **Phase 6** | 10h | Low-Medium | Frontend tests, docs | Phase 5, **UI Team** |
| **Phase 7** | 6h | Low | Dead code cleanup, final report | Phase 6 |
| **TOTAL** | **74h** | | | **8-9 weeks** |

---

## Appendix A: Test Asset Creation Checklist

### Phase 0 - Baseline Assets
- [ ] `scripts/benchmark-dashboard-rendering.ts`
- [ ] `scripts/cache-smoke.ts`
- [ ] `benchmarks/baseline.json`
- [ ] `benchmarks/post-phase{1-6}.json` (scenario configs)
- [ ] `docs/analytics/log-inventory.md`
- [ ] `docs/analytics/benchmarks-history.md`
- [ ] `tests/integration/dimension-expansion/basic.test.ts` (if missing)

### Phase 1 - Query Builder Tests
- [ ] `tests/unit/utils/query-builders/query-filter-builder.test.ts`
- [ ] `tests/unit/utils/query-builders/query-params-builder.test.ts`
- [ ] `tests/unit/utils/query-builders/error-handling.test.ts`
- [ ] `tests/unit/cache/cache-key-generation.test.ts`
- [ ] `tests/unit/security/log-payload-verification.test.ts`
- [ ] `tests/integration/cache/data-source-cache.test.ts`

### Phase 2 - Runtime Filter Tests
- [ ] `tests/unit/utils/chart-config/runtime-filter-utils.test.ts`
- [ ] `tests/unit/services/dashboard-rendering/chart-config-builder.test.ts`
- [ ] `tests/integration/dimension-expansion/chart-config-parity.test.ts`

### Phase 3 - RBAC & Service Tests
- [ ] `tests/unit/services/dashboard-rendering/filter-service.test.ts` (expand with RBAC scenarios)
- [ ] `tests/integration/rbac/query-builders-rbac.test.ts`

### Phase 4 - Executor Tests
- [ ] `tests/unit/services/analytics/query-executors/base-query-executor.test.ts`
- [ ] `tests/unit/services/analytics/query-executors/standard-query-executor.test.ts`
- [ ] `tests/unit/services/analytics/query-executors/series-query-executor.test.ts`
- [ ] `tests/unit/services/analytics/query-executors/comparison-query-executor.test.ts`
- [ ] `tests/unit/services/analytics/query-orchestrator.test.ts` (expand with new scenarios)

### Phase 5 - Backend Validation Tests
- [ ] `tests/integration/cache/warming-with-new-utilities.test.ts`
- [ ] `tests/integration/dimension-expansion/multi-series.test.ts`
- [ ] `tests/integration/dimension-expansion/parallel-performance.test.ts`
- [ ] `tests/integration/dimension-expansion/api-route.test.ts`

### Phase 6 - Frontend Tests
- [ ] `tests/unit/components/charts/dual-axis-fullscreen-modal.test.tsx` (expand with dimension expansion scenarios)
- [ ] `tests/unit/components/charts/chart-fullscreen-modal.test.tsx` (expand with dimension expansion scenarios)

### Phase 7 - Documentation
- [ ] `docs/cleanup/dead-code-report-<date>.md`
- [ ] `docs/analytics/final-optimization-report-<date>.md`

### Documentation (Phase 6)
- [ ] `docs/architecture/ADR-003-query-builders.md`
- [ ] `docs/architecture/ADR-004-dashboard-runtime-filters.md`
- [ ] `docs/api/query-builders-api.md`
- [ ] `docs/guides/query-builder-migration.md`
- [ ] `docs/operations/analytics-optimization-playbook.md`

**Total New Files:** ~35 test files + 9 documentation files = **44 files**

---

## Appendix B: Cross-Team Coordination

### UI Team Dependencies

**When:** Phase 6 (Week 7)  
**Duration:** 4 hours of UI team time  
**Required Resources:**
- UI developer for component test review
- QA engineer for manual testing

**Coordination Points:**
1. **Pre-Phase 6 (Week 6):**
   - Confirm UI team availability
   - Verify component test infrastructure exists
   - Schedule QA resources for manual testing
   
2. **During Phase 6:**
   - Daily sync on test progress
   - Code review of component tests
   - Manual QA session (2h)
   
3. **Post-Phase 6:**
   - UI team sign-off on frontend tests
   - QA report with screenshots

**Escalation:** If UI team unavailable, Phase 6 can proceed with documentation only (6h), and frontend tests can be completed in follow-up sprint.

---

**Next Step:** Begin Phase 0 baseline instrumentation and tooling creation.  
**Owner:** Platform Analytics Team Lead  
**UI Team Liaison:** [Assign before Phase 6]  
**Review Cadence:** After each phase completion  
**Final Review:** After Phase 7 with stakeholder sign-off  

**Status:** ✅ Production-ready, execution-optimized plan with balanced workloads, clear dependencies, and comprehensive asset checklist.

