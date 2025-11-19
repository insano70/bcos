/**
 * Organization Filter Resolver
 *
 * Utility for resolving organization filters to practice UIDs with proper
 * RBAC validation and security logging.
 *
 * Single Responsibility: Validate and resolve organization filters
 *
 * Used by:
 * - Dashboard rendering system (via FilterService)
 * - Dimension expansion system
 * - Any system that needs to resolve org filters with RBAC
 */

import { log } from '@/lib/logger';
import { createOrganizationAccessService } from '@/lib/services/organization-access-service';
import { organizationHierarchyService } from '@/lib/services/organization-hierarchy-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Resolved organization filter result
 */
export interface ResolvedOrganizationFilter {
  /** Resolved practice UIDs (includes hierarchy) */
  practiceUids: number[];
  /** Original organization ID that was resolved */
  organizationId: string;
}

/**
 * Validate and resolve organization filter
 *
 * Security-critical function that:
 * 1. Validates user has access to the organization (RBAC)
 * 2. Resolves organization to practice UIDs (with hierarchy)
 * 3. Logs security-relevant operations
 *
 * Security Rules:
 * - Super admins (analytics:read:all) can filter by any organization
 * - Org users (analytics:read:organization) can only filter by their accessible organizations
 * - Provider users (analytics:read:own) cannot use organization filter
 * - No analytics permission = cannot use org filter
 *
 * @param organizationId - Organization ID from filter
 * @param userContext - User context for RBAC validation
 * @param component - Component name for logging (e.g., 'dashboard-rendering', 'dimension-expansion')
 * @returns Resolved practice UIDs with hierarchy
 * @throws Error if user cannot access the organization
 *
 * @example
 * ```typescript
 * const resolved = await resolveOrganizationFilter(
 *   'org-123',
 *   userContext,
 *   'dimension-expansion'
 * );
 * // Returns: { practiceUids: [100, 101, 102], organizationId: 'org-123' }
 * ```
 */
export async function resolveOrganizationFilter(
  organizationId: string,
  userContext: UserContext,
  component: string
): Promise<ResolvedOrganizationFilter> {
  // Step 1: Validate organization access (RBAC)
  await validateOrganizationAccess(organizationId, userContext, component);

  // Step 2: Resolve organization to practice UIDs (with hierarchy)
  const allOrganizations = await organizationHierarchyService.getAllOrganizations();
  const practiceUids = await organizationHierarchyService.getHierarchyPracticeUids(
    organizationId,
    allOrganizations
  );

  // Step 3: Log successful resolution
  log.info('Organization filter resolved', {
    userId: userContext.user_id,
    organizationId,
    practiceUidCount: practiceUids.length,
    practiceUids,
    includesHierarchy: practiceUids.length > 0,
    component,
  });

  return {
    practiceUids,
    organizationId,
  };
}

/**
 * Validate user has access to the organization
 *
 * Internal helper that enforces RBAC rules for organization filtering.
 *
 * @param organizationId - Organization ID to validate
 * @param userContext - User context for RBAC
 * @param component - Component name for security logging
 * @throws Error if user cannot access the organization
 */
async function validateOrganizationAccess(
  organizationId: string,
  userContext: UserContext,
  component: string
): Promise<void> {
  const accessService = createOrganizationAccessService(userContext);
  const accessInfo = await accessService.getAccessiblePracticeUids();

  // Super admins can filter by any organization
  if (accessInfo.scope === 'all') {
    log.info('Super admin accessing organization filter', {
      userId: userContext.user_id,
      organizationId,
      permissionScope: 'all',
      component,
    });
    return;
  }

  // Provider users cannot use organization filter
  if (accessInfo.scope === 'own') {
    log.security('Provider user attempted organization filter - denied', 'high', {
      userId: userContext.user_id,
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
    const canAccess = userContext.accessible_organizations.some(
      (org) => org.organization_id === organizationId
    );

    if (!canAccess) {
      log.security('Organization filter access denied', 'high', {
        userId: userContext.user_id,
        requestedOrganizationId: organizationId,
        accessibleOrganizationIds: userContext.accessible_organizations.map(
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
      userId: userContext.user_id,
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
        userId: userContext.user_id,
        organizationId,
        blocked: true,
        reason: 'no_analytics_permission',
        component,
      }
    );

    throw new Error(
      'Access denied: You do not have analytics permissions to filter by organization.'
    );
  }
}

