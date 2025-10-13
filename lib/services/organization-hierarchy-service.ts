/**
 * Organization Hierarchy Service
 *
 * Handles recursive organization tree traversal for hierarchical access control.
 * Implements parent-child organization relationships for analytics data security.
 *
 * Security Model:
 * - Parent organizations see data from all child organizations (recursive)
 * - Child organizations only see their own data (no parent access)
 * - Sibling organizations cannot see each other's data
 *
 * Use Cases:
 * - Healthcare System (parent) → North Clinic (child) + South Clinic (child)
 * - User in Healthcare System sees data from all three organizations
 * - User in North Clinic only sees North Clinic data
 * - User in South Clinic only sees South Clinic data
 *
 * Performance:
 * - Results cached in Redis (24-hour TTL)
 * - Organization tree changes infrequently
 * - Cache invalidated on organization create/update/delete
 */

import { eq } from 'drizzle-orm';
import { db, organizations } from '@/lib/db';
import { log } from '@/lib/logger';
import type { Organization } from '@/lib/types/rbac';
import { rbacCache } from '@/lib/cache';

/**
 * Maximum depth for organization hierarchy to prevent infinite loops
 * If depth exceeds this value, circular reference is assumed
 */
const MAX_ORGANIZATION_HIERARCHY_DEPTH = 10;

/**
 * Organization Hierarchy Service
 * Server-side only - used for security-critical operations
 */
export class OrganizationHierarchyService {
  /**
   * Get all organizations from database with Redis caching
   * 
   * This loads the complete organization tree for hierarchy traversal.
   * Results cached for 24 hours since organization structure changes infrequently.
   * 
   * Cache Strategy:
   * - Check Redis cache first (24-hour TTL)
   * - On cache miss: query database and cache result
   * - Invalidate cache on org create/update/delete
   *
   * @returns Array of all active organizations
   */
  async getAllOrganizations(): Promise<Organization[]> {
    const startTime = Date.now();

    try {
      // Check Redis cache first
      const cached = await rbacCache.getOrganizationHierarchy();
      if (cached) {
        const duration = Date.now() - startTime;
        log.debug('Organization hierarchy cache hit', {
          totalOrganizations: cached.length,
          duration,
          cacheHit: true,
        });
        return cached;
      }

      // Cache miss - query database
      log.debug('Organization hierarchy cache miss - querying database', {
        component: 'organization-hierarchy',
      });

      const orgs = await db
        .select({
          organization_id: organizations.organization_id,
          name: organizations.name,
          slug: organizations.slug,
          parent_organization_id: organizations.parent_organization_id,
          practice_uids: organizations.practice_uids,
          is_active: organizations.is_active,
          created_at: organizations.created_at,
          updated_at: organizations.updated_at,
          deleted_at: organizations.deleted_at,
        })
        .from(organizations)
        .where(eq(organizations.is_active, true));

      const transformedOrgs = orgs.map((org) => ({
        organization_id: org.organization_id,
        name: org.name,
        slug: org.slug,
        parent_organization_id: org.parent_organization_id || undefined,
        practice_uids: org.practice_uids || undefined,
        is_active: org.is_active ?? true,
        created_at: org.created_at ?? new Date(),
        updated_at: org.updated_at ?? new Date(),
        deleted_at: org.deleted_at || undefined,
      }));

      // Cache the results (fire-and-forget)
      rbacCache.setOrganizationHierarchy(transformedOrgs).catch((error) => {
        log.warn('Failed to cache organization hierarchy', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

      const duration = Date.now() - startTime;

      log.debug('Loaded all organizations for hierarchy from database', {
        totalOrganizations: transformedOrgs.length,
        duration,
        cacheHit: false,
      });

      return transformedOrgs;
    } catch (error) {
      log.error('Failed to load organizations for hierarchy', error);
      throw error;
    }
  }

  /**
   * Get all organizations in hierarchy (root org + all descendants)
   *
   * Performs recursive depth-first traversal to find all child organizations,
   * grandchildren, great-grandchildren, etc.
   *
   * @param organizationId - Root organization ID
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Array of organization IDs (root + all descendants)
   *
   * @example
   * // Healthcare System → [North Clinic, South Clinic → West Branch]
   * getOrganizationHierarchy('healthcare-system-id')
   * // Returns: ['healthcare-system-id', 'north-clinic-id', 'south-clinic-id', 'west-branch-id']
   */
  async getOrganizationHierarchy(
    organizationId: string,
    allOrganizations?: Organization[]
  ): Promise<string[]> {
    const startTime = Date.now();

    // Load all organizations if not provided
    const orgs = allOrganizations || (await this.getAllOrganizations());

    // Verify root organization exists
    const rootOrg = orgs.find((org) => org.organization_id === organizationId);
    if (!rootOrg) {
      log.warn('Organization not found for hierarchy traversal', { organizationId });
      return [];
    }

    const hierarchyIds = new Set<string>();

    // Add the root organization
    hierarchyIds.add(organizationId);

    // Recursive function to find all children
    const findChildren = (parentId: string) => {
      const children = orgs.filter(
        (org) =>
          org.parent_organization_id === parentId &&
          org.is_active &&
          !org.deleted_at
      );

      for (const child of children) {
        if (!hierarchyIds.has(child.organization_id)) {
          hierarchyIds.add(child.organization_id);
          // Recurse to find grandchildren, great-grandchildren, etc.
          findChildren(child.organization_id);
        }
      }
    };

    findChildren(organizationId);

    const hierarchyArray = Array.from(hierarchyIds);
    const duration = Date.now() - startTime;

    log.info('Organization hierarchy resolved', {
      rootOrganizationId: organizationId,
      rootOrganizationName: rootOrg.name,
      totalOrganizations: hierarchyArray.length,
      includesChildren: hierarchyArray.length > 1,
      duration,
    });

    return hierarchyArray;
  }

  /**
   * Get all practice_uid values from organization hierarchy
   *
   * Collects practice_uids from the root organization and ALL descendant organizations.
   * This is used for analytics data filtering - parent org users see child org data.
   *
   * @param organizationId - Root organization ID
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Array of unique practice_uid values from org + descendants
   *
   * @example
   * // Healthcare System (practice_uids: [100]) → North Clinic (practice_uids: [101, 102])
   * getHierarchyPracticeUids('healthcare-system-id')
   * // Returns: [100, 101, 102]
   */
  async getHierarchyPracticeUids(
    organizationId: string,
    allOrganizations?: Organization[]
  ): Promise<number[]> {
    const startTime = Date.now();

    // Get all organizations in hierarchy
    const hierarchyIds = await this.getOrganizationHierarchy(organizationId, allOrganizations);

    if (hierarchyIds.length === 0) {
      return [];
    }

    // Load organizations if not provided
    const orgs = allOrganizations || (await this.getAllOrganizations());

    // Collect practice_uids from all organizations in hierarchy
    const practiceUids = new Set<number>();

    for (const orgId of hierarchyIds) {
      const org = orgs.find((o) => o.organization_id === orgId);
      if (org?.practice_uids) {
        for (const uid of org.practice_uids) {
          practiceUids.add(uid);
        }
      }
    }

    const practiceUidsArray = Array.from(practiceUids).sort((a, b) => a - b);
    const duration = Date.now() - startTime;

    log.info('Hierarchy practice_uids collected', {
      organizationId,
      hierarchySize: hierarchyIds.length,
      practiceUidCount: practiceUidsArray.length,
      practiceUids: practiceUidsArray,
      duration,
    });

    return practiceUidsArray;
  }

  /**
   * Check if one organization is an ancestor of another
   *
   * Determines if potentialAncestorId is a parent, grandparent, great-grandparent, etc.
   * of descendantId.
   *
   * @param potentialAncestorId - Organization ID to check as ancestor
   * @param descendantId - Organization ID to check as descendant
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns True if potentialAncestor is an ancestor of descendant
   *
   * @example
   * // Healthcare System → North Clinic → West Branch
   * isAncestor('healthcare-system-id', 'west-branch-id')
   * // Returns: true (Healthcare System is ancestor of West Branch)
   *
   * isAncestor('north-clinic-id', 'healthcare-system-id')
   * // Returns: false (North Clinic is NOT ancestor of Healthcare System)
   */
  async isAncestor(
    potentialAncestorId: string,
    descendantId: string,
    allOrganizations?: Organization[]
  ): Promise<boolean> {
    // Get hierarchy of potential ancestor
    const ancestorHierarchy = await this.getOrganizationHierarchy(
      potentialAncestorId,
      allOrganizations
    );

    // If descendant is in ancestor's hierarchy, then ancestor is parent/grandparent/etc.
    return ancestorHierarchy.includes(descendantId);
  }

  /**
   * Get parent organization
   *
   * @param organizationId - Child organization ID
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Parent organization or null if no parent
   */
  async getParent(
    organizationId: string,
    allOrganizations?: Organization[]
  ): Promise<Organization | null> {
    const orgs = allOrganizations || (await this.getAllOrganizations());

    const org = orgs.find((o) => o.organization_id === organizationId);
    if (!org || !org.parent_organization_id) {
      return null;
    }

    const parent = orgs.find((o) => o.organization_id === org.parent_organization_id);
    return parent || null;
  }

  /**
   * Get immediate children of an organization
   *
   * @param organizationId - Parent organization ID
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Array of direct child organizations (not grandchildren)
   */
  async getChildren(
    organizationId: string,
    allOrganizations?: Organization[]
  ): Promise<Organization[]> {
    const orgs = allOrganizations || (await this.getAllOrganizations());

    return orgs.filter(
      (org) =>
        org.parent_organization_id === organizationId &&
        org.is_active &&
        !org.deleted_at
    );
  }

  /**
   * Get depth of organization in hierarchy
   * Root organizations have depth 0
   *
   * @param organizationId - Organization ID
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Depth (0 = root, 1 = child, 2 = grandchild, etc.)
   */
  async getDepth(
    organizationId: string,
    allOrganizations?: Organization[]
  ): Promise<number> {
    const orgs = allOrganizations || (await this.getAllOrganizations());

    let depth = 0;
    let currentOrg = orgs.find((o) => o.organization_id === organizationId);

    while (currentOrg?.parent_organization_id) {
      depth++;
      currentOrg = orgs.find((o) => o.organization_id === currentOrg?.parent_organization_id);

      // Prevent infinite loops in case of circular references (data integrity issue)
      if (depth > MAX_ORGANIZATION_HIERARCHY_DEPTH) {
        log.error('Circular reference detected in organization hierarchy', {
          organizationId,
          depth,
          maxDepth: MAX_ORGANIZATION_HIERARCHY_DEPTH,
        });
        break;
      }
    }

    return depth;
  }

  /**
   * Get all root organizations (organizations with no parent)
   *
   * @param allOrganizations - Optional: Full list of organizations (avoids DB query if provided)
   * @returns Array of root organizations
   */
  async getRootOrganizations(allOrganizations?: Organization[]): Promise<Organization[]> {
    const orgs = allOrganizations || (await this.getAllOrganizations());

    return orgs.filter(
      (org) => !org.parent_organization_id && org.is_active && !org.deleted_at
    );
  }
}

// Export singleton instance
export const organizationHierarchyService = new OrganizationHierarchyService();

