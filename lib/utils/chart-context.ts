/**
 * Chart Context Builder
 * 
 * Creates consistent, secure ChartRenderContext from UserContext for all analytics entry points.
 * 
 * SECURITY: USE THIS IN ALL API ENDPOINTS AND CHART HANDLERS
 * - Populates accessible_practices from organization access
 * - Populates accessible_providers from provider access
 * - Derives permission_scope from RBAC permissions
 * - Ensures consistent security posture across all entry points
 */

import type { UserContext } from '@/lib/types/rbac';
import type { ChartRenderContext } from '@/lib/types/analytics';
import { log } from '@/lib/logger';

/**
 * Build ChartRenderContext from UserContext with proper RBAC
 * 
 * SECURITY CRITICAL:
 * - Populates accessible_practices from accessible_organizations.practice_uids
 * - Derives permission_scope from actual analytics permissions
 * - Fail-closed: empty accessible_practices for non-admin users with no orgs
 * 
 * @param userContext - User context with RBAC permissions
 * @returns ChartRenderContext with populated RBAC fields
 * 
 * @example
 * ```typescript
 * const chartContext = await buildChartRenderContext(userContext);
 * const data = await dataSourceCache.fetchDataSource(params, userContext);
 * ```
 */
export async function buildChartRenderContext(
  userContext: UserContext
): Promise<ChartRenderContext> {
  const startTime = Date.now();
  
  // Determine permission scope based on analytics permissions
  const permissionScope = derivePermissionScope(userContext);
  
  // Collect practice_uids from accessible_organizations
  const accessiblePractices = collectAccessiblePractices(userContext, permissionScope);
  
  // Get provider_uid filtering for analytics:read:own scope
  const accessibleProviders = collectAccessibleProviders(userContext, permissionScope);
  
  // Extract organization IDs
  const organizationIds = userContext.accessible_organizations?.map(org => org.organization_id) || [];
  
  // Determine if hierarchy is included
  const includesHierarchy = 
    userContext.accessible_organizations?.length !== userContext.organizations?.length;
  
  const duration = Date.now() - startTime;
  
  log.debug('Chart context built', {
    userId: userContext.user_id,
    permissionScope,
    practiceCount: accessiblePractices.length,
    providerCount: accessibleProviders.length,
    organizationCount: organizationIds.length,
    includesHierarchy,
    duration,
  });
  
  return {
    user_id: userContext.user_id,
    
    // SECURITY: Practice-level filtering based on organizations
    accessible_practices: accessiblePractices,
    
    // SECURITY: Provider-level filtering for analytics:read:own
    accessible_providers: accessibleProviders,
    
    roles: userContext.roles?.map((role) => role.name) || [],
    
    // Metadata for logging and security audit
    permission_scope: permissionScope,
    organization_ids: organizationIds,
    includes_hierarchy: includesHierarchy,
    provider_uid: userContext.provider_uid || null,
  };
}

/**
 * Derive permission scope from analytics permissions
 * 
 * Checks user's actual analytics permissions to determine scope:
 * - 'all': analytics:read:all or super_admin
 * - 'organization': analytics:read:organization
 * - 'own': analytics:read:own
 * - 'none': no analytics permissions
 * 
 * @param userContext - User context with permissions
 * @returns Permission scope
 */
function derivePermissionScope(userContext: UserContext): 'all' | 'organization' | 'own' | 'none' {
  // Super admin gets 'all' scope
  if (userContext.is_super_admin) {
    return 'all';
  }
  
  // Check for analytics permissions
  const hasAnalyticsReadAll = userContext.all_permissions?.some(
    (p) => p.name === 'analytics:read:all'
  );
  
  if (hasAnalyticsReadAll) {
    return 'all';
  }
  
  const hasAnalyticsReadOrganization = userContext.all_permissions?.some(
    (p) => p.name === 'analytics:read:organization'
  );
  
  if (hasAnalyticsReadOrganization) {
    return 'organization';
  }
  
  const hasAnalyticsReadOwn = userContext.all_permissions?.some(
    (p) => p.name === 'analytics:read:own'
  );
  
  if (hasAnalyticsReadOwn) {
    return 'own';
  }
  
  return 'none';
}

/**
 * Collect accessible practice UIDs from organizations
 * 
 * SECURITY: Fail-closed approach
 * - 'all' scope: returns empty array (no filtering - see all practices)
 * - 'organization' scope: returns practice_uids from accessible_organizations
 * - 'own' scope: returns practice_uids from accessible_organizations
 * - 'none' scope: returns empty array (fail-closed - see no data)
 * 
 * @param userContext - User context with organizations
 * @param permissionScope - Derived permission scope
 * @returns Array of practice_uid values
 */
function collectAccessiblePractices(
  userContext: UserContext,
  permissionScope: 'all' | 'organization' | 'own' | 'none'
): number[] {
  // 'all' scope: empty array means NO FILTERING (see all practices)
  if (permissionScope === 'all') {
    return [];
  }
  
  // 'none' scope: empty array means FAIL CLOSED (see no data)
  if (permissionScope === 'none') {
    return [];
  }
  
  // For 'organization' and 'own' scopes: collect practice_uids from accessible_organizations
  const practiceUids = new Set<number>();
  
  if (userContext.accessible_organizations) {
    for (const org of userContext.accessible_organizations) {
      if (org.practice_uids && Array.isArray(org.practice_uids)) {
        for (const practiceUid of org.practice_uids) {
          if (typeof practiceUid === 'number') {
            practiceUids.add(practiceUid);
          }
        }
      }
    }
  }
  
  return Array.from(practiceUids).sort((a, b) => a - b);
}

/**
 * Collect accessible provider UIDs
 * 
 * SECURITY: Provider-level filtering for analytics:read:own
 * - 'own' scope: returns [provider_uid] if set
 * - Other scopes: returns empty array (no provider-level filtering)
 * 
 * @param userContext - User context with provider_uid
 * @param permissionScope - Derived permission scope
 * @returns Array of provider_uid values
 */
function collectAccessibleProviders(
  userContext: UserContext,
  permissionScope: 'all' | 'organization' | 'own' | 'none'
): number[] {
  // Provider filtering only applies to 'own' scope
  if (permissionScope !== 'own') {
    return [];
  }
  
  // For 'own' scope, return provider_uid if set
  if (userContext.provider_uid != null) {
    return [userContext.provider_uid];
  }
  
  // FAIL CLOSED: User with 'own' scope but no provider_uid sees no data
  return [];
}

// Re-export types for convenience
export type { UserContext } from '@/lib/types/rbac';
export type { ChartRenderContext } from '@/lib/types/analytics';

