/**
 * Unified Filter Pipeline Service
 *
 * Phase 1 High-Priority Refactoring: Single source of truth for all filter transformations.
 *
 * CONSOLIDATES logic from:
 * - FilterBuilderService (filter building)
 * - ChartConfigBuilderService (runtime filter building)
 * - BaseChartHandler (query params building)
 * - QueryBuilder (SQL filter building)
 * - Multiple filter conversion utilities
 *
 * KEY BENEFITS:
 * - Single source of truth for filter transformations
 * - Type-safe conversions (no casting)
 * - Consistent behavior across dashboard, charts, dimension expansion
 * - Easier testing (one comprehensive test suite)
 * - Better maintainability (changes in one place)
 *
 * PIPELINE STAGES:
 * 1. NORMALIZE: All input formats → UniversalChartFilters
 * 2. RESOLVE: Organization → practices, date presets → dates, RBAC validation
 * 3. BUILD QUERY PARAMS: UniversalChartFilters → AnalyticsQueryParams (SQL-ready)
 * 4. BUILD RUNTIME FILTERS: UniversalChartFilters → Record<string, unknown> (orchestrator-ready)
 */

import { QUERY_LIMITS } from '@/lib/constants/analytics';
import { log } from '@/lib/logger';
import { createOrganizationAccessService } from '@/lib/services/organization-access-service';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
import type { AnalyticsQueryParams, ChartFilter } from '@/lib/types/analytics';
import type {
  ChartExecutionFilters,
  FilterResolutionResult,
  UniversalChartFilters,
} from '@/lib/types/filters';
import type { UserContext } from '@/lib/types/rbac';
import { getDateRange } from '@/lib/utils/date-presets';

/**
 * Filter input types (all supported formats)
 */
export type FilterInput =
  | UniversalChartFilters
  | ChartFilter[]
  | Record<string, unknown> // BaseFilters or RuntimeFilters
  | ChartExecutionFilters;

/**
 * Pipeline options
 */
export interface FilterPipelineOptions {
  component: string;
  enableOrgResolution?: boolean;
  enableRBAC?: boolean;
  failClosedSecurity?: boolean;
  defaultLimit?: number;
  dataSourceId?: number;
  dataSourceType?: 'measure-based' | 'table-based';
}

/**
 * Complete pipeline result
 */
export interface FilterPipelineResult {
  normalized: UniversalChartFilters;
  resolved: ChartExecutionFilters;
  queryParams: AnalyticsQueryParams;
  runtimeFilters: Record<string, unknown>;
  metadata: {
    organizationResolved: boolean;
    practiceUidCount: number;
    hasDateRange: boolean;
    hasMeasure: boolean;
    hasFrequency: boolean;
  };
}

/**
 * Quick conversion result (no resolution)
 */
export interface QuickFilterResult {
  chartFilters: ChartFilter[];
  runtimeFilters: Record<string, unknown>;
  normalized: UniversalChartFilters;
}

/**
 * Unified Filter Pipeline
 *
 * Single service for all filter transformations across the entire charting system.
 */
export class FilterPipeline {
  constructor(private readonly userContext: UserContext) {}

  /**
   * Main pipeline: Input → Normalized → Resolved → Query Params + Runtime Filters
   *
   * Full pipeline with organization resolution and RBAC validation.
   * Use this for dashboard rendering and dimension expansion.
   *
   * @param input - Filter input (any supported format)
   * @param options - Pipeline options
   * @returns Complete pipeline result
   */
  async process(input: FilterInput, options: FilterPipelineOptions): Promise<FilterPipelineResult> {
    const startTime = Date.now();

    // Stage 1: Normalize input to UniversalChartFilters
    const normalized = this.normalizeInput(input, options.component);

    // Stage 2: Resolve filters (org → practices, date presets → dates, RBAC)
    const resolved = await this.resolveFilters(normalized, options);

    // Stage 3: Build query parameters (SQL-ready)
    const queryParams = this.buildQueryParams(resolved, options);

    // Stage 4: Build runtime filters (orchestrator-ready)
    const runtimeFilters = this.buildRuntimeFilters(resolved);

    // Collect metadata
    const metadata = {
      organizationResolved: Boolean(normalized.organizationId && resolved.practiceUids.length > 0),
      practiceUidCount: resolved.practiceUids.length,
      hasDateRange: Boolean(resolved.dateRange.startDate && resolved.dateRange.endDate),
      hasMeasure: Boolean(resolved.measure),
      hasFrequency: Boolean(resolved.frequency),
    };

    const duration = Date.now() - startTime;

    log.debug('Filter pipeline completed', {
      userId: this.userContext.user_id,
      component: options.component,
      metadata,
      duration,
    });

    return {
      normalized,
      resolved,
      queryParams,
      runtimeFilters,
      metadata,
    };
  }

  /**
   * Quick conversion without resolution
   *
   * Use when you don't need organization resolution or RBAC validation.
   * Faster path for simple filter conversions.
   *
   * @param input - Filter input (any supported format)
   * @param component - Component name for logging
   * @returns Quick filter result
   */
  quickConvert(input: FilterInput, component: string): QuickFilterResult {
    const normalized = this.normalizeInput(input, component);

    return {
      chartFilters: this.toChartFilterArray(normalized),
      runtimeFilters: this.toRuntimeFilters(normalized),
      normalized,
    };
  }

  /**
   * STAGE 1: Normalize all input formats to UniversalChartFilters
   *
   * Handles:
   * - UniversalChartFilters (pass-through)
   * - ChartFilter[] array
   * - BaseFilters (Record<string, unknown>)
   * - RuntimeFilters (Record<string, unknown>)
   * - ChartExecutionFilters
   *
   * @param input - Filter input
   * @param component - Component name for logging
   * @returns Normalized UniversalChartFilters
   */
  private normalizeInput(input: FilterInput, component: string): UniversalChartFilters {
    // 1. Already UniversalChartFilters
    if (this.isUniversalFilters(input)) {
      log.debug('Filter input already normalized', {
        userId: this.userContext.user_id,
        component,
      });
      return input;
    }

    // 2. ChartFilter array
    if (Array.isArray(input)) {
      log.debug('Normalizing ChartFilter array', {
        userId: this.userContext.user_id,
        filterCount: input.length,
        component,
      });
      return this.fromChartFilterArray(input);
    }

    // 3. ChartExecutionFilters
    if (this.isChartExecutionFilters(input)) {
      log.debug('Normalizing ChartExecutionFilters', {
        userId: this.userContext.user_id,
        component,
      });
      return this.fromChartExecutionFilters(input);
    }

    // 4. BaseFilters or RuntimeFilters (Record<string, unknown>)
    log.debug('Normalizing Record<string, unknown> filters', {
      userId: this.userContext.user_id,
      component,
    });
    return this.fromRecordFilters(input);
  }

  /**
   * STAGE 2: Resolve filters with organization resolution and RBAC
   *
   * Process:
   * 1. Validate organization access (if organizationId provided)
   * 2. Resolve organizationId → practiceUids (with hierarchy)
   * 3. Extract date range (from preset or explicit dates)
   * 4. Build ChartExecutionFilters
   *
   * @param normalized - Normalized universal filters
   * @param options - Pipeline options
   * @returns Resolved execution filters
   */
  private async resolveFilters(
    normalized: UniversalChartFilters,
    options: FilterPipelineOptions
  ): Promise<ChartExecutionFilters> {
    // 1. Resolve date range (from preset or explicit dates)
    const { startDate, endDate } = getDateRange(
      normalized.dateRangePreset,
      normalized.startDate,
      normalized.endDate
    );

    // 2. Resolve organization filter to practiceUids (if present and enabled)
    let practiceUids: number[] = [];

    if (normalized.organizationId && options.enableOrgResolution !== false) {
      // Validate access and resolve organization
      const resolution = await this.resolveOrganizationFilter(
        normalized.organizationId,
        options.component
      );
      practiceUids = resolution.practiceUids;

      log.info('Organization filter resolved in pipeline', {
        userId: this.userContext.user_id,
        organizationId: normalized.organizationId,
        practiceUidCount: practiceUids.length,
        includesHierarchy: resolution.includesHierarchy,
        component: options.component,
      });
    } else if (normalized.practiceUids && normalized.practiceUids.length > 0) {
      // Use explicit practiceUids if provided (takes precedence)
      practiceUids = normalized.practiceUids;

      log.debug('Explicit practice UIDs used', {
        userId: this.userContext.user_id,
        practiceUidCount: practiceUids.length,
        component: options.component,
      });
    }

    // 3. Build advanced filters array
    const advancedFilters: ChartFilter[] = [...(normalized.advancedFilters || [])];

    // 4. Build execution filters
    const executionFilters: ChartExecutionFilters = {
      dateRange: {
        startDate,
        endDate,
      },
      practiceUids,
      advancedFilters,
    };

    // Add optional filters if present
    if (normalized.measure) {
      executionFilters.measure = normalized.measure;
    }

    if (normalized.frequency) {
      executionFilters.frequency = normalized.frequency;
    }

    if (normalized.providerName) {
      executionFilters.providerName = normalized.providerName;
    }

    return executionFilters;
  }

  /**
   * STAGE 3: Build analytics query parameters
   *
   * Converts ChartExecutionFilters to AnalyticsQueryParams for SQL query building.
   *
   * @param resolved - Resolved execution filters
   * @param options - Pipeline options
   * @returns Analytics query parameters
   */
  private buildQueryParams(
    resolved: ChartExecutionFilters,
    options: FilterPipelineOptions
  ): AnalyticsQueryParams {
    const queryParams: AnalyticsQueryParams = {
      data_source_id: options.dataSourceId || 0,
      start_date: resolved.dateRange.startDate,
      end_date: resolved.dateRange.endDate,
      limit: options.defaultLimit || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
    };

    // Add data source type if specified
    if (options.dataSourceType) {
      queryParams.data_source_type = options.dataSourceType;
    }

    // Add optional parameters
    if (resolved.measure) {
      queryParams.measure = resolved.measure as import('@/lib/types/analytics').MeasureType;
    }

    if (resolved.frequency) {
      queryParams.frequency = resolved.frequency as import('@/lib/types/analytics').FrequencyType;
    }

    if (resolved.providerName) {
      queryParams.provider_name = resolved.providerName;
    }

    // Initialize advanced_filters array
    queryParams.advanced_filters = [...resolved.advancedFilters];

    // Handle practiceUids with fail-closed security
    if (resolved.practiceUids.length > 0) {
      // Normal case: filter to these practices
      const practiceUidFilter: ChartFilter = {
        field: 'practice_uid',
        operator: 'in',
        value: resolved.practiceUids,
      };

      queryParams.advanced_filters.push(practiceUidFilter);
    } else if (options.failClosedSecurity) {
      // FAIL-CLOSED SECURITY: Empty array with fail-closed option = no data
      const impossibleFilter: ChartFilter = {
        field: 'practice_uid',
        operator: 'in',
        value: [-1], // Impossible practice_uid value
      };

      queryParams.advanced_filters.push(impossibleFilter);

      log.security('Fail-closed security triggered in pipeline', 'high', {
        userId: this.userContext.user_id,
        result: 'no_data_returned',
        reason: 'empty_practice_uids_with_fail_closed',
        component: options.component,
      });
    }

    return queryParams;
  }

  /**
   * STAGE 4: Build runtime filters
   *
   * Converts ChartExecutionFilters to runtime filters for ChartDataOrchestrator.
   *
   * @param resolved - Resolved execution filters
   * @returns Runtime filters object
   */
  private buildRuntimeFilters(resolved: ChartExecutionFilters): Record<string, unknown> {
    const runtimeFilters: Record<string, unknown> = {};

    // Date range
    if (resolved.dateRange.startDate) {
      runtimeFilters.startDate = resolved.dateRange.startDate;
    }
    if (resolved.dateRange.endDate) {
      runtimeFilters.endDate = resolved.dateRange.endDate;
    }

    // Practice UIDs (only if not empty)
    if (resolved.practiceUids.length > 0) {
      runtimeFilters.practiceUids = resolved.practiceUids;
    }

    // Measure and frequency
    if (resolved.measure) {
      runtimeFilters.measure = resolved.measure;
    }
    if (resolved.frequency) {
      runtimeFilters.frequency = resolved.frequency;
    }

    // Provider name
    if (resolved.providerName) {
      runtimeFilters.providerName = resolved.providerName;
    }

    // Advanced filters
    if (resolved.advancedFilters.length > 0) {
      runtimeFilters.advancedFilters = resolved.advancedFilters;
    }

    return runtimeFilters;
  }

  /**
   * Resolve organization filter to practice UIDs with RBAC validation
   *
   * Security-critical: Validates user has access to the organization.
   *
   * @param organizationId - Organization ID from filter
   * @param component - Component name for logging
   * @returns Resolved practice UIDs with metadata
   * @throws Error if user cannot access the organization
   */
  private async resolveOrganizationFilter(
    organizationId: string,
    component: string
  ): Promise<FilterResolutionResult> {
    const startTime = Date.now();

    // Step 1: Validate organization access (RBAC)
    await this.validateOrganizationAccess(organizationId, component);

    // Step 2: Resolve organization to practice UIDs (with hierarchy)
    const allOrganizations = await organizationHierarchyService.getAllOrganizations();
    const practiceUids = await organizationHierarchyService.getHierarchyPracticeUids(
      organizationId,
      allOrganizations
    );

    const duration = Date.now() - startTime;

    log.info('Organization filter resolved in pipeline', {
      userId: this.userContext.user_id,
      organizationId,
      practiceUidCount: practiceUids.length,
      includesHierarchy: practiceUids.length > 0,
      duration,
      component,
    });

    return {
      practiceUids,
      organizationId,
      includesHierarchy: practiceUids.length > 0,
    };
  }

  /**
   * Validate user has access to the organization
   *
   * RBAC enforcement for organization filtering.
   *
   * @param organizationId - Organization ID to validate
   * @param component - Component name for security logging
   * @throws Error if user cannot access the organization
   */
  private async validateOrganizationAccess(
    organizationId: string,
    component: string
  ): Promise<void> {
    const accessService = createOrganizationAccessService(this.userContext);
    const accessInfo = await accessService.getAccessiblePracticeUids();

    // Super admins can filter by any organization
    if (accessInfo.scope === 'all') {
      log.info('Super admin accessing organization filter', {
        userId: this.userContext.user_id,
        organizationId,
        permissionScope: 'all',
        component,
      });
      return;
    }

    // Provider users cannot use organization filter
    if (accessInfo.scope === 'own') {
      log.security('Provider user attempted organization filter - denied', 'high', {
        userId: this.userContext.user_id,
        organizationId,
        blocked: true,
        reason: 'provider_cannot_filter_by_org',
        component,
      });

      throw new Error(
        'Access denied: Provider-level users cannot filter by organization. You can only see your own provider data.'
      );
    }

    // Organization users can only filter by their accessible organizations
    if (accessInfo.scope === 'organization') {
      const canAccess = this.userContext.accessible_organizations.some(
        (org) => org.organization_id === organizationId
      );

      if (!canAccess) {
        log.security('Organization filter access denied', 'high', {
          userId: this.userContext.user_id,
          requestedOrganizationId: organizationId,
          accessibleOrganizationIds: this.userContext.accessible_organizations.map(
            (o) => o.organization_id
          ),
          blocked: true,
          reason: 'user_not_member_of_requested_org',
          component,
        });

        throw new Error(
          `Access denied: You do not have permission to filter by organization ${organizationId}.`
        );
      }
    }

    // No analytics permission
    if (accessInfo.scope === 'none') {
      log.security('User without analytics permission attempted organization filter - denied', 'medium', {
        userId: this.userContext.user_id,
        organizationId,
        blocked: true,
        reason: 'no_analytics_permission',
        component,
      });

      throw new Error('Access denied: You do not have analytics permissions to filter by organization.');
    }
  }

  /**
   * Convert UniversalChartFilters to ChartFilter array
   *
   * @param normalized - Normalized universal filters
   * @returns Array of chart filters
   */
  toChartFilterArray(normalized: UniversalChartFilters): ChartFilter[] {
    const filters: ChartFilter[] = [];

    // Date range filters
    if (normalized.startDate) {
      filters.push({
        field: 'date',
        operator: 'gte',
        value: normalized.startDate,
      });
    }

    if (normalized.endDate) {
      filters.push({
        field: 'date',
        operator: 'lte',
        value: normalized.endDate,
      });
    }

    // Practice UIDs filter
    if (normalized.practiceUids && normalized.practiceUids.length > 0) {
      filters.push({
        field: 'practice_uid',
        operator: 'in',
        value: normalized.practiceUids,
      });
    }

    // Measure filter
    if (normalized.measure) {
      filters.push({
        field: 'measure',
        operator: 'eq',
        value: normalized.measure,
      });
    }

    // Frequency filter
    if (normalized.frequency) {
      filters.push({
        field: 'frequency',
        operator: 'eq',
        value: normalized.frequency,
      });
    }

    // Advanced filters (pass through)
    if (normalized.advancedFilters) {
      filters.push(...normalized.advancedFilters);
    }

    return filters;
  }

  /**
   * Convert UniversalChartFilters to runtime filters object
   *
   * @param normalized - Normalized universal filters
   * @returns Runtime filters object
   */
  private toRuntimeFilters(normalized: UniversalChartFilters): Record<string, unknown> {
    const runtimeFilters: Record<string, unknown> = {};

    if (normalized.startDate) runtimeFilters.startDate = normalized.startDate;
    if (normalized.endDate) runtimeFilters.endDate = normalized.endDate;
    if (normalized.measure) runtimeFilters.measure = normalized.measure;
    if (normalized.frequency) runtimeFilters.frequency = normalized.frequency;
    if (normalized.providerName) runtimeFilters.providerName = normalized.providerName;
    if (normalized.practiceUids && normalized.practiceUids.length > 0) {
      runtimeFilters.practiceUids = normalized.practiceUids;
    }
    if (normalized.advancedFilters && normalized.advancedFilters.length > 0) {
      runtimeFilters.advancedFilters = normalized.advancedFilters;
    }

    return runtimeFilters;
  }

  /**
   * Convert ChartFilter array to UniversalChartFilters
   *
   * @param filters - Chart filter array
   * @returns Universal filters
   */
  private fromChartFilterArray(filters: ChartFilter[]): UniversalChartFilters {
    const universalFilters: UniversalChartFilters = {};

    for (const filter of filters) {
      switch (filter.field) {
        case 'date':
          if (filter.operator === 'gte') {
            universalFilters.startDate = filter.value as string;
          } else if (filter.operator === 'lte') {
            universalFilters.endDate = filter.value as string;
          }
          break;

        case 'practice_uid':
          if (filter.operator === 'in' && Array.isArray(filter.value)) {
            universalFilters.practiceUids = filter.value as number[];
          }
          break;

        case 'measure':
          if (filter.operator === 'eq') {
            universalFilters.measure = filter.value as string;
          }
          break;

        case 'frequency':
        case 'time_period':
          if (filter.operator === 'eq') {
            universalFilters.frequency = filter.value as string;
          }
          break;

        default:
          // Unknown filter - add to advancedFilters
          if (!universalFilters.advancedFilters) {
            universalFilters.advancedFilters = [];
          }
          universalFilters.advancedFilters.push(filter);
          break;
      }
    }

    return universalFilters;
  }

  /**
   * Convert ChartExecutionFilters to UniversalChartFilters
   *
   * @param executionFilters - Chart execution filters
   * @returns Universal filters
   */
  private fromChartExecutionFilters(executionFilters: ChartExecutionFilters): UniversalChartFilters {
    const universalFilters: UniversalChartFilters = {
      startDate: executionFilters.dateRange.startDate,
      endDate: executionFilters.dateRange.endDate,
      practiceUids: executionFilters.practiceUids,
      advancedFilters: executionFilters.advancedFilters,
    };

    // Only include optional fields if they have values
    if (executionFilters.measure) {
      universalFilters.measure = executionFilters.measure;
    }
    if (executionFilters.frequency) {
      universalFilters.frequency = executionFilters.frequency;
    }
    if (executionFilters.providerName) {
      universalFilters.providerName = executionFilters.providerName;
    }

    return universalFilters;
  }

  /**
   * Convert Record<string, unknown> (BaseFilters or RuntimeFilters) to UniversalChartFilters
   *
   * @param record - Filter record
   * @returns Universal filters
   */
  private fromRecordFilters(record: Record<string, unknown>): UniversalChartFilters {
    const universalFilters: UniversalChartFilters = {};

    if (typeof record.startDate === 'string') universalFilters.startDate = record.startDate;
    if (typeof record.endDate === 'string') universalFilters.endDate = record.endDate;
    if (typeof record.dateRangePreset === 'string') universalFilters.dateRangePreset = record.dateRangePreset;
    if (typeof record.organizationId === 'string') universalFilters.organizationId = record.organizationId;
    if (typeof record.measure === 'string') universalFilters.measure = record.measure;
    if (typeof record.frequency === 'string') universalFilters.frequency = record.frequency;
    if (typeof record.providerName === 'string') universalFilters.providerName = record.providerName;
    if (Array.isArray(record.practiceUids)) universalFilters.practiceUids = record.practiceUids as number[];
    if (Array.isArray(record.advancedFilters)) {
      universalFilters.advancedFilters = record.advancedFilters as ChartFilter[];
    }

    return universalFilters;
  }

  /**
   * Type guard: Check if input is UniversalChartFilters
   */
  private isUniversalFilters(input: FilterInput): input is UniversalChartFilters {
    return (
      typeof input === 'object' &&
      !Array.isArray(input) &&
      !('dateRange' in input) && // Not ChartExecutionFilters
      (('startDate' in input && typeof input.startDate === 'string') ||
        ('endDate' in input && typeof input.endDate === 'string') ||
        ('organizationId' in input && typeof input.organizationId === 'string') ||
        ('practiceUids' in input && Array.isArray(input.practiceUids)) ||
        ('measure' in input && typeof input.measure === 'string') ||
        ('frequency' in input && typeof input.frequency === 'string'))
    );
  }

  /**
   * Type guard: Check if input is ChartExecutionFilters
   */
  private isChartExecutionFilters(input: FilterInput): input is ChartExecutionFilters {
    return (
      typeof input === 'object' &&
      !Array.isArray(input) &&
      'dateRange' in input &&
      typeof input.dateRange === 'object' &&
      input.dateRange !== null &&
      'practiceUids' in input &&
      Array.isArray(input.practiceUids)
    );
  }
}

/**
 * Create filter pipeline instance
 *
 * Factory function for creating pipeline with user context.
 *
 * @param userContext - User context for RBAC
 * @returns Filter pipeline instance
 */
export function createFilterPipeline(userContext: UserContext): FilterPipeline {
  return new FilterPipeline(userContext);
}

