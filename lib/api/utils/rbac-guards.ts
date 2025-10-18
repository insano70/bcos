/**
 * RBAC Authorization Guards
 *
 * Utility functions for common authorization checks in services.
 * These guards throw standardized errors when authorization fails.
 */

import { AuthorizationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Require Super Admin Access
 *
 * Throws AuthorizationError if the user is not a super admin.
 * Use this in service constructors for super-admin-only services.
 *
 * @param userContext - User context to check
 * @param operationName - Optional operation name for error message (e.g., "security monitoring")
 * @throws {AuthorizationError} If user is not super admin
 *
 * @example
 * ```typescript
 * class AdminService {
 *   constructor(private readonly userContext: UserContext) {
 *     requireSuperAdmin(userContext, 'admin operations');
 *   }
 * }
 * ```
 */
export function requireSuperAdmin(
  userContext: UserContext,
  operationName?: string
): asserts userContext is UserContext & { is_super_admin: true } {
  if (!userContext.is_super_admin) {
    const message = operationName
      ? `Super admin access required for ${operationName}`
      : 'Super admin access required';
    throw AuthorizationError(message);
  }
}
