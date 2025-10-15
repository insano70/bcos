import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * RBAC Helper Functions
 *
 * Shared RBAC utility functions for user management.
 * Extracted from rbac-users-service.ts to reduce file size.
 *
 * **Pattern**: Helper extraction (STANDARDS.md lines 1,539-1,544)
 */

/**
 * RBAC scope for user access
 */
export type RBACScope = 'own' | 'organization' | 'all';

/**
 * Get RBAC scope for user context
 *
 * @param canReadAll - User has users:read:all permission
 * @param canReadOrganization - User has users:read:organization permission
 * @returns RBAC scope (all, organization, or own)
 */
export function getRBACScope(canReadAll: boolean, canReadOrganization: boolean): RBACScope {
  if (canReadAll) {
    return 'all';
  }
  if (canReadOrganization) {
    return 'organization';
  }
  return 'own';
}

/**
 * Check if user can access organization
 *
 * @param organizationId - Organization to check access for
 * @param isSuperAdmin - Whether user is super admin
 * @param accessibleOrgIds - Organization IDs user can access
 * @returns true if user can access the organization
 */
export function canAccessOrganization(
  organizationId: string,
  isSuperAdmin: boolean,
  accessibleOrgIds: string[]
): boolean {
  if (isSuperAdmin) {
    return true;
  }
  return accessibleOrgIds.includes(organizationId);
}

/**
 * Require organization access or throw error
 *
 * @param organizationId - Organization to require access for
 * @param isSuperAdmin - Whether user is super admin
 * @param accessibleOrgIds - Organization IDs user can access
 * @throws PermissionDeniedError if access is denied
 */
export function requireOrganizationAccess(
  organizationId: string,
  isSuperAdmin: boolean,
  accessibleOrgIds: string[]
): void {
  if (!canAccessOrganization(organizationId, isSuperAdmin, accessibleOrgIds)) {
    throw new PermissionDeniedError('organization:access', organizationId);
  }
}

/**
 * Require permission or throw error
 *
 * @param permission - Permission to require
 * @param hasPermission - Whether user has the permission
 * @param isSuperAdmin - Whether user is super admin
 * @param resourceId - Optional resource ID for error context
 * @throws PermissionDeniedError if permission is denied
 */
export function requirePermission(
  permission: string,
  hasPermission: boolean,
  isSuperAdmin: boolean,
  resourceId?: string
): void {
  if (!hasPermission && !isSuperAdmin) {
    throw new PermissionDeniedError(permission, resourceId || 'unknown');
  }
}

/**
 * Require any of the specified permissions
 *
 * @param permissions - Array of permissions to check
 * @param hasAny - Whether user has any of the permissions
 * @param isSuperAdmin - Whether user is super admin
 * @throws PermissionDeniedError if no permissions match
 */
export function requireAnyPermission(
  permissions: string[],
  hasAny: boolean,
  isSuperAdmin: boolean
): void {
  if (!hasAny && !isSuperAdmin) {
    throw new PermissionDeniedError(permissions.join('|'), 'unknown');
  }
}
