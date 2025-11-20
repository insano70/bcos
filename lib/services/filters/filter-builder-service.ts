/**
 * Filter Builder Service
 *
 * Centralized service for building and validating chart filters.
 * Consolidates filter conversion logic from 4+ different locations.
 *
 * Single Responsibility: Convert and validate filters through single pipeline
 *
 * Replaces:
 * - lib/utils/filter-converters.ts (2 conversion functions)
 * - lib/utils/organization-filter-resolver.ts (organization resolution)
 * - lib/services/dashboard-rendering/filter-service.ts (partial - validation)
 * - Duplicate logic in base-handler.ts, chart-config-builder.ts, dimension-expansion-renderer.ts
 *
 * Benefits:
 * - Type-safe transformations (no casting)
 * - Single organization resolution implementation
 * - Consistent practiceUids handling
 * - Clear filter pipeline
 */

import { QUERY_LIMITS } from '@/lib/constants/analytics';
import { log } from '@/lib/logger';
import { createOrganizationAccessService } from '@/lib/services/organization-access-service';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
import type { AnalyticsQueryParams, ChartFilter } from '@/lib/types/analytics';
import type {
  ChartExecutionFilters,
  FilterBuilderOptions,
  FilterResolutionResult,
  UniversalChartFilters,
} from '@/lib/types/filters';
import type { UserContext } from '@/lib/types/rbac';
import { getDateRange } from '@/lib/utils/date-presets';

/**
 * Chart configuration extract (minimal interface)
 */
interface ChartConfig {
  dataSourceId: number;
  limit?: number;
  chartType?: string;
  [key: string]: unknown;
}

/**
 * Filter Builder Service
 *
 * Provides type-safe filter building and validation for chart systems.
 */
export class FilterBuilderService {
  constructor(private readonly userContext: UserContext) {}

  /**
   * Build chart execution filters from universal filters
   *
   * Process:
   * 1. Validate organization access (if organizationId provided)
   * 2. Resolve organizationId → practiceUids (with hierarchy)
   * 3. Extract date range (from preset or explicit dates)
   * 4. Normalize to ChartExecutionFilters
   *
   * @param universalFilters - Universal chart filters from API
   * @param options - Filter builder options
   * @returns Normalized chart execution filters
   */
  async buildExecutionFilters(
    universalFilters: UniversalChartFilters,
    options: FilterBuilderOptions
  ): Promise<ChartExecutionFilters> {
    const startTime = Date.now();

    // 1. Resolve date range (from preset or explicit dates)
    const { startDate, endDate } = getDateRange(
      universalFilters.dateRangePreset,
      universalFilters.startDate,
      universalFilters.endDate
    );

    // 2. Resolve organization filter to practiceUids (if present)
    let practiceUids: number[] = [];

    if (universalFilters.organizationId) {
      // Validate access and resolve organization
      const resolution = await this.resolveOrganizationFilter(
        universalFilters.organizationId,
        options.component
      );
      practiceUids = resolution.practiceUids;

      log.info('Organization filter resolved in filter builder', {
        userId: this.userContext.user_id,
        organizationId: universalFilters.organizationId,
        practiceUidCount: practiceUids.length,
        includesHierarchy: resolution.includesHierarchy,
        component: options.component,
      });
    } else if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      // Use explicit practiceUids if provided (takes precedence)
      practiceUids = universalFilters.practiceUids;

      log.info('Explicit practice UIDs filter applied', {
        userId: this.userContext.user_id,
        practiceUidCount: practiceUids.length,
        component: options.component,
      });
    }

    // 3. Build advanced filters array
    const advancedFilters: ChartFilter[] = [
      ...(universalFilters.advancedFilters || []),
    ];

    // 4. Build normalized execution filters
    const executionFilters: ChartExecutionFilters = {
      dateRange: {
        startDate,
        endDate,
      },
      practiceUids,
      advancedFilters,
    };

    // Add optional filters if present
    if (universalFilters.measure) {
      executionFilters.measure = universalFilters.measure;
    }

    if (universalFilters.frequency) {
      executionFilters.frequency = universalFilters.frequency;
    }

    if (universalFilters.providerName) {
      executionFilters.providerName = universalFilters.providerName;
    }

    const duration = Date.now() - startTime;

    log.debug('Chart execution filters built', {
      userId: this.userContext.user_id,
      hasPracticeUids: practiceUids.length > 0,
      practiceUidCount: practiceUids.length,
      hasAdvancedFilters: advancedFilters.length > 0,
      advancedFilterCount: advancedFilters.length,
      hasMeasure: Boolean(executionFilters.measure),
      hasFrequency: Boolean(executionFilters.frequency),
      duration,
      component: options.component,
    });

    return executionFilters;
  }

  /**
   * Build analytics query parameters from execution filters
   *
   * Converts normalized ChartExecutionFilters to AnalyticsQueryParams
   * for SQL query building.
   *
   * Handles:
   * - Date range mapping
   * - practiceUids → advanced_filters conversion
   * - Fail-closed security (empty practiceUids → impossible filter)
   * - Filter merging
   *
   * @param executionFilters - Normalized execution filters
   * @param chartConfig - Chart configuration
   * @param options - Filter builder options
   * @returns Analytics query parameters ready for SQL builder
   */
  buildQueryParams(
    executionFilters: ChartExecutionFilters,
    chartConfig: ChartConfig,
    options: FilterBuilderOptions
  ): AnalyticsQueryParams {
    // Build base query parameters
    const queryParams: AnalyticsQueryParams = {
      data_source_id: chartConfig.dataSourceId,
      start_date: executionFilters.dateRange.startDate,
      end_date: executionFilters.dateRange.endDate,
      limit: chartConfig.limit || options.defaultLimit || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
    };

    // Add data source type if specified
    if (options.dataSourceType) {
      queryParams.data_source_type = options.dataSourceType;
    }

    // Add optional parameters
    if (executionFilters.measure) {
      queryParams.measure = executionFilters.measure as import('@/lib/types/analytics').MeasureType;
    }

    if (executionFilters.frequency) {
      queryParams.frequency = executionFilters.frequency as import('@/lib/types/analytics').FrequencyType;
    }

    if (executionFilters.providerName) {
      queryParams.provider_name = executionFilters.providerName;
    }

    // Initialize advanced_filters array
    queryParams.advanced_filters = [...executionFilters.advancedFilters];

    // Handle practiceUids with fail-closed security
    if (executionFilters.practiceUids.length > 0) {
      // Normal case: filter to these practices
      const practiceUidFilter: ChartFilter = {
        field: 'practice_uid',
        operator: 'in',
        value: executionFilters.practiceUids,
      };

      queryParams.advanced_filters.push(practiceUidFilter);

      log.debug('Practice UIDs filter added to query', {
        userId: this.userContext.user_id,
        practiceUidCount: executionFilters.practiceUids.length,
        component: options.component,
      });
    } else if (options.failClosedSecurity) {
      // FAIL-CLOSED SECURITY: Empty array with fail-closed option = no data
      const impossibleFilter: ChartFilter = {
        field: 'practice_uid',
        operator: 'in',
        value: [-1], // Impossible practice_uid value
      };

      queryParams.advanced_filters.push(impossibleFilter);

      log.security('Fail-closed security triggered - empty practiceUids', 'high', {
        userId: this.userContext.user_id,
        result: 'no_data_returned',
        reason: 'empty_practice_uids_with_fail_closed',
        component: options.component,
      });
    }

    log.debug('Analytics query parameters built', {
      userId: this.userContext.user_id,
      dataSourceId: chartConfig.dataSourceId,
      hasAdvancedFilters: queryParams.advanced_filters && queryParams.advanced_filters.length > 0,
      advancedFilterCount: queryParams.advanced_filters?.length || 0,
      component: options.component,
    });

    return queryParams;
  }

  /**
   * Resolve organization filter to practice UIDs with RBAC validation
   *
   * Security-critical function that:
   * 1. Validates user has access to the organization
   * 2. Resolves organization to practice UIDs (with hierarchy)
   * 3. Logs security-relevant operations
   *
   * Security Rules:
   * - Super admins (analytics:read:all) can filter by any organization
   * - Org users (analytics:read:organization) can only filter by their accessible orgs
   * - Provider users (analytics:read:own) cannot use organization filter
   * - No analytics permission = cannot use org filter
   *
   * Consolidates duplicate implementations from:
   * - lib/services/dashboard-rendering/filter-service.ts
   * - lib/utils/organization-filter-resolver.ts
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

    // Step 3: Log successful resolution
    log.info('Organization filter resolved', {
      userId: this.userContext.user_id,
      organizationId,
      practiceUidCount: practiceUids.length,
      practiceUids,
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
   * Internal helper that enforces RBAC rules for organization filtering.
   * Consolidates duplicate validation logic from filter-service.ts and organization-filter-resolver.ts
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

    // Organization users can only filter by their accessible organizations (includes hierarchy)
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
          `Access denied: You do not have permission to filter by organization ${organizationId}. ` +
            'You can only filter by organizations in your hierarchy.'
        );
      }

      log.info('Organization filter access granted', {
        userId: this.userContext.user_id,
        organizationId,
        verified: true,
        component,
      });
    }

    // No analytics permission
    if (accessInfo.scope === 'none') {
      log.security(
        'User without analytics permission attempted organization filter - denied',
        'medium',
        {
          userId: this.userContext.user_id,
          organizationId,
          blocked: true,
          reason: 'no_analytics_permission',
          component,
        }
      );

      throw new Error('Access denied: You do not have analytics permissions to filter by organization.');
    }
  }

  /**
   * Merge universal filters with chart config filters
   *
   * Universal filters take precedence over chart-level config.
   * Used when building filters for charts within a dashboard.
   *
   * @param universalFilters - Dashboard-level filters
   * @param chartFilters - Chart-level filters from definition
   * @returns Merged universal filters
   */
  mergeFilters(
    universalFilters: UniversalChartFilters,
    chartFilters: Partial<UniversalChartFilters>
  ): UniversalChartFilters {
    return {
      // Chart-level filters first (can be overridden)
      ...chartFilters,
      // Universal filters override chart filters
      ...universalFilters,
      // Special handling for advancedFilters (merge arrays)
      advancedFilters: [
        ...(chartFilters.advancedFilters || []),
        ...(universalFilters.advancedFilters || []),
      ],
    };
  }

  /**
   * Convert ChartFilter array to query parameters
   *
   * Helper method for systems still using ChartFilter[] format.
   * Gradually migrate to UniversalChartFilters for type safety.
   *
   * @param filters - Array of chart filters
   * @param component - Component name for logging
   * @returns Universal filters object
   */
  fromChartFilterArray(
    filters: ChartFilter[],
    component: string
  ): UniversalChartFilters {
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

    log.debug('Converted ChartFilter array to UniversalChartFilters', {
      userId: this.userContext.user_id,
      inputFilterCount: filters.length,
      hasStartDate: Boolean(universalFilters.startDate),
      hasEndDate: Boolean(universalFilters.endDate),
      hasPracticeUids: Boolean(universalFilters.practiceUids),
      hasAdvancedFilters: Boolean(universalFilters.advancedFilters),
      component,
    });

    return universalFilters;
  }

  /**
   * Convert UniversalChartFilters to ChartFilter array
   *
   * Helper for systems that need ChartFilter[] format.
   * Used by dimension discovery and query validation.
   *
   * @param universalFilters - Universal chart filters
   * @returns Array of chart filters
   */
  toChartFilterArray(universalFilters: UniversalChartFilters): ChartFilter[] {
    const filters: ChartFilter[] = [];

    // Date range filters
    if (universalFilters.startDate) {
      filters.push({
        field: 'date',
        operator: 'gte',
        value: universalFilters.startDate,
      });
    }

    if (universalFilters.endDate) {
      filters.push({
        field: 'date',
        operator: 'lte',
        value: universalFilters.endDate,
      });
    }

    // Practice UIDs filter
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      filters.push({
        field: 'practice_uid',
        operator: 'in',
        value: universalFilters.practiceUids,
      });
    }

    // Measure filter
    if (universalFilters.measure) {
      filters.push({
        field: 'measure',
        operator: 'eq',
        value: universalFilters.measure,
      });
    }

    // Frequency filter
    if (universalFilters.frequency) {
      filters.push({
        field: 'frequency',
        operator: 'eq',
        value: universalFilters.frequency,
      });
    }

    // Advanced filters (pass through)
    if (universalFilters.advancedFilters) {
      filters.push(...universalFilters.advancedFilters);
    }

    return filters;
  }
}

/**
 * Create filter builder service instance
 *
 * Factory function to create service with user context.
 *
 * @param userContext - User context for RBAC
 * @returns Filter builder service instance
 */
export function createFilterBuilderService(userContext: UserContext): FilterBuilderService {
  return new FilterBuilderService(userContext);
}

