/**
 * RBAC Error Classes
 *
 * Relocated from lib/types/rbac.ts to separate runtime code from type definitions.
 *
 * These errors are thrown when RBAC permission checks fail.
 */

import type { PermissionScope } from '@/lib/types/rbac';

/**
 * Base class for RBAC-related errors
 */
export class RBACError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 403,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RBACError';
  }
}

/**
 * Error thrown when a user lacks the required permission
 */
export class PermissionDeniedError extends RBACError {
  constructor(permission: string, resourceId?: string, organizationId?: string) {
    const message = `Permission denied: ${permission}${resourceId ? ` for resource ${resourceId}` : ''}${organizationId ? ` in organization ${organizationId}` : ''}`;
    super(message, 'PERMISSION_DENIED', 403, {
      permission,
      resourceId,
      organizationId,
    });
  }
}

/**
 * Error thrown when a user has a permission but with insufficient scope
 */
export class InsufficientScopeError extends RBACError {
  constructor(requiredScope: PermissionScope, actualScope: PermissionScope) {
    super(
      `Insufficient scope: required ${requiredScope}, got ${actualScope}`,
      'INSUFFICIENT_SCOPE',
      403,
      { requiredScope, actualScope }
    );
  }
}

/**
 * Error thrown when a user tries to access an organization they don't have access to
 */
export class OrganizationAccessError extends RBACError {
  constructor(organizationId: string) {
    super(`Access denied to organization: ${organizationId}`, 'ORGANIZATION_ACCESS_DENIED', 403, {
      organizationId,
    });
  }
}

