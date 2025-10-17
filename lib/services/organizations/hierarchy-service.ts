import { AuthorizationError } from '@/lib/api/responses/error';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import {
  getOrganizationChildren,
  getOrganizationHierarchy,
} from '@/lib/rbac/organization-hierarchy';
import type { Organization, UserContext } from '@/lib/types/rbac';
import { BaseOrganizationsService } from './base-service';
import { MAX_CHILDREN_PER_LEVEL } from './sanitization';
import type { OrganizationHierarchyServiceInterface } from './types';

/**
 * Organization Hierarchy Service
 *
 * Handles all organization tree operations:
 * - Hierarchy retrieval (tree structures)
 * - Ancestor/descendant traversal
 * - Circular reference validation
 *
 * Extracted from monolithic organizations service to separate hierarchy
 * concerns from CRUD operations.
 *
 * Now extends BaseOrganizationsService to eliminate duplicated permission
 * checking logic (30 lines removed).
 *
 * @internal - Use factory function instead
 */
class OrganizationHierarchyService
  extends BaseOrganizationsService
  implements OrganizationHierarchyServiceInterface
{
  // All permission properties inherited from BaseOrganizationsService
  // canReadAll, canReadOrganization, canReadOwn, accessibleOrgIds
  // canAccessOrganization(), getRBACScope() are also inherited

  /**
   * Get organization hierarchy for current user
   *
   * Uses external hierarchy helper to build tree structure.
   * Returns all accessible organizations in hierarchy.
   *
   * @param rootOrganizationId - Optional root to start from
   * @returns Array of organizations in hierarchy
   * @throws {AuthorizationError} If user lacks permission or access
   */
  async getAccessibleHierarchy(rootOrganizationId?: string): Promise<Organization[]> {
    const startTime = Date.now();

    try {
      // Check permissions
      if (!this.canReadAll && !this.canReadOrganization && !this.canReadOwn) {
        throw AuthorizationError('You do not have permission to read organization hierarchy');
      }

      if (rootOrganizationId) {
        // Check access to root
        if (!this.canAccessOrganization(rootOrganizationId)) {
          throw AuthorizationError('Access denied to root organization');
        }
        const hierarchy = await getOrganizationHierarchy(rootOrganizationId);

        const duration = Date.now() - startTime;
        log.info('organization hierarchy retrieved', {
          operation: 'get_organization_hierarchy',
          rootOrganizationId,
          userId: this.userContext.user_id,
          hierarchySize: hierarchy.length,
          duration,
          slow: duration > SLOW_THRESHOLDS.DB_QUERY,
          rbacScope: this.getRBACScope(),
          component: 'hierarchy_service',
        });

        return hierarchy;
      }

      // Get hierarchy for all accessible organizations
      const accessibleOrgs = this.userContext.accessible_organizations || [];
      const hierarchies = new Map<string, Organization>();

      for (const org of accessibleOrgs) {
        const hierarchy = await getOrganizationHierarchy(org.organization_id);
        for (const hierarchyOrg of hierarchy) {
          hierarchies.set(hierarchyOrg.organization_id, hierarchyOrg);
        }
      }

      const result = Array.from(hierarchies.values());
      const duration = Date.now() - startTime;

      log.info('accessible hierarchies retrieved', {
        operation: 'get_accessible_hierarchy',
        userId: this.userContext.user_id,
        accessibleOrgCount: accessibleOrgs.length,
        totalHierarchySize: result.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        rbacScope: this.getRBACScope(),
        component: 'hierarchy_service',
      });

      return result;
    } catch (error) {
      log.error('get accessible hierarchy failed', error, {
        operation: 'get_accessible_hierarchy',
        userId: this.userContext.user_id,
        rootOrganizationId,
        duration: Date.now() - startTime,
        component: 'hierarchy_service',
      });
      throw error;
    }
  }

  /**
   * Get all ancestor organizations for a given organization
   *
   * Walks up the hierarchy tree from child to root.
   *
   * @param organizationId - Organization ID to start from
   * @returns Array of ancestor organizations (parent, grandparent, etc.)
   * @throws {AuthorizationError} If user lacks access to organization
   */
  async getOrganizationAncestors(organizationId: string): Promise<Organization[]> {
    const startTime = Date.now();

    try {
      // Check access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Get full hierarchy and filter for ancestors
      const hierarchy = await getOrganizationHierarchy(organizationId);
      const ancestors: Organization[] = [];

      // Find the target org in hierarchy
      const targetOrg = hierarchy.find((org) => org.organization_id === organizationId);
      if (!targetOrg) {
        return [];
      }

      // Walk up parent chain
      let currentParentId = targetOrg.parent_organization_id;
      while (currentParentId) {
        const parent = hierarchy.find((org) => org.organization_id === currentParentId);
        if (!parent) break;

        ancestors.push(parent);
        currentParentId = parent.parent_organization_id;
      }

      const duration = Date.now() - startTime;
      log.info('organization ancestors retrieved', {
        operation: 'get_organization_ancestors',
        organizationId,
        userId: this.userContext.user_id,
        ancestorCount: ancestors.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'hierarchy_service',
      });

      return ancestors;
    } catch (error) {
      log.error('get organization ancestors failed', error, {
        operation: 'get_organization_ancestors',
        organizationId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'hierarchy_service',
      });
      throw error;
    }
  }

  /**
   * Get all descendant organizations for a given organization
   *
   * Walks down the hierarchy tree to find all children, grandchildren, etc.
   * Includes depth limit to prevent stack overflow on deep hierarchies.
   *
   * @param organizationId - Organization ID to start from
   * @param maxDepth - Maximum depth to traverse (default: 10 levels)
   * @param currentDepth - Internal parameter for recursion tracking
   * @returns Array of descendant organizations
   * @throws {AuthorizationError} If user lacks access to organization
   * @throws {Error} If max depth exceeded
   */
  async getOrganizationDescendants(
    organizationId: string,
    maxDepth: number = 10,
    currentDepth: number = 0
  ): Promise<Organization[]> {
    const startTime = Date.now();

    try {
      // Check access
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to this organization');
      }

      // Check depth limit
      if (currentDepth >= maxDepth) {
        log.warn('organization descendants max depth exceeded', {
          operation: 'get_organization_descendants',
          organizationId,
          userId: this.userContext.user_id,
          currentDepth,
          maxDepth,
          component: 'hierarchy_service',
        });
        throw new Error(
          `Maximum hierarchy depth of ${maxDepth} exceeded. Consider increasing maxDepth parameter or checking for circular references.`
        );
      }

      // Get immediate children
      const children = await getOrganizationChildren(organizationId);

      // Check children count limit to prevent "wide" attacks
      if (children.length > MAX_CHILDREN_PER_LEVEL) {
        log.warn('excessive children count detected in hierarchy', {
          operation: 'get_organization_descendants',
          organizationId,
          userId: this.userContext.user_id,
          childrenCount: children.length,
          maxChildrenPerLevel: MAX_CHILDREN_PER_LEVEL,
          currentDepth,
          component: 'hierarchy_service',
        });
        throw new Error(
          `Organization hierarchy is too wide to process (${children.length} children at level ${currentDepth})`
        );
      }

      const descendants: Organization[] = [...children];

      // Recursively get descendants of each child
      for (const child of children) {
        const childDescendants = await this.getOrganizationDescendants(
          child.organization_id,
          maxDepth,
          currentDepth + 1
        );
        descendants.push(...childDescendants);
      }

      // Only log at the top level (currentDepth === 0) to avoid log spam
      if (currentDepth === 0) {
        const duration = Date.now() - startTime;
        log.info('organization descendants retrieved', {
          operation: 'get_organization_descendants',
          organizationId,
          userId: this.userContext.user_id,
          descendantCount: descendants.length,
          immediateChildren: children.length,
          maxDepthReached: currentDepth,
          duration,
          slow: duration > SLOW_THRESHOLDS.DB_QUERY,
          component: 'hierarchy_service',
        });
      }

      return descendants;
    } catch (error) {
      // Only log at top level to avoid duplicate error logs
      if (currentDepth === 0) {
        log.error('get organization descendants failed', error, {
          operation: 'get_organization_descendants',
          organizationId,
          userId: this.userContext.user_id,
          duration: Date.now() - startTime,
          component: 'hierarchy_service',
        });
      }
      throw error;
    }
  }

  /**
   * Validate that moving an organization to a new parent won't create circular reference
   *
   * Checks that newParentId is not the organization itself or any of its descendants.
   *
   * @param organizationId - Organization being moved
   * @param newParentId - Proposed new parent organization ID
   * @returns True if move is valid, false if it would create circular reference
   * @throws {AuthorizationError} If user lacks access
   */
  async validateHierarchyMove(organizationId: string, newParentId: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      // Check access to both organizations
      if (!this.canAccessOrganization(organizationId)) {
        throw AuthorizationError('Access denied to organization');
      }
      if (!this.canAccessOrganization(newParentId)) {
        throw AuthorizationError('Access denied to parent organization');
      }

      // Can't be own parent
      if (organizationId === newParentId) {
        log.info('hierarchy move validation failed - same org', {
          operation: 'validate_hierarchy_move',
          organizationId,
          newParentId,
          userId: this.userContext.user_id,
          valid: false,
          reason: 'self_parent',
          duration: Date.now() - startTime,
          component: 'hierarchy_service',
        });
        return false;
      }

      // Get all descendants of the organization being moved
      const descendants = await this.getOrganizationDescendants(organizationId);
      const descendantIds = descendants.map((org) => org.organization_id);

      // New parent cannot be a descendant
      const isCircular = descendantIds.includes(newParentId);

      const duration = Date.now() - startTime;
      log.info('hierarchy move validated', {
        operation: 'validate_hierarchy_move',
        organizationId,
        newParentId,
        userId: this.userContext.user_id,
        valid: !isCircular,
        descendantCount: descendants.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'hierarchy_service',
      });

      return !isCircular;
    } catch (error) {
      log.error('validate hierarchy move failed', error, {
        operation: 'validate_hierarchy_move',
        organizationId,
        newParentId,
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'hierarchy_service',
      });
      throw error;
    }
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Organization Hierarchy Service
 *
 * @param userContext - User context with RBAC permissions
 * @returns Hierarchy service interface
 */
export function createOrganizationHierarchyService(
  userContext: UserContext
): OrganizationHierarchyServiceInterface {
  return new OrganizationHierarchyService(userContext);
}
