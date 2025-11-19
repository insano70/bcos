# Analytics System Optimization Plan (v3)

**Date:** November 19, 2025  
**Author:** Platform Analytics Team  
**Scope:** Chart handlers, dashboard rendering stack, analytics query services, Redis data-source cache, dimension expansion pipeline, supporting utilities, and related documentation/tooling  
**Duration:** 7 weeks (49–60 engineering hours) covering seven sequential phases  
**Status:** Ready for implementation  

---

## 1. Overview

This v3 plan supersedes v2 by (a) clarifying the seven-phase timeline, (b) adding per-phase deliverables and go/no-go criteria, (c) defining artifact destinations (benchmarks, ADRs, logs), and (d) tightening dependencies between phases. All refactors must keep dashboard rendering, Redis cache, and dimension expansion in lockstep while preserving existing observability signals. Each phase finishes only after required tests, cache/dimension smoke suites, and benchmark comparisons have been captured in the shared `docs/analytics/benchmarks-history.md`.

---

## 2. Guiding Principles

1. **Security & Observability First** – Existing `log.info`/`log.security` payloads must be preserved or explicitly superseded; new utilities expose logging hooks for parity.  
2. **Shared Behaviour, Single Source** – Query/filter utilities must be consumed by chart handlers, orchestrators, cache services, and dimension expansion to prevent divergence.  
3. **SRP Without God Classes** – Maintain the current modular dashboard services; optimize within boundaries rather than merging into a monolith.  
4. **Parity Testing & Benchmarks** – Refactors touching query params or runtime filters must pass dashboard, analytics, cache, and dimension-expansion tests plus benchmark comparisons.  
5. **Feature-flagged Safety** – High-risk changes (Phase 1) ship behind `USE_NEW_QUERY_BUILDERS` to enable fast rollback.  
6. **Documentation as Deliverable** – ADRs, log inventories, and benchmark deltas are required outputs, not optional notes.  

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

| Asset | Needed By | Notes |
| --- | --- | --- |
| `scripts/benchmark-dashboard-rendering.ts` | Phases 0–5 | Must exist or be created in Phase 0 (baseline + comparisons) |
| `scripts/cache-smoke.ts` | Phases 0–5 | Runs cache hit/miss scenarios; ensure fixtures available |
| `tests/integration/dimension-expansion` suite | Phases 1–5 | Add if missing; run after each phase |
| `tests/integration/cache/data-source-cache.test.ts` | Phases 1–6 | Added in Phase 1 but executed onwards |
| `docs/analytics/log-inventory.md` | Phases 0, 1, 3 | Log payload snapshots |
| `docs/analytics/benchmarks-history.md` | Every phase | Append benchmark deltas with scenario metadata |

---

## 5. Phase Plan

### Phase 0 – Baseline, Benchmarks & Instrumentation (Week 0, 6h, Medium Risk)
**Goal:** Capture behaviour, performance, and observability baselines before code changes.

**Tasks**
1. Log inventory of all relevant services (`BaseChartHandler`, `FilterService`, `data-source-cache`, dimension expansion).  
2. Run benchmark harness (`node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/baseline.json`) capturing cold/warm dashboard, dimension expansion, legacy vs cache paths, Redis latency; store results in `benchmarks/baseline-<date>.json` and summarize in `docs/analytics/benchmarks-history.md`.  
3. Execute `pnpm test -- --runInBand tests/integration/dashboard-rendering` and `tests/integration/rbac/charts-service.test.ts`.  
4. Manual dimension expansion validation (dashboard org filter → expand).  
5. Run cache smoke script (`pnpm ts-node scripts/cache-smoke.ts --clear --scenario baseline`).  
6. Capture LOC + duplication metrics via `npx jscpd` into `benchmarks/code-metrics-baseline.json`.

**Deliverables**
- `docs/analytics/log-inventory.md` (baseline snapshot).  
- `docs/analytics/benchmarks-history.md` entries for each scenario.  
- Baseline JSON files under `benchmarks/`.

**Go / No-Go**
- ✅ Baseline tests green, scripts verified.  
- ❌ Missing benchmark tooling or failing integration tests ⇒ halt and fix before Phase 1.

**Validation Commands**
`pnpm lint && pnpm tsc --noEmit && pnpm test`

---

### Phase 1 – Observability-Preserving Query Builders (Week 1, 12h, Medium Risk)
**Goal:** Extract `QueryFilterBuilder` / `QueryParamsBuilder`, preserve logging, and guard Redis cache + dimension expansion compatibility.

**Tasks**
1. Implement utilities with logging hooks and fail-closed helpers.  
2. Update `BaseChartHandler.buildQueryParams` to delegate with callbacks; wrap behind `USE_NEW_QUERY_BUILDERS` flag.  
3. Update `QueryExecutor.executeLegacyQuery` to use new builders.  
4. Add unit tests for builders (including security/injection scenarios and log spy assertions).  
5. Add `tests/unit/cache/cache-key-generation.test.ts`.  
6. Expand integration coverage: `tests/integration/dimension-expansion`, cache smoke suite, manual expand-by-dimension scenario.  
7. Re-run benchmarks (`benchmarks/post-phase1.json`) and append comparison table to `benchmarks-history.md`.

**Deliverables**
- New utilities + tests.  
- Updated builder logging documentation in `docs/architecture/ADR-003-query-builders.md`.  
- Benchmark delta entry (≤5% regressions or documented rationale).

**Go / No-Go**
- ✅ All tests + cache/dimension suites green, benchmark delta within threshold, feature flag toggles verified.  
- ❌ Cache key mismatch or >5% regression ⇒ revert to baseline, investigate.

**Validation Commands**
See v2 plan (Phase 1) commands; ensure `node scripts/benchmark-dashboard-rendering.ts --config=benchmarks/post-phase1.json` executed and logged.

---

### Phase 2 – Shared Runtime Filter Utilities & Coverage (Week 2, 8h, Low Risk)
**Goal:** Provide common runtime filter utilities and prove dashboard/dimension parity.

**Tasks**
1. Create `lib/utils/chart-config/runtime-filter-utils.ts`.  
2. Refactor `ChartConfigBuilderService` to use utilities (class remains orchestrator).  
3. Update `DimensionExpansionRenderer` to import utilities.  
4. Update `data-source-cache` to reuse conversions.  
5. Add unit + integration tests (including parity fixtures).  
6. Benchmarks (`post-phase2`) + doc updates.

**Deliverables**
- Utility module + related tests.  
- `docs/architecture/ADR-004-dashboard-runtime-filters.md`.  
- Benchmark entry + parity test results.

**Go / No-Go**
- ✅ Dashboard & dimension configs identical in parity tests; benchmarks acceptable.  
- ❌ Parity failures or benchmark regression >5% ⇒ halt.

**Validation Commands**
Same as v2 (Phase 2) plus benchmark command.

---

### Phase 3 – Service Resilience & Logging Enhancements (Week 3, 6h, Medium Risk)
**Goal:** Harden loader/batch/filter services (no consolidation) and enrich logs.

**Tasks**
1. Add retries + inactive-chart logging to `DashboardLoaderService`.  
2. Enhance `BatchExecutorService` logging (group stats, per-chart duration).  
3. Expose practice summary helper + provider denial tests in `FilterService`.  
4. Track dimension truncation metrics in expansion renderer.  
5. Update `docs/DIMENSION_EXPANSION_OPTIMIZATION_REPORT.md` with new log fields.  
6. Benchmarks + log inventory refresh.

**Deliverables**
- Updated services + tests.  
- Log inventory delta appended.  
- Benchmark entry `post-phase3`.

**Go / No-Go**
- ✅ All tests green, new logs verified via manual scenario.  
- ❌ Retry logic failing or logs missing required fields ⇒ block.

---

### Phase 4 – Query Executor Modularity Without Breaking Orchestrator (Weeks 4–5, 14h, Medium Risk)
**Goal:** Split `QueryExecutor` into specialized executors while keeping `QueryOrchestrator`, cache, and dimension expansion behaviour identical.

**Tasks**
1. Define `IQueryExecutor` + `BaseQueryExecutor` (shared helpers).  
2. Implement `Standard`, `Series`, `Comparison` executors.  
3. Add `QueryExecutorFacade` (exported as `queryExecutor`).  
4. Update `QueryOrchestrator` to use facade and confirm recursion/calculateTotal flows.  
5. Expand unit + integration suites (including cache path testing).  
6. Run cache smoke, dimension expansion tests, benchmarks (`post-phase4`), and document results.

**Deliverables**
- New executor classes + updated orchestrator tests.  
- Added section in `ADR-003` covering executor modularity.  
- Benchmark/table updates.

**Go / No-Go**
- ✅ Multi-series + comparison recursion tests pass, cache/dimension suites green, benchmark regression ≤5%.  
- ❌ Any regression in cache path or dimension expansion ⇒ revert Phase 4 commits.

---

### Phase 5 – Cache & Dimension Expansion Parity Tests + Documentation (Week 6, 8h, Low Risk)
**Goal:** Finalize cache and dimension-expansion parity, documentation, and operational guides.

**Tasks**
1. Finalize cache integration suite (hit/miss, RBAC, advanced filters).  
2. Build end-to-end dimension expansion test hitting `/api/.../expand`.  
3. Produce ADRs + onboarding updates referencing new utilities.  
4. Publish operational playbook (log fields, feature flag instructions).  
5. Run benchmark harness (`post-phase5`) and summarize improvements vs baseline.

**Deliverables**
- Integration test assets.  
- ADRs + onboarding doc updates.  
- Benchmark comparison table in `benchmarks-history.md`.

**Go / No-Go**
- ✅ Cache + dimension suites stable, docs reviewed, benchmark trend acceptable.  
- ❌ Failing parity tests or missing docs ⇒ delay Phase 6.

---

### Phase 6 – Targeted Dead Code Elimination & Reporting (Week 7, 5h, Low Risk)
**Goal:** Remove stale code using explicit criteria and document decisions.

**Tasks**
1. Run `ts-prune`, `unimport`, `jscpd` (with awareness of scheduled jobs/cache warming).  
2. Apply decision matrix (unused exports >6 months, `.deprecated` files, etc.).  
3. Update `docs/cleanup/dead-code-report.md` summarizing removals.  
4. Run full test + cache/dimension suites after removal.  
5. No benchmarks required unless removal affects runtime-critical code.

**Deliverables**
- Updated cleanup report + tool outputs.  
- Evidence of tests covering removals.

**Go / No-Go**
- ✅ Suites green, report complete.  
- ❌ Any regression ⇒ restore removed code immediately.

---

## 6. Rollback Strategy

1. **Branch & Tag Discipline** – Each phase on its own branch (`optimization/phase-N`), tagged with `phase-N-start` / `phase-N-complete`.  
2. **Revert Process** – To roll back Phase N, checkout `main`, cherry-pick `phase-(N-1)-complete`, or `git revert <bad-commits>`; avoid `reset`.  
3. **Feature Flag** – `USE_NEW_QUERY_BUILDERS=false` reverts Phase 1 changes without redeploy.  
4. **Benchmark Revalidation** – After rollback, rerun baseline benchmarks + smoke suites and append a rollback note to `benchmarks-history.md`.  
5. **Documentation Sync** – Update ADRs/plan if rollback occurs, noting root cause + follow-up.

---

## 7. Success Metrics & Test Strategy

### Success Metrics

| Metric | Target |
| --- | --- |
| Query-building duplication | ≥25% reduction (`jscpd`) |
| Dashboard ↔ dimension config parity | 100% parity tests passing |
| Executor maintainability | `QueryExecutor` main file <150 lines, behaviour parity confirmed |
| Cache/dimension regressions | 0 incidents post-deploy |
| Observability | Legacy log keys preserved + new metrics documented |
| Benchmark delta | ≤5% degradation per scenario or documented reason |
| Documentation coverage | All planned ADRs, log inventories, and reports merged |

### Test Strategy Matrix

| Level | Coverage | Trigger |
| --- | --- | --- |
| Unit | Utilities, executors, services | Post-change |
| Service | Chart handlers, dashboard services | End of Phases 1–4 |
| Integration | Dashboard rendering, cache, dimension expansion | End of every phase |
| E2E/Manual | Org filter + dimension expansion workflow | Phases 1, 2, 4, 5 |
| Performance | Benchmark harness | Phase 0 baseline + after Phases 1–5 |
| Security Logging | Verify log payload snapshots | Phases 0, 1, 3, final |

---

## 8. Validation Checklist

- [ ] Phases executed sequentially (no skipping).  
- [ ] `pnpm lint`, `pnpm tsc --noEmit`, and full `pnpm test` run after each phase.  
- [ ] Cache smoke suite + dimension expansion test green before advancing phases.  
- [ ] Benchmark results recorded in `docs/analytics/benchmarks-history.md` after Phases 0–5.  
- [ ] Feature flag toggled + validated (Phase 1).  
- [ ] Observability/log inventory updated (Phases 0, 1, 3).  
- [ ] Documentation (ADRs, onboarding, cleanup report) merged.  
- [ ] Dead-code decisions recorded in `docs/cleanup/dead-code-report.md`.  

---

**Next Step:** Execute Phase 0 baseline instrumentation.  
**Owner:** Platform Analytics Team Lead.  


