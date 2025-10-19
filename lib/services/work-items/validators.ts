// 1. Errors
import { AuthorizationError } from '@/lib/api/responses/error';

// 2. Types
import type { UserContext } from '@/lib/types/rbac';

/**
 * Work Items Validators
 *
 * Centralized validation helpers for work item operations.
 * Extracted from core-service.ts to eliminate repetitive validation code.
 *
 * Provides:
 * - Organization access validation
 * - Permission validation
 * - Ownership validation
 */

/**
 * Validate user can access organization
 *
 * Checks if user has permission to perform operations on work items
 * in the specified organization. Super admins bypass this check.
 *
 * @param _userContext - User context with permissions (reserved for future use)
 * @param organizationId - Organization ID to check access for
 * @param accessibleOrgIds - List of organization IDs user can access
 * @param canAccessAll - True if user can access all organizations
 * @param operation - Operation name for error message (e.g., "create", "update")
 * @throws AuthorizationError if user cannot access organization
 */
export function validateOrganizationAccess(
  _userContext: UserContext,
  organizationId: string,
  accessibleOrgIds: string[],
  canAccessAll: boolean,
  operation: string
): void {
  // Super admins and users with "all" scope bypass org check
  if (canAccessAll) return;

  if (!accessibleOrgIds.includes(organizationId)) {
    throw AuthorizationError(
      `You do not have permission to ${operation} work items in this organization`
    );
  }
}

/**
 * Validate user has management permission
 *
 * Checks if user has any level of management permission (all, organization, or own).
 * Used to gate create/update/delete operations.
 *
 * @param canManageAll - True if user can manage all work items
 * @param canManageOrg - True if user can manage org work items
 * @param canManageOwn - True if user can manage own work items
 * @param operation - Operation name for error message (e.g., "create", "update")
 * @throws AuthorizationError if user has no management permission
 */
export function validateManagementPermission(
  canManageAll: boolean,
  canManageOrg: boolean,
  canManageOwn: boolean,
  operation: string
): void {
  if (!canManageAll && !canManageOrg && !canManageOwn) {
    throw AuthorizationError(`You do not have permission to ${operation} work items`);
  }
}

/**
 * Validate user has read permission
 *
 * Checks if user has any level of read permission (all, organization, or own).
 * Used to gate read operations.
 *
 * @param canReadAll - True if user can read all work items
 * @param canReadOrg - True if user can read org work items
 * @param canReadOwn - True if user can read own work items
 * @throws AuthorizationError if user has no read permission
 */
export function validateReadPermission(
  canReadAll: boolean,
  canReadOrg: boolean,
  canReadOwn: boolean
): void {
  if (!canReadAll && !canReadOrg && !canReadOwn) {
    throw AuthorizationError('You do not have permission to read work items');
  }
}

/**
 * Validate ownership for "own" scope operations
 *
 * Checks if the work item was created by the current user.
 * Used when user has "own" scope permission but not "all" or "organization".
 *
 * @param userContext - User context with user ID
 * @param createdBy - User ID of work item creator
 * @param resourceName - Resource name for error message (e.g., "work items")
 * @throws AuthorizationError if user is not the creator
 */
export function validateOwnership(
  userContext: UserContext,
  createdBy: string,
  resourceName: string
): void {
  if (createdBy !== userContext.user_id) {
    throw AuthorizationError(`You can only access your own ${resourceName}`);
  }
}
