# Report Card Service Refactoring Plan

## Executive Summary

This plan addresses the code audit finding that two files exceed 1000 lines with mixed concerns:
- `report-card-generator.ts` (1,057 lines) - mixes scoring, aggregation, orchestration
- `rbac-report-card-service.ts` (1,265 lines) - mixes mapping, queries, analytics

The refactoring follows **Single Responsibility Principle (SRP)** and **DRY principles**, extracting focused modules while maintaining backward compatibility through the existing barrel exports in `index.ts`.

---

## Current State Analysis

### `report-card-generator.ts` - Mixed Responsibilities

| Responsibility | Methods | Lines | Notes |
|----------------|---------|-------|-------|
| **Orchestration** | `generateAll()`, `generateForMonthBulk()` | ~215 | Keep in generator |
| **Data Preloading** | `preload*` (4 methods) | ~185 | Extract to DataPreloader |
| **Score Calculation** | `scoreMeasureWithPreloadedData()`, `normalizeScore()`, `calculatePercentile()`, `calculateTrendScore()`, `calculateOverallScore()` | ~150 | Extract to ScoreCalculator |
| **Trend Calculation** | `calculateTrendWithPreloadedData()` | ~55 | Extract to ScoreCalculator |
| **Insight Generation** | `generateInsights()` | ~60 | Merge into ScoreCalculator |
| **Database Operations** | ~~`saveReportCard()`~~, `getActiveMeasures()` | ~100 | `saveReportCard()` is **DEAD CODE** - remove; `getActiveMeasures()` → MeasureService |
| **Utilities** | `formatMonthString()`, `getHistoricalMonths()` | ~25 | Move to `lib/utils/format-value.ts` |

### `rbac-report-card-service.ts` - Mixed Responsibilities

| Responsibility | Methods | Lines | Notes |
|----------------|---------|-------|-------|
| **RBAC/Authorization** | `getAccessiblePracticeUids()`, `requirePracticeAccess()` | ~50 | Keep in service |
| **Result Mapping** | `mapDbResultToReportCard()` | ~15 | Extract to ResultMapper |
| **Report Card Retrieval** | 6 `get*ByOrganization` methods | ~285 | Keep in service (orchestration) |
| **Annual Review Analytics** | `getAnnualReviewByOrganization()` | ~275 | Extract to AnnualReviewCalculator |
| **Peer Statistics** | `getPeerComparison()`, `calculateAllMeasureStats()` | ~170 | Extract to PeerStatisticsCalculator |
| **Measure CRUD** | `getMeasures()`, `createMeasure()`, `updateMeasure()`, `deleteMeasure()` | ~260 | Extract to MeasureService |

### Code Quality Issues to Fix During Refactor

1. **Dead Code**: `saveReportCard()` (lines 949-1024) is never called - remove it
2. **Incorrect Underscore Prefix**: `_practiceUid` in `calculateTrendWithPreloadedData()` is actually used - remove underscore
3. **Circular Dependency**: `rbac-report-card-service.ts` imports `reportCardGenerator.getActiveMeasures()` - extract to MeasureService

---

## Proposed Module Structure

```
lib/services/report-card/
├── index.ts                          # Barrel exports (existing, updated)
├── types.ts                          # Internal types (existing, extended)
├── internal.ts                       # NEW: Testing exports
│
├── rbac-report-card-service.ts       # SLIMMED: Orchestration + RBAC only (~400 lines)
├── report-card-generator.ts          # SLIMMED: Orchestration only (~300 lines)
│
├── statistics-collector.ts           # (existing, unchanged)
├── trend-analysis.ts                 # (existing, unchanged)
├── practice-sizing.ts                # (existing, unchanged)
├── location-comparison.ts            # (existing, unchanged)
│
├── scoring/                          # NEW - Score calculation
│   ├── index.ts                      # Barrel exports
│   └── score-calculator.ts           # Core scoring + insights (~250 lines)
│
├── data/                             # NEW - Data loading/mapping
│   ├── index.ts                      # Barrel exports
│   ├── data-preloader.ts             # Bulk data preloading (~200 lines)
│   └── result-mapper.ts              # DB result → domain mapping (~80 lines)
│
├── analytics/                        # NEW - Analytics calculations
│   ├── index.ts                      # Barrel exports
│   ├── annual-review-calculator.ts   # YoY, forecast, summary (~300 lines)
│   └── peer-statistics-calculator.ts # Peer comparison stats (~150 lines)
│
└── measures/                         # NEW - Measure management (uses BaseCrudService)
    ├── index.ts                      # Barrel exports
    ├── get-active-measures.ts        # Standalone function for CLI/cron (~40 lines)
    └── rbac-measure-service.ts       # Extends BaseCrudService (~180 lines)
```

**Design Decisions**:
1. `insight-generator.ts` merged into `score-calculator.ts` to avoid a thin module (~60 lines). Insights are closely related to scoring and don't warrant a separate file.
2. `measures/` uses the new **BaseCrudService infrastructure** for consistency with other CRUD services.

---

## Type Definitions (Add to `types.ts`)

### New Interfaces for Testability

```typescript
// types.ts - Add these interfaces

/**
 * Score calculator interface for dependency injection
 */
export interface IScoreCalculator {
  calculatePercentile(value: number, allValues: number[], higherIsBetter: boolean): number;
  calculateTrendScore(trendPercentage: number): number;
  normalizeScore(
    percentileRank: number,
    trend: TrendDirection,
    higherIsBetter: boolean,
    trendPercentage?: number
  ): number;
  calculateOverallScore(results: MeasureScoringResult[], measures: MeasureConfig[]): number;
  scoreMeasure(
    practiceUid: number,
    measure: MeasureConfig,
    sizeBucket: SizeBucket,
    targetMonth: string,
    monthStats: MonthStatisticsMap,
    peerStats: PeerStatisticsMap,
    trendDataMap: TrendDataMap
  ): MeasureScoringResult | null;
  generateInsights(results: MeasureScoringResult[], measures: MeasureConfig[]): string[];
}

/**
 * Data preloader interface for dependency injection
 */
export interface IDataPreloader {
  preloadSizeBuckets(practices: number[]): Promise<SizeBucketMap>;
  preloadMonthStatistics(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<MonthStatisticsMap>;
  preloadPeerStatistics(measures: MeasureConfig[], targetMonth: string): Promise<PeerStatisticsMap>;
  preloadTrendData(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<TrendDataMap>;
}

/**
 * Measure service interface for dependency injection
 * NOTE: getActiveMeasures is a standalone function, not part of this interface
 */
export interface IMeasureService {
  getList(options?: { activeOnly?: boolean }): Promise<{ items: MeasureConfig[]; total: number }>;
  getById(id: number): Promise<MeasureConfig | null>;
  create(data: MeasureCreateInput): Promise<MeasureConfig>;
  update(id: number, data: MeasureUpdateInput): Promise<MeasureConfig>;
  delete(id: number): Promise<void>;
}
```

### Existing Types to Import (NOT Redefine)

Each new module should import from existing `types.ts`:

| Module | Imports from `types.ts` |
|--------|------------------------|
| `score-calculator.ts` | `MeasureScoringResult`, `SizeBucketMap`, `MonthStatisticsMap`, `PeerStatisticsMap`, `TrendDataMap` |
| `data-preloader.ts` | `SizeBucketMap`, `OrganizationMap`, `MonthStatisticsMap`, `PeerStatisticsMap`, `TrendDataMap`, `PreloadedData` |
| `result-mapper.ts` | (imports from `@/lib/types/report-card`) |
| `annual-review-calculator.ts` | (imports from `@/lib/types/report-card`) |
| `peer-statistics-calculator.ts` | (no internal type imports) |
| `measure-service.ts` | `MeasureWithFilters` |

---

## Detailed Extraction Plan

### Phase 1: Utilities and Shared Code

**Update: `lib/utils/format-value.ts`**

Move from `report-card-generator.ts`:
- `formatMonthString()` - Format date as YYYY-MM-DD
- `getHistoricalMonths()` - Get last N months as array

```typescript
// lib/utils/format-value.ts - Add these functions

/**
 * Format a date as YYYY-MM-DD (first of month)
 */
export function formatMonthString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Get the last N months as an array of date strings
 * @returns Array of month strings (e.g., ["2025-10-01", "2025-09-01", ...])
 */
export function getHistoricalMonths(months: number): string[] {
  const result: string[] = [];
  const now = new Date();

  for (let i = 1; i <= months; i++) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(formatMonthString(targetMonth));
  }

  return result;
}
```

---

### Phase 2: Extract MeasureService (Resolves Circular Dependency)

Extract from both services to resolve circular dependency:
- From `report-card-generator.ts`: `getActiveMeasures()`
- From `rbac-report-card-service.ts`: `getMeasures()`, `createMeasure()`, `updateMeasure()`, `deleteMeasure()`

**Architecture Decision: Use BaseCrudService**

The MeasureService will use the new CRUD service infrastructure (`lib/services/crud/`) for consistency and to reduce boilerplate. This provides:
- ✅ Standard RBAC permission handling
- ✅ Consistent logging via `logTemplates.crud.*`
- ✅ Validators and hooks pattern
- ✅ Change tracking for updates

**Challenge**: The `report_card_measures` table uses `is_active = false` for soft delete (boolean flag) instead of a `deleted_at` timestamp. This requires overriding the `delete()` method.

**Special Case**: `getActiveMeasures()` is called without RBAC context (for CLI/cron), so it must be a standalone function outside the CRUD service.

---

**New File: `lib/services/report-card/measures/get-active-measures.ts`**

Standalone function for CLI/cron operations (no RBAC context required):

```typescript
// measures/get-active-measures.ts
import { db } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import { report_card_measures } from '@/lib/db/schema';
import type { MeasureConfig } from '@/lib/types/report-card';

/**
 * Get active measures configuration.
 *
 * IMPORTANT: This function has NO RBAC checks - it's designed for
 * CLI/cron operations where there's no user context.
 *
 * For RBAC-protected access, use RBACMeasureService.getList() instead.
 */
export async function getActiveMeasures(): Promise<MeasureConfig[]> {
  const measures = await db
    .select()
    .from(report_card_measures)
    .where(eq(report_card_measures.is_active, true))
    .orderBy(desc(report_card_measures.weight));

  return measures.map(mapToMeasureConfig);
}

function mapToMeasureConfig(row: typeof report_card_measures.$inferSelect): MeasureConfig {
  return {
    measure_id: row.measure_id,
    measure_name: row.measure_name,
    display_name: row.display_name,
    weight: parseFloat(row.weight || '5'),
    is_active: row.is_active ?? true,
    higher_is_better: row.higher_is_better ?? true,
    format_type: (row.format_type as 'number' | 'currency' | 'percentage') || 'number',
    data_source_id: row.data_source_id,
    value_column: row.value_column || 'numeric_value',
    filter_criteria: (row.filter_criteria as Record<string, string>) || {},
    created_at: row.created_at?.toISOString() || new Date().toISOString(),
    updated_at: row.updated_at?.toISOString() || new Date().toISOString(),
  };
}
```

---

**New File: `lib/services/report-card/measures/rbac-measure-service.ts`**

RBAC-protected CRUD service extending BaseCrudService:

```typescript
// measures/rbac-measure-service.ts
import { eq, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { report_card_measures } from '@/lib/db/schema';
import { BaseCrudService, type CrudServiceConfig } from '@/lib/services/crud';
import { log, logTemplates } from '@/lib/logger';
import { ConflictError } from '@/lib/errors/domain-errors';
import type { MeasureConfig, MeasureCreateInput, MeasureUpdateInput } from '@/lib/types/report-card';
import type { UserContext } from '@/lib/types/rbac';

/** Query options for measure list operations */
export interface MeasureQueryOptions {
  limit?: number;
  offset?: number;
  search?: string;
  activeOnly?: boolean;
}

/**
 * RBAC-protected CRUD service for report card measures.
 *
 * Uses BaseCrudService infrastructure for consistency with other services.
 *
 * NOTE: For CLI/cron operations without user context, use getActiveMeasures()
 * from './get-active-measures' instead.
 */
export class RBACMeasureService extends BaseCrudService<
  typeof report_card_measures,
  MeasureConfig,
  MeasureCreateInput,
  MeasureUpdateInput,
  MeasureQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof report_card_measures,
    MeasureConfig,
    MeasureCreateInput,
    MeasureUpdateInput,
    MeasureQueryOptions
  > = {
    table: report_card_measures,
    resourceName: 'report-card-measures',
    displayName: 'measure',
    primaryKeyName: 'measure_id',
    updatedAtColumnName: 'updated_at',
    // NOTE: No deletedAtColumnName - we use is_active boolean instead
    // Override delete() method below to handle this

    permissions: {
      read: 'analytics:read:all',
      create: 'analytics:read:all',
      update: 'analytics:read:all',
      delete: 'analytics:read:all',
    },

    // No organization scoping - measures are global
    organizationScoping: undefined,

    validators: {
      beforeCreate: async (data: MeasureCreateInput) => {
        // Check for duplicate measure_name
        const [existing] = await db
          .select({ measure_id: report_card_measures.measure_id })
          .from(report_card_measures)
          .where(eq(report_card_measures.measure_name, data.measure_name))
          .limit(1);

        if (existing) {
          throw new ConflictError(`Measure with name '${data.measure_name}' already exists`);
        }
      },
    },

    transformers: {
      toEntity: (row: Record<string, unknown>): MeasureConfig => ({
        measure_id: row.measure_id as number,
        measure_name: row.measure_name as string,
        display_name: row.display_name as string,
        weight: parseFloat((row.weight as string) || '5'),
        is_active: (row.is_active as boolean) ?? true,
        higher_is_better: (row.higher_is_better as boolean) ?? true,
        format_type: (row.format_type as 'number' | 'currency' | 'percentage') || 'number',
        data_source_id: row.data_source_id as number | null,
        value_column: (row.value_column as string) || 'numeric_value',
        filter_criteria: (row.filter_criteria as Record<string, string>) || {},
        created_at: (row.created_at as Date)?.toISOString() || new Date().toISOString(),
        updated_at: (row.updated_at as Date)?.toISOString() || new Date().toISOString(),
      }),
    },
  };

  /**
   * Override delete to use is_active = false instead of deleted_at timestamp.
   * The report_card_measures table uses a boolean flag for soft delete.
   */
  async delete(id: string | number): Promise<void> {
    const startTime = Date.now();

    // Check permission
    this.requireAnyPermission(['analytics:read:all']);

    // Verify entity exists
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Measure ${id} not found`);
    }

    // Soft delete using is_active = false
    await db
      .update(report_card_measures)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(report_card_measures.measure_id, Number(id)));

    const duration = Date.now() - startTime;

    // Log using standard template
    const template = logTemplates.crud.delete('measure', {
      resourceId: String(id),
      resourceName: existing.measure_name,
      userId: this.userContext.user_id,
      soft: true,
      duration,
      metadata: {
        component: 'crud-service',
        resourceType: 'report-card-measures',
      },
    });
    log.info(template.message, template.context);
  }

  /**
   * Build custom filter conditions for is_active filtering.
   */
  protected buildCustomConditions(options: MeasureQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Default to active only unless explicitly set to false
    if (options.activeOnly !== false) {
      conditions.push(eq(report_card_measures.is_active, true));
    }

    return conditions;
  }

  /**
   * Build search conditions for measure name and display name.
   */
  protected buildSearchConditions(search: string): SQL[] {
    const searchPattern = `%${search}%`;
    return [
      like(report_card_measures.measure_name, searchPattern),
      like(report_card_measures.display_name, searchPattern),
    ];
  }
}

/** Factory function for creating service instances */
export function createRBACMeasureService(userContext: UserContext): RBACMeasureService {
  return new RBACMeasureService(userContext);
}
```

---

**New File: `lib/services/report-card/measures/index.ts`**

```typescript
// measures/index.ts
export { getActiveMeasures } from './get-active-measures';
export { RBACMeasureService, createRBACMeasureService } from './rbac-measure-service';
export type { MeasureQueryOptions } from './rbac-measure-service';
```

---

**Circular Dependency Resolution:**
- Before: `rbac-report-card-service.ts` → `report-card-generator.ts` (via `getActiveMeasures()`)
- After: Both services → `measures/` module

---

### Phase 3: Extract Score Calculator

**New File: `lib/services/report-card/scoring/score-calculator.ts`**

Extract from `report-card-generator.ts`:
- `calculatePercentile()` - Percentile ranking logic
- `calculateTrendScore()` - Trend-based scoring (70-100 scale)
- `normalizeScore()` - Weighted composite scoring
- `calculateOverallScore()` - Weighted aggregation
- `scoreMeasureWithPreloadedData()` → renamed to `scoreMeasure()`
- `calculateTrendWithPreloadedData()` → renamed to `calculateTrend()` (fix `_practiceUid` → `practiceUid`)
- `generateInsights()` - Human-readable insight generation (merged from proposed insight-generator.ts)

```typescript
// scoring/score-calculator.ts
import type {
  MeasureScoringResult,
  MonthStatisticsMap,
  PeerStatisticsMap,
  TrendDataMap,
  IScoreCalculator,
} from '../types';
import type { MeasureConfig, SizeBucket, TrendDirection } from '@/lib/types/report-card';
import { SCORE_TRANSFORMATION, SCORE_WEIGHTS } from '@/lib/constants/report-card';
import { calculateTrend } from '@/lib/utils/trend-calculation';

export class ScoreCalculator implements IScoreCalculator {
  /**
   * Calculate percentile rank for a value within a distribution
   */
  calculatePercentile(value: number, allValues: number[], higherIsBetter: boolean): number;

  /**
   * Calculate trend score from trend percentage (70-100 scale)
   */
  calculateTrendScore(trendPercentage: number): number;

  /**
   * Normalize score using weighted composite of peer and trend scores
   */
  normalizeScore(
    percentileRank: number,
    trend: TrendDirection,
    higherIsBetter: boolean,
    trendPercentage?: number
  ): number;

  /**
   * Calculate overall weighted score from measure results
   */
  calculateOverallScore(results: MeasureScoringResult[], measures: MeasureConfig[]): number;

  /**
   * Score a single measure using preloaded data
   */
  scoreMeasure(
    practiceUid: number,
    measure: MeasureConfig,
    sizeBucket: SizeBucket,
    targetMonth: string,
    monthStats: MonthStatisticsMap,
    peerStats: PeerStatisticsMap,
    trendDataMap: TrendDataMap
  ): MeasureScoringResult | null;

  /**
   * Calculate trend from preloaded data
   * NOTE: Fixed parameter name from _practiceUid to practiceUid
   */
  calculateTrend(
    practiceUid: number,  // Fixed: removed underscore prefix
    measure: MeasureConfig,
    targetMonth: string,
    trendDataMap: TrendDataMap
  ): { direction: TrendDirection; percentage: number };

  /**
   * Generate human-readable insights from scoring results
   */
  generateInsights(results: MeasureScoringResult[], measures: MeasureConfig[]): string[];
}

export const scoreCalculator = new ScoreCalculator();
```

---

### Phase 4: Extract Data Preloader

**New File: `lib/services/report-card/data/data-preloader.ts`**

Extract from `report-card-generator.ts`:
- `preloadSizeBuckets()` - Bulk load size buckets
- `preloadMonthStatistics()` - Bulk load month statistics
- `preloadPeerStatistics()` - Bulk load peer statistics
- `preloadTrendData()` - Bulk load trend data

```typescript
// data/data-preloader.ts
import { db } from '@/lib/db';
import type {
  SizeBucketMap,
  OrganizationMap,
  MonthStatisticsMap,
  PeerStatisticsMap,
  TrendDataMap,
  PreloadedData,
  IDataPreloader,
} from '../types';
import type { MeasureConfig } from '@/lib/types/report-card';

export class DataPreloader implements IDataPreloader {
  constructor(private database = db) {}

  /**
   * Preload size buckets for all practices in a single query
   */
  async preloadSizeBuckets(practices: number[]): Promise<SizeBucketMap>;

  /**
   * Preload month statistics for all practices/measures in a single query
   */
  async preloadMonthStatistics(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<MonthStatisticsMap>;

  /**
   * Preload peer statistics by bucket in a single query
   */
  async preloadPeerStatistics(
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<PeerStatisticsMap>;

  /**
   * Preload trend data (prior 3 months) for all practices in a single query
   */
  async preloadTrendData(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string
  ): Promise<TrendDataMap>;

  /**
   * Preload all data for a generation run (convenience method)
   */
  async preloadAllForMonth(
    practices: number[],
    measures: MeasureConfig[],
    targetMonth: string,
    sizeBuckets: SizeBucketMap,
    organizationMap: OrganizationMap
  ): Promise<PreloadedData>;
}

export const dataPreloader = new DataPreloader();
```

---

### Phase 5: Extract Result Mapper

**New File: `lib/services/report-card/data/result-mapper.ts`**

Extract from `rbac-report-card-service.ts`:
- `mapDbResultToReportCard()` - Database result transformation

```typescript
// data/result-mapper.ts
import type { ReportCard, GradeHistoryEntry, MonthlyScore, SizeBucket } from '@/lib/types/report-card';
import type { report_card_results } from '@/lib/db/schema';
import { getLetterGrade, compareGrades } from '@/lib/utils/format-value';

export class ResultMapper {
  /**
   * Map database result to ReportCard domain object
   */
  mapDbResultToReportCard(result: typeof report_card_results.$inferSelect): ReportCard;

  /**
   * Map database results to GradeHistoryEntry array
   */
  mapToGradeHistory(
    results: Array<{
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
      size_bucket: string;
    }>
  ): GradeHistoryEntry[];

  /**
   * Map database results to MonthlyScore array
   */
  mapToMonthlyScores(
    results: Array<{
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
    }>
  ): MonthlyScore[];
}

export const resultMapper = new ResultMapper();
```

---

### Phase 6: Extract Analytics Calculators

**New File: `lib/services/report-card/analytics/annual-review-calculator.ts`**

Extract from `rbac-report-card-service.ts`:
- Year-over-year comparison calculation
- Per-measure YoY calculation
- Summary statistics calculation
- Forecast generation

```typescript
// analytics/annual-review-calculator.ts
import type {
  AnnualReview,
  MonthlyScore,
  YearOverYearComparison,
  MeasureYoYComparison,
  AnnualReviewSummary,
  AnnualForecast,
  MeasureConfig,
} from '@/lib/types/report-card';
import { resultMapper } from '../data/result-mapper';
import { measureService } from '../measures/measure-service';

export class AnnualReviewCalculator {
  /**
   * Calculate year-over-year comparison from monthly scores
   */
  calculateYearOverYear(
    monthlyScores: MonthlyScore[],
    currentYear: number
  ): YearOverYearComparison | null;

  /**
   * Calculate per-measure year-over-year comparisons
   */
  calculateMeasureYoY(
    results: Array<{
      report_card_month: string;
      measure_scores: unknown;
    }>,
    measures: MeasureConfig[],
    currentYear: number
  ): MeasureYoYComparison[];

  /**
   * Calculate summary statistics from monthly scores
   */
  calculateSummary(monthlyScores: MonthlyScore[]): AnnualReviewSummary;

  /**
   * Generate forecast based on recent trends
   */
  generateForecast(
    monthlyScores: MonthlyScore[],
    currentYear: number
  ): AnnualForecast | null;

  /**
   * Build complete annual review from database results
   */
  async buildAnnualReview(
    results: Array<{
      practice_uid: number;
      report_card_month: string;
      overall_score: string;
      percentile_rank: string;
      size_bucket: string;
      measure_scores: unknown;
    }>
  ): Promise<AnnualReview>;
}

export const annualReviewCalculator = new AnnualReviewCalculator();
```

**New File: `lib/services/report-card/analytics/peer-statistics-calculator.ts`**

Extract from `rbac-report-card-service.ts`:
- `calculateAllMeasureStats()` - Bulk statistics calculation

```typescript
// analytics/peer-statistics-calculator.ts
import { db } from '@/lib/db';

export class PeerStatisticsCalculator {
  constructor(private database = db) {}

  /**
   * Calculate statistics for ALL measures in a single bulk query
   */
  async calculateAllMeasureStats(
    practiceUids: number[],
    measureNames: string[]
  ): Promise<{
    averages: Record<string, number>;
    percentiles: Record<string, { p25: number; p50: number; p75: number }>;
  }>;

  /**
   * Calculate percentile at a given percentage
   */
  getPercentile(sortedValues: number[], percentile: number): number;
}

export const peerStatisticsCalculator = new PeerStatisticsCalculator();
```

---

## Cache Operations

**Important**: Redis cache operations remain in the orchestrator services (`rbac-report-card-service.ts`), NOT in extracted modules.

Cache interaction points (unchanged):
- `rbac-report-card-service.ts:171` - `reportCardCache.getReportCardByOrg()`
- `rbac-report-card-service.ts:215` - `reportCardCache.setReportCardByOrg()`
- `rbac-report-card-service.ts:541` - `reportCardCache.getAnnualReview()`
- `rbac-report-card-service.ts:780` - `reportCardCache.setAnnualReview()`
- `rbac-report-card-service.ts:823` - `reportCardCache.getPeerStats()`
- `rbac-report-card-service.ts:860` - `reportCardCache.setPeerStats()`

The extracted modules are pure calculation/data access - cache orchestration stays at the service level.

---

## Testing Exports

**New File: `lib/services/report-card/internal.ts`**

```typescript
// internal.ts - Export internal modules for testing
export { ScoreCalculator, scoreCalculator } from './scoring';
export { DataPreloader, dataPreloader } from './data';
export { ResultMapper, resultMapper } from './data';
export { AnnualReviewCalculator, annualReviewCalculator } from './analytics';
export { PeerStatisticsCalculator, peerStatisticsCalculator } from './analytics';
export { getActiveMeasures, RBACMeasureService, createRBACMeasureService } from './measures';
```

**Update: `lib/services/report-card/index.ts`**

```typescript
// index.ts - Add at end
export * as _internal from './internal';
```

**Usage in Tests:**

```typescript
import { _internal } from '@/lib/services/report-card';

describe('ScoreCalculator', () => {
  it('calculates percentile correctly', () => {
    const result = _internal.scoreCalculator.calculatePercentile(80, [70, 75, 80, 90], true);
    expect(result).toBe(50);
  });
});
```

---

## Dependency Injection Pattern

Use default parameter injection for testability without a full DI framework:

```typescript
// score-calculator.ts - Pure functions, no dependencies needed

// data-preloader.ts
export class DataPreloader implements IDataPreloader {
  constructor(private database = db) {}  // Injectable for tests
}

// report-card-generator.ts
export class ReportCardGeneratorService {
  constructor(
    private scoreCalc: IScoreCalculator = scoreCalculator,
    private preloader: IDataPreloader = dataPreloader,
    private measures: IMeasureService = measureService
  ) {}
}
```

---

## Refactored File Sizes (Revised Estimates)

| File | Before | After | Change |
|------|--------|-------|--------|
| `report-card-generator.ts` | 1,057 | ~300 | -72% |
| `rbac-report-card-service.ts` | 1,265 | ~400 | -68% |
| **New Modules** | | | |
| `scoring/score-calculator.ts` | - | ~250 | new (includes insights) |
| `data/data-preloader.ts` | - | ~200 | new |
| `data/result-mapper.ts` | - | ~80 | new |
| `analytics/annual-review-calculator.ts` | - | ~300 | new |
| `analytics/peer-statistics-calculator.ts` | - | ~120 | new |
| `measures/get-active-measures.ts` | - | ~40 | new (standalone function) |
| `measures/rbac-measure-service.ts` | - | ~180 | new (extends BaseCrudService) |

---

## Implementation Order (Revised)

Based on dependencies:

### Step 1: Types and Utilities
1. Add new interfaces to `types.ts` (IScoreCalculator, IDataPreloader, IMeasureService)
2. Move `formatMonthString()`, `getHistoricalMonths()` to `lib/utils/format-value.ts`

### Step 2: Create Directory Structure
```bash
mkdir -p lib/services/report-card/scoring
mkdir -p lib/services/report-card/data
mkdir -p lib/services/report-card/analytics
mkdir -p lib/services/report-card/measures
```

### Step 3: Extract Modules (Dependency Order)
1. `data/result-mapper.ts` - No dependencies on other new modules
2. `scoring/score-calculator.ts` - No dependencies, pure functions
3. `data/data-preloader.ts` - Depends on db, types
4. `measures/get-active-measures.ts` - Standalone function (no dependencies)
5. `measures/rbac-measure-service.ts` - Extends BaseCrudService (resolves circular dependency)
6. `analytics/peer-statistics-calculator.ts` - Depends on db, types
7. `analytics/annual-review-calculator.ts` - Depends on result-mapper, measures

### Step 4: Create Barrel Exports
1. `scoring/index.ts`
2. `data/index.ts`
3. `analytics/index.ts`
4. `measures/index.ts`
5. `internal.ts`

### Step 5: Update Parent Services
1. Update `report-card-generator.ts`:
   - Remove dead code (`saveReportCard()`)
   - Import from `scoring/`, `data/`, `measures/`
   - Remove utility functions (now in format-value.ts)
2. Update `rbac-report-card-service.ts`:
   - Import from `data/`, `analytics/`, `measures/`
   - Remove `reportCardGenerator.getActiveMeasures()` dependency

### Step 6: Update Main Barrel Export
Update `index.ts` to add `_internal` export

### Step 7: Verification
1. Run `pnpm tsc` - Ensure no TypeScript errors
2. Run `pnpm lint` - Ensure no linting errors
3. Run `pnpm test:run` - Ensure all tests pass
4. Verify backward compatibility - Public API unchanged

---

## Backward Compatibility

### Public API Remains Unchanged

The public API exposed through `index.ts` will NOT change:

```typescript
// These exports remain identical
export { RBACReportCardService, createRBACReportCardService } from './rbac-report-card-service';
export { ReportCardGeneratorService, reportCardGenerator } from './report-card-generator';
// ... other existing exports
```

### Breaking Changes: None

- All existing method signatures preserved
- All existing imports work unchanged
- Internal modules are implementation details

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaking existing functionality | Low | Comprehensive test suite, backward-compatible API |
| Circular dependencies | **Resolved** | MeasureService extracts shared `getActiveMeasures()` |
| Performance regression | Low | No logic changes, only organizational |
| Import path issues | Medium | Update all internal imports during refactor |

---

## Success Criteria

1. **No file exceeds 500 lines** (down from 1,000+)
2. **Each module has single responsibility** - Clear, focused purpose
3. **All tests pass** - No functional regressions
4. **TypeScript compiles cleanly** - No type errors
5. **Linting passes** - No style violations
6. **Public API unchanged** - Backward compatible
7. **DRY principle maintained** - No duplicated logic
8. **Dead code removed** - `saveReportCard()` deleted
9. **Circular dependency resolved** - Via measures module extraction
10. **Infrastructure consistency** - MeasureService uses BaseCrudService

---

## Resolved Questions

1. **Measure Service Placement**: Keep under `report-card/measures/` - tightly coupled to report card concepts (weights, filter_criteria)

2. **Internal Exports**: Export via `_internal` namespace for unit testing

3. **Insight Generator**: Merged into `score-calculator.ts` - too thin as standalone (~60 lines)

4. **CRUD Infrastructure**: Use `BaseCrudService` for `RBACMeasureService` - provides consistency with other services, standard logging, and reduces boilerplate. The `is_active` boolean soft delete pattern requires overriding `delete()` and `buildCustomConditions()`. The `getActiveMeasures()` function remains standalone for CLI/cron operations (no RBAC context).

---

## Next Steps

Upon approval:
1. Create directory structure
2. Add interfaces to types.ts
3. Move utility functions
4. Implement modules in dependency order
5. Update parent services
6. Run full verification suite
