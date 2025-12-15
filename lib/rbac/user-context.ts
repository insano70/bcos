import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  organizations,
  permissions,
  role_permissions,
  roles,
  user_organizations,
  user_roles,
  users,
} from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type {
  Organization,
  Permission,
  Role,
  UserContext,
  UserOrganization,
  UserRole,
} from '@/lib/types/rbac';

/**
 * User Context Service
 * Loads complete user information with roles, permissions, and organization access
 */

/**
 * Get complete user context with RBAC information
 * This is the primary function for loading user data for permission checking
 */
export async function getUserContext(userId: string): Promise<UserContext> {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // 1. Get basic user information
  const t1 = Date.now();
  const [user] = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      first_name: users.first_name,
      last_name: users.last_name,
      is_active: users.is_active,
      email_verified: users.email_verified,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(eq(users.user_id, userId))
    .limit(1);
  timings['1_user_query'] = Date.now() - t1;

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  if (!user.is_active) {
    throw new Error(`User account is inactive: ${userId}`);
  }

  // 2. Get user's organizations
  const t2 = Date.now();
  const userOrgs = await db
    .select({
      user_organization_id: user_organizations.user_organization_id,
      user_id: user_organizations.user_id,
      organization_id: user_organizations.organization_id,
      is_active: user_organizations.is_active,
      joined_at: user_organizations.joined_at,
      created_at: user_organizations.created_at,
      // Organization details
      org_name: organizations.name,
      org_slug: organizations.slug,
      org_parent_id: organizations.parent_organization_id,
      org_practice_uids: organizations.practice_uids,
      org_is_active: organizations.is_active,
      org_created_at: organizations.created_at,
      org_updated_at: organizations.updated_at,
      org_deleted_at: organizations.deleted_at,
    })
    .from(user_organizations)
    .innerJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id))
    .where(
      and(
        eq(user_organizations.user_id, userId),
        eq(user_organizations.is_active, true),
        eq(organizations.is_active, true)
      )
    );
  timings['2_user_orgs_query'] = Date.now() - t2;

  // 3. Get accessible organizations (includes children via hierarchy)
  // Expand hierarchy to include all descendant organizations
  const accessibleOrganizations: Organization[] = [];

  // Import hierarchy service for traversal
  const t3 = Date.now();
  const { organizationHierarchyService } = await import(
    '@/lib/services/organization-hierarchy-service'
  );
  timings['3_import_hierarchy_service'] = Date.now() - t3;

  // Get all organizations for hierarchy traversal (cached in Redis for 30 days)
  const t4 = Date.now();
  const allOrganizations = await organizationHierarchyService.getAllOrganizations();
  timings['4_get_all_orgs'] = Date.now() - t4;

  // For each direct organization membership, expand to include children
  const t5 = Date.now();
  for (const userOrg of userOrgs) {
    // Get all organizations in hierarchy (parent + descendants)
    const hierarchyIds = await organizationHierarchyService.getOrganizationHierarchy(
      userOrg.organization_id,
      allOrganizations
    );

    // Add all organizations from hierarchy to accessible list
    for (const orgId of hierarchyIds) {
      const org = allOrganizations.find((o) => o.organization_id === orgId);
      if (org && !accessibleOrganizations.some((a) => a.organization_id === orgId)) {
        accessibleOrganizations.push({
          organization_id: org.organization_id,
          name: org.name,
          slug: org.slug,
          parent_organization_id: org.parent_organization_id,
          practice_uids: org.practice_uids,
          is_active: org.is_active,
          created_at: org.created_at,
          updated_at: org.updated_at,
          deleted_at: org.deleted_at,
        });
      }
    }

    // Fallback: If hierarchy lookup returned empty (cache miss/stale),
    // add the user's direct organization from the database query result.
    // This prevents permission failures when Redis cache is stale or missing orgs.
    if (hierarchyIds.length === 0 && !accessibleOrganizations.some((a) => a.organization_id === userOrg.organization_id)) {
      log.warn('Organization not found in hierarchy cache, adding from database', {
        organizationId: userOrg.organization_id,
        organizationName: userOrg.org_name,
        userId: user.user_id,
        component: 'rbac',
        operation: 'get_user_context',
      });

      accessibleOrganizations.push({
        organization_id: userOrg.organization_id,
        name: userOrg.org_name,
        slug: userOrg.org_slug,
        parent_organization_id: userOrg.org_parent_id || undefined,
        practice_uids: userOrg.org_practice_uids || undefined,
        is_active: userOrg.org_is_active ?? true,
        created_at: userOrg.org_created_at ?? new Date(),
        updated_at: userOrg.org_updated_at ?? new Date(),
        deleted_at: userOrg.org_deleted_at || undefined,
      });
    }
  }
  timings['5_hierarchy_loop'] = Date.now() - t5;

  log.info('User accessible organizations resolved with hierarchy', {
    userId: user.user_id,
    email: user.email,
    directOrganizationCount: userOrgs.length,
    totalAccessibleOrganizationCount: accessibleOrganizations.length,
    includesHierarchy: accessibleOrganizations.length > userOrgs.length,
  });

  // 4. Get user's roles with permissions (optimized with database-level deduplication)
  const t6 = Date.now();
  const userRolesData = await db
    .selectDistinct({
      // User role info
      user_role_id: user_roles.user_role_id,
      user_id: user_roles.user_id,
      role_id: user_roles.role_id,
      user_role_organization_id: user_roles.organization_id,
      granted_by: user_roles.granted_by,
      granted_at: user_roles.granted_at,
      expires_at: user_roles.expires_at,
      user_role_is_active: user_roles.is_active,
      user_role_created_at: user_roles.created_at,

      // Role info
      role_name: roles.name,
      role_description: roles.description,
      role_organization_id: roles.organization_id,
      is_system_role: roles.is_system_role,
      role_is_active: roles.is_active,
      role_created_at: roles.created_at,
      role_updated_at: roles.updated_at,
      role_deleted_at: roles.deleted_at,

      // Permission info
      permission_id: permissions.permission_id,
      permission_name: permissions.name,
      permission_description: permissions.description,
      resource: permissions.resource,
      action: permissions.action,
      scope: permissions.scope,
      permission_is_active: permissions.is_active,
      permission_created_at: permissions.created_at,
      permission_updated_at: permissions.updated_at,
    })
    .from(user_roles)
    .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
    .innerJoin(role_permissions, eq(roles.role_id, role_permissions.role_id))
    .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
    .where(
      and(
        eq(user_roles.user_id, userId),
        eq(user_roles.is_active, true),
        eq(roles.is_active, true),
        eq(permissions.is_active, true)
      )
    );
  timings['6_roles_permissions_query'] = Date.now() - t6;

  // 5. Transform data into structured format
  const rolesMap = new Map<string, Role>();
  const userRolesMap = new Map<string, UserRole>();
  // Performance optimization: Use Set for O(1) permission duplicate checking
  const rolePermissionSets = new Map<string, Set<string>>();

  userRolesData.forEach((row) => {
    // Build role with permissions
    if (!rolesMap.has(row.role_id)) {
      rolesMap.set(row.role_id, {
        role_id: row.role_id,
        name: row.role_name,
        description: row.role_description || undefined,
        organization_id: row.role_organization_id || undefined,
        is_system_role: row.is_system_role ?? false,
        is_active: row.role_is_active ?? true,
        created_at: row.role_created_at ?? new Date(),
        updated_at: row.role_updated_at ?? new Date(),
        deleted_at: row.role_deleted_at || undefined,
        permissions: [],
      });
      // Initialize permission tracking set for this role
      rolePermissionSets.set(row.role_id, new Set<string>());
    }

    const role = rolesMap.get(row.role_id);
    const permissionSet = rolePermissionSets.get(row.role_id);

    if (!role || !permissionSet) {
      // This should not happen given our logic above, but we handle it safely
      log.warn('missing role or permission set in user context', {
        roleId: row.role_id,
        userId,
        component: 'rbac',
        operation: 'get_user_context',
      });
      return; // Early return from forEach iteration
    }

    // Add permission to role (O(1) duplicate checking with Set)
    if (!permissionSet.has(row.permission_id)) {
      permissionSet.add(row.permission_id);
      role.permissions.push({
        permission_id: row.permission_id,
        name: row.permission_name,
        description: row.permission_description || undefined,
        resource: row.resource,
        action: row.action,
        scope: row.scope as 'own' | 'organization' | 'all',
        is_active: row.permission_is_active ?? true,
        created_at: row.permission_created_at ?? new Date(),
        updated_at: row.permission_updated_at ?? new Date(),
      });
    }

    // Build user role mapping
    if (!userRolesMap.has(row.user_role_id)) {
      userRolesMap.set(row.user_role_id, {
        user_role_id: row.user_role_id,
        user_id: row.user_id,
        role_id: row.role_id,
        organization_id: row.user_role_organization_id || undefined,
        granted_by: row.granted_by || undefined,
        granted_at: row.granted_at ?? new Date(),
        expires_at: row.expires_at || undefined,
        is_active: row.user_role_is_active ?? true,
        created_at: row.user_role_created_at ?? new Date(),
        role: role as Role, // Safe: early return ensures role is defined
      });
    }
  });

  // 6. Build user organizations array
  const userOrganizationsArray: UserOrganization[] = userOrgs.map((org) => ({
    user_organization_id: org.user_organization_id,
    user_id: org.user_id,
    organization_id: org.organization_id,
    is_active: org.is_active ?? true,
    joined_at: org.joined_at ?? new Date(),
    created_at: org.created_at ?? new Date(),
    organization: {
      organization_id: org.organization_id,
      name: org.org_name,
      slug: org.org_slug,
      parent_organization_id: org.org_parent_id || undefined,
      practice_uids: org.org_practice_uids || undefined,
      is_active: org.org_is_active ?? true,
      created_at: org.org_created_at ?? new Date(),
      updated_at: org.org_updated_at ?? new Date(),
      deleted_at: org.org_deleted_at || undefined,
    },
  }));

  // 7. Get all unique permissions across all roles (O(1) deduplication with Set)
  const uniquePermissionsMap = new Map<string, Permission>();
  Array.from(rolesMap.values()).forEach((role) => {
    role.permissions.forEach((permission) => {
      uniquePermissionsMap.set(permission.permission_id, permission);
    });
  });
  const allPermissions = Array.from(uniquePermissionsMap.values());

  // 8. Determine admin status
  const isSuperAdmin = Array.from(rolesMap.values()).some(
    (role) => role.is_system_role && role.name === 'super_admin'
  );

  const organizationAdminFor = Array.from(rolesMap.values())
    .filter(
      (role) => !role.is_system_role && role.name === 'practice_admin' && role.organization_id
    )
    .map((role) => {
      if (!role.organization_id) {
        throw new Error('Organization ID required for practice_admin role');
      }
      return role.organization_id;
    })
    .filter(Boolean);

  // 9. Build final user context
  const userContext: UserContext = {
    // Basic user info
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    email_verified: user.email_verified ?? false,

    // RBAC data
    roles: Array.from(rolesMap.values()),
    organizations: userOrganizationsArray.map((uo) => {
      if (!uo.organization) {
        throw new Error('Organization data missing for user organization');
      }
      return uo.organization;
    }),
    accessible_organizations: accessibleOrganizations,
    user_roles: Array.from(userRolesMap.values()),
    user_organizations: userOrganizationsArray,

    // Current context (default to first organization)
    current_organization_id: userOrganizationsArray[0]?.organization_id,

    // Computed properties
    all_permissions: allPermissions,
    is_super_admin: isSuperAdmin,
    organization_admin_for: organizationAdminFor,
  };

  // Log timing breakdown for performance analysis
  timings.total = Date.now() - startTime;
  log.info('[PERF] getUserContext timing breakdown', {
    userId,
    timings,
    totalMs: timings.total,
  });

  return userContext;
}

/**
 * Error thrown when user context cannot be loaded due to authentication issues
 * This is NOT a server error - it indicates the session is no longer valid
 */
export class UserContextAuthError extends Error {
  public readonly reason: UserContextAuthErrorReason;
  public readonly userId: string;

  constructor(reason: UserContextAuthErrorReason, userId: string, message?: string) {
    const defaultMessages: Record<UserContextAuthErrorReason, string> = {
      user_not_found: 'User not found',
      user_inactive: 'User account is inactive',
      context_load_failed: 'Failed to load user context',
    };
    super(message || defaultMessages[reason]);
    this.name = 'UserContextAuthError';
    this.reason = reason;
    this.userId = userId;
  }
}

export type UserContextAuthErrorReason = 'user_not_found' | 'user_inactive' | 'context_load_failed';

/**
 * Get user context with typed error throwing
 *
 * Use this when you want to distinguish between different auth failure scenarios.
 * Throws UserContextAuthError for auth-related failures (should map to 401).
 * Re-throws other errors (database errors, etc.) which should map to 500.
 *
 * @param userId - User ID to load context for
 * @returns UserContext
 * @throws UserContextAuthError for auth failures (user not found, inactive)
 * @throws Error for server failures (database errors)
 */
export async function getUserContextOrThrow(userId: string): Promise<UserContext> {
  try {
    return await getUserContext(userId);
  } catch (error) {
    // Check for specific auth-related errors from getUserContext
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('user not found')) {
        log.security('user_context_auth_failure', 'medium', {
          userId,
          reason: 'user_not_found',
          action: 'throwing_auth_error',
        });
        throw new UserContextAuthError('user_not_found', userId);
      }

      if (message.includes('inactive')) {
        log.security('user_context_auth_failure', 'medium', {
          userId,
          reason: 'user_inactive',
          action: 'throwing_auth_error',
        });
        throw new UserContextAuthError('user_inactive', userId);
      }
    }

    // For other errors (database failures, etc.), log and re-throw
    // These are genuine server errors, not auth failures
    log.error('User context load failed with server error', error instanceof Error ? error : new Error(String(error)), {
      userId,
      operation: 'getUserContextOrThrow',
      component: 'rbac',
    });
    throw error;
  }
}

/**
 * Refresh user context (for cache invalidation)
 */
export async function refreshUserContext(userId: string): Promise<UserContext> {
  // In a production system, this would clear any cached user context
  // For now, just fetch fresh data
  return await getUserContext(userId);
}

/**
 * Check if user exists and is active
 */
export async function validateUserExists(userId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ user_id: users.user_id, is_active: users.is_active })
      .from(users)
      .where(eq(users.user_id, userId))
      .limit(1);

    return user?.is_active === true;
  } catch (error) {
    log.error('Error validating user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}
