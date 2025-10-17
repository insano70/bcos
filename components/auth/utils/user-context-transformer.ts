/**
 * User Context Transformer Utility
 *
 * Transforms API user responses into internal UserContext format.
 * Eliminates code duplication by centralizing the transformation logic.
 *
 * This utility is used in:
 * - Initial authentication (session check)
 * - User context loading
 * - Session refresh
 */

import type { UserContext } from '@/lib/types/rbac';
import { clientDebugLog as debugLog, clientErrorLog as errorLog } from '@/lib/utils/debug-client';
import type { APIUserResponse } from '../types';

/**
 * Transform API user response to UserContext format
 *
 * Converts the API's user representation into the internal RBAC UserContext
 * format used throughout the application. This centralized transformation
 * ensures consistency and eliminates duplicate code.
 *
 * @param apiUser - User data from API response
 * @returns Transformed UserContext object
 *
 * @example
 * const userContext = transformApiUserToContext(apiResponse.user);
 */
export function transformApiUserToContext(apiUser: APIUserResponse): UserContext {
  try {
    const userContext: UserContext = {
      user_id: apiUser.id,
      email: apiUser.email,
      first_name: apiUser.firstName,
      last_name: apiUser.lastName,
      is_active: true,
      email_verified: apiUser.emailVerified,

      // RBAC data from API - transform roles
      roles: apiUser.roles.map((role) => ({
        role_id: role.id,
        name: role.name,
        description: role.description || '',
        organization_id: undefined,
        is_system_role: role.isSystemRole,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
        permissions: [], // Will be populated from all_permissions
      })),

      // Organizations the user belongs to
      organizations: apiUser.organizations.map((org) => ({
        organization_id: org.id,
        name: org.name,
        slug: org.slug,
        parent_organization_id: undefined,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: undefined,
      })),

      // Organizations the user can access (may include parent orgs)
      accessible_organizations: (apiUser.accessibleOrganizations || apiUser.organizations).map(
        (org) => ({
          organization_id: org.id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: undefined,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: undefined,
        })
      ),

      // User role and organization associations
      user_roles: [], // Not provided by API - could be populated if needed
      user_organizations: [], // Not provided by API - could be populated if needed

      // Current context
      current_organization_id: apiUser.currentOrganizationId || apiUser.practiceId,

      // Computed properties from API - transform permissions
      all_permissions: apiUser.permissions.map((perm) => ({
        permission_id: perm.id || `perm_${perm.name}`,
        name: perm.name,
        description: perm.description || undefined,
        resource: perm.resource,
        action: perm.action,
        scope: perm.scope as 'own' | 'organization' | 'all', // Type assertion - API guarantees valid scope
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })),

      // Admin flags
      is_super_admin: apiUser.isSuperAdmin,
      organization_admin_for: apiUser.organizationAdminFor || [],
    };

    // Log successful transformation
    debugLog.auth('User context transformed successfully', {
      userId: apiUser.id,
      rolesCount: apiUser.roles.length,
      orgsCount: apiUser.organizations.length,
      permissionsCount: apiUser.permissions.length,
    });

    return userContext;
  } catch (error) {
    errorLog('User context transformation failed:', error);
    throw error;
  }
}

/**
 * Validate API user response has required fields
 *
 * Checks that the API response contains all required fields before transformation.
 * Helps catch API contract changes early.
 *
 * @param apiUser - User data from API response
 * @returns True if valid, throws error if invalid
 * @throws {Error} If required fields are missing
 */
export function validateApiUserResponse(apiUser: unknown): apiUser is APIUserResponse {
  if (!apiUser || typeof apiUser !== 'object') {
    throw new Error('Invalid API user response: not an object');
  }

  const user = apiUser as Record<string, unknown>;

  const requiredFields = [
    'id',
    'email',
    'firstName',
    'lastName',
    'emailVerified',
    'roles',
    'organizations',
    'permissions',
    'isSuperAdmin',
  ];

  for (const field of requiredFields) {
    if (!(field in user)) {
      throw new Error(`Invalid API user response: missing required field '${field}'`);
    }
  }

  // Validate arrays
  if (!Array.isArray(user.roles)) {
    throw new Error('Invalid API user response: roles must be an array');
  }

  if (!Array.isArray(user.organizations)) {
    throw new Error('Invalid API user response: organizations must be an array');
  }

  if (!Array.isArray(user.permissions)) {
    throw new Error('Invalid API user response: permissions must be an array');
  }

  return true;
}
