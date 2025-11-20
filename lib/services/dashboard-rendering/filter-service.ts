/**
 * Filter Service
 *
 * Responsible for validating and resolving dashboard filters.
 *
 * Single Responsibility:
 * - Validate organization filter access (RBAC)
 * - Resolve organization → practice_uids (with hierarchy)
 * - Merge universal + chart-level filters
 */

import { log } from '@/lib/logger';
import { createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import { BaseDashboardRenderingService } from './base-service';
import type { DashboardUniversalFilters, DashboardWithCharts, ResolvedFilters } from './types';

/**
 * Filter Service
 *
 * Handles validation, resolution, and merging of dashboard filters.
 */
export class FilterService extends BaseDashboardRenderingService {
  /**
   * Validate and resolve universal filters
   *
   * Delegates to FilterBuilderService for organization validation and resolution.
   *
   * @param universalFilters - Dashboard-level filters
   * @param dashboard - Dashboard definition (for logging)
   * @returns Resolved filters with practice_uids populated
   */
  async validateAndResolve(
    universalFilters: DashboardUniversalFilters,
    dashboard: DashboardWithCharts
  ): Promise<ResolvedFilters> {
    const filterBuilder = createFilterBuilderService(this.userContext);

    // If organization filter provided, use FilterBuilderService to validate + resolve
    if (universalFilters.organizationId) {
      const executionFilters = await filterBuilder.buildExecutionFilters(
        universalFilters,
        { component: 'dashboard-rendering' }
      );

      log.info('Dashboard organization filter processed', {
        dashboardId: dashboard.dashboard_id,
        userId: this.userContext.user_id,
        organizationId: universalFilters.organizationId,
        practiceUidCount: executionFilters.practiceUids.length,
        practiceUids: executionFilters.practiceUids,
        component: 'dashboard-rendering',
      });

      return {
        ...universalFilters,
        practiceUids: executionFilters.practiceUids,
      };
    }

    // No organization filter - return with empty practiceUids
    return {
      ...universalFilters,
      practiceUids: [],
    };
  }

  // Organization validation and resolution now delegated to FilterBuilderService
  // See: lib/services/filters/filter-builder-service.ts
  // - resolveOrganizationFilter() handles validation + resolution
  // - Consolidates duplicate logic from filter-service.ts and organization-filter-resolver.ts

  /**
   * Merge universal filters with chart-level config
   *
   * Universal filters take precedence over chart filters.
   *
   * @param chartConfig - Chart configuration from definition
   * @param universalFilters - Dashboard-level filters
   * @returns Merged configuration
   */
  mergeWithChartConfig(
    chartConfig: Record<string, unknown>,
    universalFilters: ResolvedFilters
  ): Record<string, unknown> {
    const merged = { ...chartConfig };

    // Dashboard filters override chart filters
    if (universalFilters.startDate !== undefined) {
      merged.startDate = universalFilters.startDate;
    }

    if (universalFilters.endDate !== undefined) {
      merged.endDate = universalFilters.endDate;
    }

    if (universalFilters.dateRangePreset !== undefined) {
      merged.dateRangePreset = universalFilters.dateRangePreset;
    }

    if (universalFilters.organizationId !== undefined) {
      merged.organizationId = universalFilters.organizationId;
    }

    // SECURITY-CRITICAL: Only pass through practice_uids if they have values
    // Empty arrays should NOT be passed (no filter = query all accessible practices)
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      merged.practiceUids = universalFilters.practiceUids;
    }

    if (universalFilters.providerName !== undefined) {
      merged.providerName = universalFilters.providerName;
    }

    return merged;
  }

  /**
   * Get names of applied filters for logging
   *
   * @param filters - Dashboard universal filters
   * @returns Array of filter names that are applied
   */
  getAppliedFilterNames(filters: DashboardUniversalFilters): string[] {
    const applied: string[] = [];

    if (filters.startDate || filters.endDate || filters.dateRangePreset) {
      applied.push('dateRange');
    }
    if (filters.organizationId) {
      applied.push('organization');
    }
    if (filters.practiceUids && filters.practiceUids.length > 0) {
      applied.push('practice');
    }
    if (filters.providerName) {
      applied.push('provider');
    }

    return applied;
  }
}
