# Analytics System Optimization Plan (v2)

**Date:** November 19, 2025  
**Author:** Platform Analytics Team  
**Scope:** Chart handlers, dashboard rendering stack, analytics query services, Redis data-source cache, dimension expansion pipeline, and supporting utilities  
**Duration:** 6–7 weeks (42–56 engineering hours)  
**Status:** Ready for implementation  

---

## 1. Overview

This plan evolves the prior optimization proposal with explicit safeguards for existing observability, RBAC surfaces, and shared execution paths (dashboard rendering, Redis-backed cache, and dimension expansion). Each phase is scoped to deliver measurable improvements without collapsing intentionally separated services. Every change requires end-to-end validation that includes cache-path execution and at least one dimension expansion scenario.

---

## 2. Guiding Principles

1. **Security & Observability First** – Preserve existing `log.info/log.security` fields. Add new utilities only after populating the same structured metadata.
2. **Shared Behaviour, Single Source** – Utilities must be consumed by chart handlers, orchestrators, cache services, and dimension expansion to avoid drift.
3. **SRP Without God Classes** – Keep `DashboardLoaderService`, `BatchExecutorService`, and `FilterService` as focused units; optimize them internally rather than merging.
4. **Parity Testing** – Any refactor touching query parameters or runtime filters must run dashboard, analytics, and upcoming dimension expansion tests plus cache-path smoke checks.
5. **Zero Regression Tolerance** – All phases finish with `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`, plus targeted suites (`tests/integration/dashboard-rendering`, cache smoke script, etc.).

---

## 3. Current Architecture Snapshot

| Area | Key Components | Notes |
| --- | --- | --- |
| Chart query construction | `BaseChartHandler.buildQueryParams`, `QueryExecutor.executeLegacyQuery` | Duplicate logic + logging |
| Dashboard rendering | `DashboardLoaderService`, `FilterService`, `ChartConfigBuilderService`, `BatchExecutorService` | Shared with dimension expansion |
| Analytics orchestration | `QueryOrchestrator` + `queryExecutor` (multi-series, comparison, legacy path) | Cache + legacy routing |
| Redis cache | `lib/cache/data-source-cache.ts` | Applies RBAC + advanced filters in-memory |
| Dimension expansion | `dimension-expansion-renderer`, `dimension-discovery-service`, `ChartConfigBuilderService` | Reuses dashboard config builder |

---

## 4. Phase Plan

### Phase 0 – Baseline, Benchmarks & Instrumentation (Week 0, 6h, Medium Risk)
**Goal:** Capture behavioural + performance baselines and log inventories before touching code.

1. **Log Inventory**
   - Enumerate current `log.info` / `log.security` payloads for:
     - `BaseChartHandler.buildQueryParams`
     - `FilterService.validateAndResolve`
     - `data-source-cache` RBAC + advanced filter handling
     - Dimension expansion render steps
   - Store in `docs/analytics/log-inventory.md`.
2. **Benchmark Harness**
   - Run `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json` capturing:
     - Dashboard render time (10 charts, cold + warm cache)
     - Dimension expansion (20 values)
     - Single chart render (legacy + cache paths)
     - Redis cache hit/miss latency
   - Archive outputs in `benchmarks/baseline-<date>.json`.
3. **Test & Cache Smoke Runs**
   - `pnpm test -- --runInBand tests/integration/dashboard-rendering`
   - `pnpm test -- --runInBand tests/integration/rbac/charts-service.test.ts`
   - Execute `/api/admin/analytics/charts/:chartId/expand` manually with org filter to confirm current UX.
   - Run cache smoke script: `pnpm ts-node scripts/cache-smoke.ts --clear --scenario baseline`.
4. **Code Metrics Snapshot**
   - Capture LOC/file sizes for affected services + duplication score via `npx jscpd`.
   - Store in `benchmarks/code-metrics-baseline.json`.

**Validation:** `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`.

---

### Phase 1 – Observability-Preserving Query Builders (Week 1, 10h, Medium Risk)
**Goal:** Extract `QueryFilterBuilder` and `QueryParamsBuilder` utilities while keeping existing security logs and fail-closed semantics.

#### Steps
1. **Create `lib/utils/query-builders/query-filter-builder.ts`**
   - Static builders for dates, measure, frequency, provider, practice UID, advanced filters.
   - Accept optional logger hooks so callers can pass structured metadata callbacks (matching existing `log.security` structures).
   - Include explicit security helpers (e.g., `withSecurityLogging`) for fail-closed paths.
2. **Create `lib/utils/query-builders/query-params-builder.ts`**
   - Accepts chart config + options.
   - Provides callback parameters (`onPracticeFilterApplied`, `onPracticeFilterFailClosed`) for log re-use.
3. **Update `BaseChartHandler.buildQueryParams`**
   - Delegate to `QueryParamsBuilder`.
   - Forward logging callbacks that emit the same `log.security` and `log.info` payloads currently in the method.
4. **Update `QueryExecutor.executeLegacyQuery`**
   - Use `QueryFilterBuilder` for filter sets.
   - Preserve metadata for debugging (e.g., `columnMappings.timePeriodField` usage).
5. **Add focused unit tests**
   - `tests/unit/utils/query-builders/query-filter-builder.test.ts`
   - `tests/unit/utils/query-builders/query-params-builder.test.ts`
   - Cover logging callback invocation via spies/mocks.
   - Security scenarios: fail-closed practice arrays, SQL-injection-like inputs, log preservation.
6. **Dimension Expansion Regression + Cache Compatibility**
   - Run `pnpm test -- --runInBand tests/integration/dimension-expansion` (new or existing) to prove refactor keeps expansion intact.
   - Manual validation: dashboard -> org filter -> “Expand by Dimension”.
   - Add `tests/unit/cache/cache-key-generation.test.ts` ensuring query params still result in the same Redis cache key components.
   - Execute cache smoke script to verify hit/miss after refactor.

#### Validation
```bash
pnpm lint lib/utils/query-builders
pnpm tsc --noEmit lib/utils/query-builders
pnpm test -- run tests/unit/utils/query-builders
pnpm test -- run tests/unit/services/chart-handlers/base-handler.test.ts
pnpm test -- run tests/unit/services/analytics/query-executor.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm lint
pnpm tsc --noEmit
pnpm test
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json
```

---

### Phase 2 – Shared Runtime Filter Utilities & Coverage (Week 2, 8h, Low Risk)
**Goal:** Ensure dashboard rendering, dimension expansion, and cache services normalize filters identically.

#### Steps
1. **Create `lib/utils/chart-config/runtime-filter-utils.ts`**
   - Exports `extractDataSourceFilters`, `buildRuntimeFilters`, `normalizeChartConfig`.
   - Accepts options for log context (chart ID, component name).
2. **Refactor `ChartConfigBuilderService`**
   - Replace private helpers with utility functions but keep the service thin (maintain class for DI/testing).
   - Update log statements to include new fields (e.g., `runtimeFilterOrigin`).
3. **Update `DimensionExpansionRenderer`**
   - Ensure it imports the same utilities instead of re-instantiating.
   - Add integration test verifying renderer output matches dashboard config for identical inputs.
4. **Update `data-source-cache` advanced filter handling**
   - Convert existing inline conversions to use `convertBaseFiltersToChartFilters` / new helpers.
5. **Add targeted tests**
   - `tests/unit/utils/chart-config/runtime-filter-utils.test.ts`
   - `tests/unit/services/dashboard-rendering/chart-config-builder.test.ts` (ensuring same output as before).
   - Add fixture-driven test verifying dimension expansion config equals dashboard config for the same chart definition.
   - `tests/integration/dimension-expansion/chart-config-parity.test.ts`.

#### Validation
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

### Phase 3 – Service Resilience & Logging Enhancements (Week 3, 6h, Medium Risk)
**Goal:** Improve existing services without collapsing them into a single file (explicitly skipping prior consolidation concept).

#### Steps
1. **Dashboard Loader**
   - Add retry/backoff when fetching chart definitions (handles transient DB hiccups).
   - Emit `log.security` event when a dashboard references an inactive chart (currently silent).
2. **Batch Executor**
   - Add structured logging for batching groups (data source IDs, estimated savings).
   - Capture per-chart orchestration duration for later metrics.
   - Ensure errors propagate with chart IDs for dimension expansion reuse.
3. **Filter Service**
   - Expose helper to summarize resolved practice UID counts (used by dimension expansion + dashboards).
   - Add unit tests covering provider-level denials.
4. **Dimension Expansion**
   - Reuse new helper data and add metrics for truncated dimension sets vs. max limit.
   - Integration test: ensure truncation logs fire and metadata indicates truncation count.
5. **Docs**
   - Update `docs/DIMENSION_EXPANSION_OPTIMIZATION_REPORT.md` with log key references.

#### Validation
```bash
pnpm test -- run tests/unit/services/dashboard-rendering
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/rbac/charts-service.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase3.json
```

---

### Phase 4 – Query Executor Modularity Without Breaking Orchestrator (Week 4–5, 12h, Medium Risk)
**Goal:** Introduce executor specializations while maintaining the current `QueryOrchestrator` contract.

#### Steps
1. **Design Interfaces**
   - `IQueryExecutor` interface that exposes `executeLegacyQuery`, `executeMultipleSeries`, `executePeriodComparison`, `calculateTotal`, `getColumnMappings`.
   - Create `BaseQueryExecutor` containing shared helpers (`getColumnMappings`, `processAdvancedFilters`, `calculateTotal`).
2. **Implement Specialized Executors**
   - `StandardQueryExecutor` (legacy path).
   - `SeriesQueryExecutor` (multi-series).
   - `ComparisonQueryExecutor`.
3. **Introduce Facade**
   - `QueryExecutorFacade` implements `IQueryExecutor` and delegates to specialized classes.
   - Update imports so `queryExecutor` now exports the facade (same public API).
4. **Update `QueryOrchestrator`**
   - Ensure binding (`this.queryMeasures.bind(this)`) still works with new executors.
   - Add regression tests verifying recursion for multi-series / comparison remains intact.
   - Verify cache path invocation still uses `queryExecutor.calculateTotal`.
5. **Redis Cache Regression**
   - Run `tests/integration/cache/data-source-cache.test.ts` to ensure cache path still hits `QueryExecutor` facade correctly.
6. **Dimension Expansion Regression**
   - Execute `tests/integration/dimension-expansion` to guarantee orchestrator changes do not break expansion (it routes through orchestrator).
5. **Testing**
   - Expand `tests/unit/services/analytics/query-executor*.test.ts`.
   - Add integration tests hitting both cache and legacy paths to confirm no regressions.

#### Validation
```bash
pnpm test -- run tests/unit/services/analytics
pnpm test -- run tests/integration/analytics
pnpm test -- run tests/integration/dashboard-rendering
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase4.json
```

---

### Phase 5 – Cache & Dimension Expansion Parity Tests + Documentation (Week 6, 8h, Low Risk)
**Goal:** Ensure Redis cache and dimension expansion flows stay aligned with new utilities.

#### Steps
1. **Cache Smoke Suite**
   - Add `tests/integration/cache/data-source-cache.test.ts` that simulates cache hit/miss, RBAC filtering, and advanced filter application.
2. **Dimension Expansion Integration Test**
   - Build end-to-end test using factories to request expansion via API route (`/api/admin/analytics/charts/[chartId]/expand`).
   - Assert runtime filters, logs, and returned metadata include new fields.
3. **Docs & ADRs**
   - `docs/architecture/ADR-003-query-builders.md`
   - `docs/architecture/ADR-004-dashboard-runtime-filters.md`
   - Update onboarding guide to describe new utility locations.
4. **Operational Playbook**
   - Document log fields so SOC can update dashboards before deployment.
5. **Performance Benchmark**
   - Re-run benchmark harness and compare against baseline; include table in docs summarizing changes.

#### Validation
```bash
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion
pnpm test
pnpm lint
pnpm tsc --noEmit
node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase5.json
```

---

### Phase 6 – Targeted Dead Code Elimination & Reporting (Week 7, 6h, Low Risk)
**Goal:** Remove stale code responsibly using explicit criteria.

#### Steps
1. **Analysis Tools**
   - `npx ts-prune --ignore "tests/**"`
   - `npx unimport --find`
   - `npx jscpd lib/ lib/cache/ --min-lines 10 --min-tokens 50`
2. **Decision Matrix**
   - Exported & unused > 6 months old → remove.
   - Exported & unused < 6 months → document + defer.
   - Internal unused code with TODO → keep.
   - `.deprecated` files → remove.
   - Test-only helpers in `lib/` → move to `tests/`.
3. **Redis Awareness**
   - Confirm cache warming / cron scripts reference candidate code before deletion.
4. **Documentation**
   - Update `docs/cleanup/dead-code-report.md` summarizing removals + rationale.
5. **Tests**
   - Run full suite plus cache & dimension expansion tests after removals.

#### Validation
```bash
pnpm lint
pnpm tsc --noEmit
pnpm test
pnpm test -- run tests/integration/cache/data-source-cache.test.ts
pnpm test -- run tests/integration/dimension-expansion
```

---

## 5. Rollback Strategy

1. **Branch & Tag Discipline**
   - Before each phase: `git checkout -b optimization/phase-N` and `git tag phase-N-start`.
   - After successful validation: `git tag phase-N-complete`.
2. **Rollback Process**
   - `git checkout main && git cherry-pick phase-(N-1)-complete` to return to last known good state.
   - If specific commits cause issues, `git revert <bad-sha>` without resetting shared history.
3. **Feature Flags**
   - Introduce env flag `USE_NEW_QUERY_BUILDERS` during Phase 1 to allow rapid disablement if needed.
4. **Benchmark Revalidation**
   - After rollback, re-run baseline benchmark + smoke suites.
5. **Documentation Sync**
   - Update ADRs/plan if a rollback occurs to note the reason + mitigation.

---

## 6. Success Metrics & Test Matrix

### Success Metrics

| Metric | Target |
| --- | --- |
| Code duplication in query building | ≥25% reduction (measured via `jscpd`) |
| Dashboard & dimension config parity | 100% parity confirmed by tests |
| Executor maintainability | `QueryExecutor` file size reduced to <150 lines while retaining behaviour |
| Cache/dimension regression count | 0 incidents post-deploy |
| Observability | Same security log keys + new metrics documented |
| Benchmark delta | ≤5% degradation per scenario (or documented rationale) |

### Test Strategy Matrix

| Level | Coverage | Trigger |
| --- | --- | --- |
| Unit | Query builders, runtime filters, executors | After code changes |
| Service | Chart handlers, dashboard services | End of Phases 1–4 |
| Integration | Dashboard rendering, cache, dimension expansion | End of every phase |
| E2E/Manual | Dashboard org filter + dimension expansion | Phases 1, 2, 4, final |
| Performance | Benchmark harness | Phase 0 baseline + after every phase |
| Security Logging | Verify log payload snapshots | Phases 1, 3, final |

---

## 7. Validation Checklist

- [ ] All phases completed sequentially (no skipping).  
- [ ] `pnpm lint`, `pnpm tsc --noEmit`, and full `pnpm test` executed after each phase.  
- [ ] Cache smoke suite + dimension expansion test green before declaring completion.  
- [ ] Documentation and ADRs merged.  
- [ ] Observability team acknowledges updated log inventory.  
- [ ] Benchmark deltas recorded after each phase.  
- [ ] Dead code removal decisions documented.  

---

**Next Step:** Begin Phase 0 instrumentation to baseline current behaviour.  
**Owner:** Platform Analytics Team Lead.  


