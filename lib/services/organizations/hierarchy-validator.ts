import { ValidationError } from '@/lib/api/responses/error';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { getOrganizationChildren } from '@/lib/rbac/organization-hierarchy';
import type { Organization } from '@/lib/types/rbac';
import { MAX_CHILDREN_PER_LEVEL, MAX_HIERARCHY_DEPTH } from './sanitization';

/**
 * Hierarchy Validation Utilities
 *
 * Prevents circular references and validates tree structure constraints.
 *
 * Used by:
 * - core-service.ts:updateOrganization() - Validates parent changes
 * - hierarchy-service.ts:getOrganizationDescendants() - Validates depth/width
 *
 * This module centralizes all hierarchy validation logic to ensure consistent
 * enforcement of tree structure rules across all organization operations.
 *
 * Extracted from hierarchy-service.ts to make validation logic reusable
 * by core-service.ts (fixing incomplete circular reference checking).
 */

// ============================================================
// CIRCULAR REFERENCE VALIDATION
// ============================================================

/**
 * Validate that parent change won't create circular reference
 *
 * Performs comprehensive circular reference detection:
 * 1. Self-parent check: Organization cannot be its own parent
 * 2. Descendant check: New parent cannot be a descendant
 *
 * This prevents cycles like: A→B→C→A or A→A
 *
 * Used by core-service.ts:updateOrganization() to validate
 * parent_organization_id changes before persisting to database.
 *
 * @param organizationId - Organization being moved
 * @param newParentId - Proposed new parent organization ID
 * @param getDescendantsFn - Function to retrieve descendants (injected for testability)
 * @throws {ValidationError} If circular reference detected
 *
 * @example
 * ```typescript
 * await validateCircularReference(
 *   'org-123',
 *   'parent-456',
 *   (id) => hierarchyService.getOrganizationDescendants(id)
 * );
 * ```
 */
export async function validateCircularReference(
  organizationId: string,
  newParentId: string,
  getDescendantsFn: (id: string) => Promise<Organization[]>
): Promise<void> {
  const startTime = Date.now();

  // Check 1: Cannot be own parent
  if (organizationId === newParentId) {
    throw ValidationError(null, 'Organization cannot be its own parent');
  }

  // Check 2: New parent cannot be a descendant
  const descendants = await getDescendantsFn(organizationId);
  const descendantIds = descendants.map((org) => org.organization_id);

  if (descendantIds.includes(newParentId)) {
    const duration = Date.now() - startTime;
    log.warn('circular reference detected in hierarchy update', {
      operation: 'validate_circular_reference',
      organizationId,
      newParentId,
      descendantCount: descendants.length,
      duration,
      component: 'hierarchy_validator',
    });

    throw ValidationError(
      null,
      'Cannot set parent: would create circular reference in organization hierarchy'
    );
  }

  const duration = Date.now() - startTime;
  log.debug('circular reference validation passed', {
    operation: 'validate_circular_reference',
    organizationId,
    newParentId,
    descendantCount: descendants.length,
    duration,
    slow: duration > SLOW_THRESHOLDS.DB_QUERY,
    component: 'hierarchy_validator',
  });
}

// ============================================================
// HIERARCHY DEPTH VALIDATION
// ============================================================

/**
 * Validate hierarchy depth doesn't exceed limits
 *
 * Prevents stack overflow and performance issues from excessively
 * deep organization hierarchies.
 *
 * Used by hierarchy-service.ts:getOrganizationDescendants() during
 * recursive tree traversal.
 *
 * @param currentDepth - Current depth in hierarchy traversal
 * @param maxDepth - Maximum allowed depth (default: MAX_HIERARCHY_DEPTH)
 * @throws {Error} If depth limit exceeded
 *
 * @example
 * ```typescript
 * validateHierarchyDepth(currentDepth, 10);
 * // Throws if currentDepth >= 10
 * ```
 */
export function validateHierarchyDepth(
  currentDepth: number,
  maxDepth: number = MAX_HIERARCHY_DEPTH
): void {
  if (currentDepth >= maxDepth) {
    throw new Error(
      `Maximum hierarchy depth of ${maxDepth} exceeded. Consider increasing maxDepth parameter or checking for circular references.`
    );
  }
}

// ============================================================
// HIERARCHY WIDTH VALIDATION
// ============================================================

/**
 * Validate children count doesn't exceed limits
 *
 * Prevents "wide" hierarchy attacks where a single organization
 * has thousands of children, causing memory exhaustion and
 * performance degradation.
 *
 * Used by hierarchy-service.ts:getOrganizationDescendants() to
 * validate each level during tree traversal.
 *
 * @param organizationId - Parent organization ID
 * @param currentDepth - Current depth (for logging context)
 * @throws {Error} If children count exceeds MAX_CHILDREN_PER_LEVEL
 *
 * @example
 * ```typescript
 * await validateChildrenCount('parent-org-id', 2);
 * // Throws if parent has > 1000 children
 * ```
 */
export async function validateChildrenCount(
  organizationId: string,
  currentDepth: number = 0
): Promise<void> {
  const children = await getOrganizationChildren(organizationId);

  if (children.length > MAX_CHILDREN_PER_LEVEL) {
    log.warn('excessive children count detected in hierarchy', {
      operation: 'validate_children_count',
      organizationId,
      childrenCount: children.length,
      maxChildrenPerLevel: MAX_CHILDREN_PER_LEVEL,
      currentDepth,
      component: 'hierarchy_validator',
    });

    throw new Error(
      `Organization hierarchy is too wide to process (${children.length} children at level ${currentDepth})`
    );
  }
}
