/**
 * Organization Access Service
 *
 * Resolves which practice_uid and provider_uid values a user can access based on:
 * 1. User's permissions (analytics:read:all / analytics:read:organization / analytics:read:own)
 * 2. User's organization memberships
 * 3. Each organization's practice_uids array
 * 4. Organization hierarchy (parent orgs see child org data)
 * 5. User's provider_uid (for analytics:read:own)
 *
 * Security Model - Three Permission Levels:
 *
 * 1. analytics:read:all (Super Admin)
 *    - See ALL data, no filtering
 *    - Returns empty arrays (means "no filtering needed")
 *
 * 2. analytics:read:organization (Organization User)
 *    - Filter by organization's practice_uids (+ hierarchy)
 *    - Returns array of practice_uid values
 *    - Empty practice_uids = FAIL-CLOSED (no data)
 *
 * 3. analytics:read:own (Provider User)
 *    - Filter by user's provider_uid only
 *    - Returns user's provider_uid
 *    - No provider_uid = FAIL-CLOSED (no data)
 *
 * Fail-Closed Security:
 * - Empty filters = no data (not all data)
 * - Missing configuration = no data (not all data)
 * - Invalid permission = no data (not all data)
 */

import { log } from '@/lib/logger';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import type { UserContext } from '@/lib/types/rbac';
import { organizationHierarchyService } from './organization-hierarchy-service';

/**
 * Practice UID access result
 *
 * Contains all practice_uid values a user can access based on their permissions.
 * Used for organization-level analytics data filtering.
 *
 * @example
 * // Super Admin
 * { practiceUids: [], scope: 'all' }  // Empty = no filtering
 *
 * // Organization User
 * { practiceUids: [100, 101, 102], scope: 'organization', includesHierarchy: true }
 *
 * // Provider User or No Permission
 * { practiceUids: [], scope: 'own' | 'none' }  // Fail-closed
 */
export interface PracticeAccessResult {
  /** Array of practice_uid values user can access (empty for super admin or provider user) */
  practiceUids: number[];

  /** Permission scope that determined access level */
  scope: 'all' | 'organization' | 'own' | 'none';

  /** Organization IDs providing access (including child organizations from hierarchy) */
  organizationIds: string[];

  /** True if parent organization includes child organization data */
  includesHierarchy: boolean;
}

/**
 * Provider UID access result
 *
 * Contains user's provider_uid for provider-level analytics data filtering.
 * Used for analytics:read:own permission.
 *
 * @example
 * // Provider User
 * { providerUid: 42, scope: 'own' }
 *
 * // Super Admin or Organization User
 * { providerUid: null, scope: 'all' | 'organization' }
 *
 * // No provider_uid configured
 * { providerUid: null, scope: 'own' }  // Fail-closed
 */
export interface ProviderAccessResult {
  /** User's provider_uid (null if not applicable or fail-closed) */
  providerUid: number | null;

  /** Permission scope that determined access level */
  scope: 'all' | 'organization' | 'own' | 'none';
}

/**
 * Organization Access Service
 * Server-side only - used for security-critical operations
 */
export class OrganizationAccessService {
  private checker: PermissionChecker;

  constructor(private userContext: UserContext) {
    this.checker = new PermissionChecker(userContext);
  }

  /**
   * Get all practice_uid values the user can access
   *
   * Returns practice_uids based on user's highest permission level:
   * - analytics:read:all → Empty array (no filtering - super admin)
   * - analytics:read:organization → practice_uids from user's orgs (+ hierarchy)
   * - analytics:read:own → Empty array (use provider_uid filtering instead)
   * - No permission → Empty array (fail-closed)
   *
   * @returns Practice access result with scope and metadata
   */
  async getAccessiblePracticeUids(): Promise<PracticeAccessResult> {
    const startTime = Date.now();

    // Priority 1: Check for super admin permission (no filtering needed)
    if (this.checker.hasPermission('analytics:read:all')) {
      log.info('User has analytics:read:all - no practice_uid filtering', {
        userId: this.userContext.user_id,
        permissionScope: 'all',
      });

      return {
        practiceUids: [], // Empty = no filtering (see all practice_uid values)
        scope: 'all',
        organizationIds: [],
        includesHierarchy: false,
      };
    }

    // Priority 2: Check for organization-level permission
    const hasOrgPermission = this.checker.hasPermission('analytics:read:organization');

    log.debug('Checking organization-level permission', {
      userId: this.userContext.user_id,
      hasOrgPermission,
      allPermissions: this.userContext.all_permissions.map((p) => p.name),
      rolesCount: this.userContext.roles.length,
      rolesActive: this.userContext.roles.filter((r) => r.is_active).length,
    });

    if (hasOrgPermission) {
      const practiceUids = new Set<number>();
      const organizationIds: string[] = [];
      let includesHierarchy = false;

      // Get all organizations (needed for hierarchy traversal)
      const allOrganizations = await organizationHierarchyService.getAllOrganizations();

      // Process each of user's organizations
      for (const org of this.userContext.organizations) {
        if (!org.is_active || org.deleted_at) continue;

        // Get organization + all descendants in hierarchy
        const hierarchyIds = await organizationHierarchyService.getOrganizationHierarchy(
          org.organization_id,
          allOrganizations
        );

        // Track if we're including child organizations
        if (hierarchyIds.length > 1) {
          includesHierarchy = true;
        }

        organizationIds.push(...hierarchyIds);

        // Collect practice_uids from all organizations in hierarchy
        const hierarchyPracticeUids = await organizationHierarchyService.getHierarchyPracticeUids(
          org.organization_id,
          allOrganizations
        );

        for (const uid of hierarchyPracticeUids) {
          practiceUids.add(uid);
        }
      }

      const practiceUidsArray = Array.from(practiceUids).sort((a, b) => a - b);
      const duration = Date.now() - startTime;

      log.info('User has analytics:read:organization - filtering by practice_uids with hierarchy', {
        userId: this.userContext.user_id,
        email: this.userContext.email,
        permissionScope: 'organization',
        rootOrganizationCount: this.userContext.organizations.length,
        totalOrganizationCount: new Set(organizationIds).size,
        practiceUidCount: practiceUidsArray.length,
        practiceUids: practiceUidsArray,
        includesHierarchy,
        duration,
      });

      // FAIL-CLOSED SECURITY: If no practice_uids found, return empty array (no data)
      if (practiceUidsArray.length === 0) {
        log.warn(
          'User has analytics:read:organization but no practice_uids found - returning empty results',
          {
            userId: this.userContext.user_id,
            email: this.userContext.email,
            organizationCount: this.userContext.organizations.length,
            organizationIds: this.userContext.organizations.map((o) => o.organization_id),
            failedClosed: true,
          }
        );
      }

      return {
        practiceUids: practiceUidsArray,
        scope: 'organization',
        organizationIds: Array.from(new Set(organizationIds)),
        includesHierarchy,
      };
    }

    // Priority 3: Check for provider-level permission (analytics:read:own)
    // Note: Provider filtering uses provider_uid, not practice_uid
    // Return empty practice_uids here; provider filtering handled separately
    if (this.checker.hasPermission('analytics:read:own')) {
      log.info('User has analytics:read:own - using provider_uid filtering (not practice_uid)', {
        userId: this.userContext.user_id,
        email: this.userContext.email,
        permissionScope: 'own',
        providerUid: this.userContext.provider_uid,
      });

      return {
        practiceUids: [], // No practice_uid filtering for provider-level access
        scope: 'own',
        organizationIds: [],
        includesHierarchy: false,
      };
    }

    // Priority 4: No analytics permission - FAIL CLOSED
    log.security('User has no analytics permissions - access denied', 'medium', {
      userId: this.userContext.user_id,
      email: this.userContext.email,
      userPermissions: this.userContext.all_permissions.map((p) => p.name),
      blocked: true,
      reason: 'no_analytics_permission',
    });

    return {
      practiceUids: [],
      scope: 'none',
      organizationIds: [],
      includesHierarchy: false,
    };
  }

  /**
   * Get user's provider_uid for provider-level filtering (analytics:read:own)
   *
   * Returns provider_uid based on user's permission:
   * - analytics:read:all → null (no provider_uid filtering)
   * - analytics:read:organization → null (uses practice_uid filtering)
   * - analytics:read:own → user's provider_uid
   * - No permission → null (fail-closed)
   *
   * @returns Provider access result with scope
   */
  async getAccessibleProviderUid(): Promise<ProviderAccessResult> {
    // Super admins and org users don't use provider_uid filtering
    if (
      this.checker.hasPermission('analytics:read:all') ||
      this.checker.hasPermission('analytics:read:organization')
    ) {
      return {
        providerUid: null, // No provider filtering
        scope: this.checker.hasPermission('analytics:read:all') ? 'all' : 'organization',
      };
    }

    // Provider-level access: return user's provider_uid
    if (this.checker.hasPermission('analytics:read:own')) {
      const providerUid = this.userContext.provider_uid;

      // FAIL-CLOSED SECURITY: If no provider_uid, return null (no data)
      if (!providerUid) {
        log.warn('User has analytics:read:own but no provider_uid - returning empty results', {
          userId: this.userContext.user_id,
          email: this.userContext.email,
          failedClosed: true,
        });
      }

      log.info('User has analytics:read:own - filtering by provider_uid', {
        userId: this.userContext.user_id,
        email: this.userContext.email,
        providerUid,
        permissionScope: 'own',
      });

      return {
        providerUid: providerUid || null,
        scope: 'own',
      };
    }

    // No permission
    return {
      providerUid: null,
      scope: 'none',
    };
  }

  /**
   * Validate if user can access a specific practice_uid
   *
   * @param practiceUid - practice_uid to validate
   * @returns True if user can access this practice_uid
   */
  async canAccessPracticeUid(practiceUid: number): Promise<boolean> {
    const accessInfo = await this.getAccessiblePracticeUids();

    // Super admins can access any practice_uid
    if (accessInfo.scope === 'all') {
      return true;
    }

    // Organization users can only access practice_uids in their orgs (+ hierarchy)
    if (accessInfo.scope === 'organization') {
      return accessInfo.practiceUids.includes(practiceUid);
    }

    // Provider users don't use practice_uid filtering
    if (accessInfo.scope === 'own') {
      return false; // Use provider_uid filtering instead
    }

    return false;
  }

  /**
   * Validate if user can access a specific provider_uid
   *
   * @param providerUid - provider_uid to validate
   * @returns True if user can access this provider_uid
   */
  async canAccessProviderUid(providerUid: number): Promise<boolean> {
    const accessInfo = await this.getAccessibleProviderUid();

    // Super admins can access any provider_uid
    if (accessInfo.scope === 'all') {
      return true;
    }

    // Organization users see all providers in their practice_uids
    if (accessInfo.scope === 'organization') {
      return true; // Provider filtering doesn't apply to org-level access
    }

    // Provider users can only access their own provider_uid
    if (accessInfo.scope === 'own') {
      return accessInfo.providerUid === providerUid;
    }

    return false;
  }

  /**
   * Check if user can access a specific organization
   * Used for dashboard organization filter validation
   *
   * @param organizationId - Organization ID to check
   * @returns True if user has access to this organization
   */
  async canAccessOrganization(organizationId: string): Promise<boolean> {
    // Super admins can access any organization
    if (this.checker.hasPermission('analytics:read:all')) {
      return true;
    }

    // Organization users can only access their own organizations
    if (this.checker.hasPermission('analytics:read:organization')) {
      return this.userContext.organizations.some((org) => org.organization_id === organizationId);
    }

    // Provider users cannot use organization filter
    return false;
  }
}

/**
 * Factory function to create an OrganizationAccessService instance
 *
 * @param userContext - User context with RBAC information
 * @returns OrganizationAccessService instance
 */
export function createOrganizationAccessService(
  userContext: UserContext
): OrganizationAccessService {
  return new OrganizationAccessService(userContext);
}
