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
import { createOrganizationAccessService } from '@/lib/services/organization-access-service';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
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
   * Process:
   * - Validates organization access (RBAC)
   * - Resolves organizationId → practiceUids (with hierarchy)
   * - Returns validated + resolved filters
   *
   * @param universalFilters - Dashboard-level filters
   * @param dashboard - Dashboard definition (for logging)
   * @returns Resolved filters with practice_uids populated
   */
  async validateAndResolve(
    universalFilters: DashboardUniversalFilters,
    dashboard: DashboardWithCharts
  ): Promise<ResolvedFilters> {
    const filters: ResolvedFilters = {
      ...universalFilters,
      practiceUids: [],
    };

    // If organization filter provided, validate + resolve
    if (universalFilters.organizationId) {
      await this.validateOrganizationAccess(universalFilters.organizationId);

      filters.practiceUids = await this.resolveOrganizationPracticeUids(
        universalFilters.organizationId
      );

      log.info('Dashboard organization filter processed', {
        dashboardId: dashboard.dashboard_id,
        userId: this.userContext.user_id,
        organizationId: universalFilters.organizationId,
        practiceUidCount: filters.practiceUids.length,
        practiceUids: filters.practiceUids,
        component: 'dashboard-rendering',
      });
    }

    return filters;
  }

  /**
   * Validate user can access the selected organization
   *
   * Security Rules:
   * - Super admins (analytics:read:all) can filter by any organization
   * - Org users (analytics:read:organization) can only filter by their own organizations
   * - Provider users (analytics:read:own) cannot use organization filter
   * - No analytics permission = cannot use org filter
   *
   * @param organizationId - Organization ID from dashboard filter
   * @throws Error if user cannot access this organization
   */
  private async validateOrganizationAccess(organizationId: string): Promise<void> {
    const accessService = createOrganizationAccessService(this.userContext);
    const accessInfo = await accessService.getAccessiblePracticeUids();

    // Super admins can filter by any organization
    if (accessInfo.scope === 'all') {
      log.info('Super admin can filter by any organization', {
        userId: this.userContext.user_id,
        requestedOrganizationId: organizationId,
        permissionScope: 'all',
        component: 'dashboard-rendering',
      });
      return;
    }

    // Provider users cannot use organization filter
    if (accessInfo.scope === 'own') {
      log.security('Provider user attempted to use organization filter - denied', 'high', {
        userId: this.userContext.user_id,
        requestedOrganizationId: organizationId,
        blocked: true,
        reason: 'provider_cannot_filter_by_org',
        component: 'dashboard-rendering',
      });

      throw new Error(
        'Access denied: Provider-level users cannot filter by organization. You can only see your own provider data.'
      );
    }

    // Organization users can only filter by their own organizations
    if (accessInfo.scope === 'organization') {
      const canAccess = this.userContext.organizations.some(
        (org) => org.organization_id === organizationId
      );

      if (!canAccess) {
        log.security('Organization filter access denied', 'high', {
          userId: this.userContext.user_id,
          requestedOrganizationId: organizationId,
          userOrganizationIds: this.userContext.organizations.map((o) => o.organization_id),
          blocked: true,
          reason: 'user_not_member_of_org',
          component: 'dashboard-rendering',
        });

        throw new Error(
          `Access denied: You do not have permission to filter by organization ${organizationId}. You can only filter by organizations you belong to.`
        );
      }

      log.info('Organization filter access granted', {
        userId: this.userContext.user_id,
        requestedOrganizationId: organizationId,
        verified: true,
        component: 'dashboard-rendering',
      });
    }

    // No analytics permission
    if (accessInfo.scope === 'none') {
      log.security(
        'User without analytics permission attempted to use organization filter - denied',
        'medium',
        {
          userId: this.userContext.user_id,
          requestedOrganizationId: organizationId,
          blocked: true,
          reason: 'no_analytics_permission',
          component: 'dashboard-rendering',
        }
      );

      throw new Error('Access denied: You do not have analytics permissions.');
    }
  }

  /**
   * Resolve organizationId to practice_uids (with hierarchy)
   *
   * Converts selected organizationId to array of practice_uid values.
   * Includes practice_uids from child organizations (recursive).
   *
   * @param organizationId - Organization ID from dashboard filter
   * @returns Array of practice_uid values (with hierarchy)
   */
  private async resolveOrganizationPracticeUids(organizationId: string): Promise<number[]> {
    // Get all organizations in hierarchy (org + descendants)
    const allOrganizations = await organizationHierarchyService.getAllOrganizations();

    const hierarchyPracticeUids = await organizationHierarchyService.getHierarchyPracticeUids(
      organizationId,
      allOrganizations
    );

    log.info('Organization practice_uids resolved for dashboard filter', {
      userId: this.userContext.user_id,
      organizationId,
      practiceUidCount: hierarchyPracticeUids.length,
      practiceUids: hierarchyPracticeUids,
      includesHierarchy: hierarchyPracticeUids.length > 0,
      component: 'dashboard-rendering',
    });

    return hierarchyPracticeUids;
  }

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
