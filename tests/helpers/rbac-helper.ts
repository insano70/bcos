import { eq, inArray } from 'drizzle-orm';
import {
  organizations,
  permissions,
  role_permissions,
  roles,
  user_organizations,
  user_roles,
} from '@/lib/db/rbac-schema';
import { PermissionChecker } from '@/lib/rbac/permission-checker';
import { ServerPermissionService } from '@/lib/rbac/server-permission-service';
import type {
  Organization,
  Permission,
  PermissionName,
  PermissionScope,
  Role,
  UserContext,
  UserOrganization,
  UserRole,
} from '@/lib/types/rbac';
import type { User } from '@/tests/factories';
import { createTestRole, createTestUser } from '@/tests/factories';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';

/**
 * Map database role object to Role interface
 */
export function mapDatabaseRoleToRole(dbRole: typeof roles.$inferSelect): Role {
  return {
    role_id: dbRole.role_id,
    name: dbRole.name,
    description: dbRole.description || undefined,
    organization_id: dbRole.organization_id || undefined,
    is_system_role: dbRole.is_system_role || false,
    is_active: dbRole.is_active || false,
    created_at: dbRole.created_at || new Date(),
    updated_at: dbRole.updated_at || new Date(),
    deleted_at: dbRole.deleted_at || undefined,
    permissions: [], // Permissions populated separately
  };
}

/**
 * Map database organization object to Organization interface
 */
export function mapDatabaseOrgToOrg(dbOrg: typeof organizations.$inferSelect): Organization {
  return {
    organization_id: dbOrg.organization_id,
    name: dbOrg.name,
    slug: dbOrg.slug,
    parent_organization_id: dbOrg.parent_organization_id || undefined,
    is_active: dbOrg.is_active || false,
    created_at: dbOrg.created_at || new Date(),
    updated_at: dbOrg.updated_at || new Date(),
    deleted_at: dbOrg.deleted_at || undefined,
  };
}

/**
 * Assign a user to an organization
 * Creates the user_organization relationship
 */
export async function assignUserToOrganization(
  user: User,
  organization: Organization
): Promise<UserOrganization> {
  const tx = getCurrentTransaction();

  const [userOrg] = await tx
    .insert(user_organizations)
    .values({
      user_id: user.user_id,
      organization_id: organization.organization_id,
    })
    .returning();

  if (!userOrg) {
    throw new Error('Failed to assign user to organization');
  }

  // Map null values to undefined for TypeScript interface compatibility
  return {
    user_organization_id: userOrg.user_organization_id,
    user_id: userOrg.user_id,
    organization_id: userOrg.organization_id,
    is_active: userOrg.is_active || false,
    joined_at: userOrg.joined_at || new Date(),
    created_at: userOrg.created_at || new Date(),
  };
}

/**
 * Assign a role to a user within an organization
 * Creates the user_role relationship
 */
export async function assignRoleToUser(
  user: User,
  role: Role,
  organization?: Organization,
  grantedBy?: User
): Promise<UserRole> {
  const tx = getCurrentTransaction();

  const [userRole] = await tx
    .insert(user_roles)
    .values({
      user_id: user.user_id,
      role_id: role.role_id,
      organization_id: organization?.organization_id || null,
      granted_by: grantedBy?.user_id || null,
    })
    .returning();

  if (!userRole) {
    throw new Error('Failed to assign role to user');
  }

  // Map null values to undefined for TypeScript interface compatibility
  return {
    user_role_id: userRole.user_role_id,
    user_id: userRole.user_id,
    role_id: userRole.role_id,
    organization_id: userRole.organization_id || undefined,
    granted_by: userRole.granted_by || undefined,
    granted_at: userRole.granted_at || new Date(),
    expires_at: userRole.expires_at || undefined,
    is_active: userRole.is_active || false,
    created_at: userRole.created_at || new Date(),
  };
}

/**
 * Build a complete UserContext for a user
 * Queries all necessary RBAC data from the database
 */
export async function buildUserContext(
  user: User,
  currentOrganizationId?: string
): Promise<UserContext> {
  const tx = getCurrentTransaction();

  // Get user organizations
  const userOrgs = await tx
    .select({
      user_organization_id: user_organizations.user_organization_id,
      user_id: user_organizations.user_id,
      organization_id: user_organizations.organization_id,
      is_active: user_organizations.is_active,
      joined_at: user_organizations.joined_at,
      created_at: user_organizations.created_at,
      organization: organizations, // Select all organization fields
    })
    .from(user_organizations)
    .innerJoin(organizations, eq(user_organizations.organization_id, organizations.organization_id))
    .where(eq(user_organizations.user_id, user.user_id));

  // Get user roles with role and organization details
  const userRolesData = await tx
    .select({
      user_role_id: user_roles.user_role_id,
      user_id: user_roles.user_id,
      role_id: user_roles.role_id,
      organization_id: user_roles.organization_id,
      granted_by: user_roles.granted_by,
      granted_at: user_roles.granted_at,
      expires_at: user_roles.expires_at,
      is_active: user_roles.is_active,
      created_at: user_roles.created_at,
      role: roles, // Select all role fields
      organization: organizations, // Select all organization fields (will be null if no join)
    })
    .from(user_roles)
    .innerJoin(roles, eq(user_roles.role_id, roles.role_id))
    .leftJoin(organizations, eq(user_roles.organization_id, organizations.organization_id))
    .where(eq(user_roles.user_id, user.user_id));

  // Get all permissions for user's roles
  const roleIds = userRolesData.map((ur) => ur.role_id);
  const allPermissions: Permission[] = [];

  if (roleIds.length > 0) {
    const rolePerms = await tx
      .select({
        permission: permissions, // Select all permission fields
      })
      .from(role_permissions)
      .innerJoin(permissions, eq(role_permissions.permission_id, permissions.permission_id))
      .where(inArray(role_permissions.role_id, roleIds));

    allPermissions.push(
      ...rolePerms.map((rp) => ({
        permission_id: rp.permission.permission_id,
        name: rp.permission.name,
        description: rp.permission.description || undefined,
        resource: rp.permission.resource,
        action: rp.permission.action,
        scope: (rp.permission.scope as PermissionScope) || 'own',
        is_active: rp.permission.is_active || false,
        created_at: rp.permission.created_at || new Date(),
        updated_at: rp.permission.updated_at || new Date(),
      }))
    );
  }

  // Build accessible organizations (including children)
  const mappedOrgs = userOrgs.map((uo) => ({
    organization_id: uo.organization.organization_id,
    name: uo.organization.name,
    slug: uo.organization.slug,
    parent_organization_id: uo.organization.parent_organization_id || undefined,
    is_active: uo.organization.is_active || false,
    created_at: uo.organization.created_at || new Date(),
    updated_at: uo.organization.updated_at || new Date(),
    deleted_at: uo.organization.deleted_at || undefined,
  }));
  const accessibleOrganizations = await getAccessibleOrganizations(mappedOrgs);

  // Determine if user is super admin
  const isSuperAdmin = userRolesData.some(
    (ur) => ur.role.is_system_role === true && ur.role.name === 'super_admin'
  );

  // Find organizations where user is admin
  const organizationAdminFor = userRolesData
    .filter((ur) => ur.role.name.includes('admin'))
    .map((ur) => ur.organization_id)
    .filter((id): id is string => id !== null);

  // Build roles with permissions populated
  const rolesWithPermissions = userRolesData.map((ur) => ({
    role_id: ur.role.role_id,
    name: ur.role.name,
    description: ur.role.description || undefined,
    organization_id: ur.role.organization_id || undefined,
    is_system_role: ur.role.is_system_role || false,
    is_active: ur.role.is_active || false,
    created_at: ur.role.created_at || new Date(),
    updated_at: ur.role.updated_at || new Date(),
    deleted_at: ur.role.deleted_at || undefined,
    permissions: allPermissions.filter(
      (_p) => roleIds.includes(ur.role_id) // This is a simplification - in reality we'd need role-permission mapping
    ),
  }));

  return {
    // Basic user information
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active || false,
    email_verified: user.email_verified || false,

    // RBAC information
    roles: rolesWithPermissions,
    organizations: userOrgs.map((uo) => ({
      organization_id: uo.organization.organization_id,
      name: uo.organization.name,
      slug: uo.organization.slug,
      parent_organization_id: uo.organization.parent_organization_id || undefined,
      is_active: uo.organization.is_active || false,
      created_at: uo.organization.created_at || new Date(),
      updated_at: uo.organization.updated_at || new Date(),
      deleted_at: uo.organization.deleted_at || undefined,
    })),
    accessible_organizations: accessibleOrganizations,
    user_roles: userRolesData.map((ur) => ({
      user_role_id: ur.user_role_id,
      user_id: ur.user_id,
      role_id: ur.role_id,
      organization_id: ur.organization_id || undefined,
      granted_by: ur.granted_by || undefined,
      granted_at: ur.granted_at || new Date(),
      expires_at: ur.expires_at || undefined,
      is_active: ur.is_active || false,
      created_at: ur.created_at || new Date(),
      role: {
        role_id: ur.role.role_id,
        name: ur.role.name,
        description: ur.role.description || undefined,
        organization_id: ur.role.organization_id || undefined,
        is_system_role: ur.role.is_system_role || false,
        is_active: ur.role.is_active || false,
        created_at: ur.role.created_at || new Date(),
        updated_at: ur.role.updated_at || new Date(),
        deleted_at: ur.role.deleted_at || undefined,
        permissions: [], // Will be populated by the role permissions query
      },
      organization: ur.organization
        ? {
            organization_id: ur.organization.organization_id,
            name: ur.organization.name,
            slug: ur.organization.slug,
            parent_organization_id: ur.organization.parent_organization_id || undefined,
            is_active: ur.organization.is_active || false,
            created_at: ur.organization.created_at || new Date(),
            updated_at: ur.organization.updated_at || new Date(),
            deleted_at: ur.organization.deleted_at || undefined,
          }
        : (undefined as Organization | undefined),
    })),
    user_organizations: userOrgs.map((uo) => ({
      user_organization_id: uo.user_organization_id,
      user_id: uo.user_id,
      organization_id: uo.organization_id,
      is_active: uo.is_active || false,
      joined_at: uo.joined_at || new Date(),
      created_at: uo.created_at || new Date(),
      organization: {
        organization_id: uo.organization.organization_id,
        name: uo.organization.name,
        slug: uo.organization.slug,
        parent_organization_id: uo.organization.parent_organization_id || undefined,
        is_active: uo.organization.is_active || false,
        created_at: uo.organization.created_at || new Date(),
        updated_at: uo.organization.updated_at || new Date(),
        deleted_at: uo.organization.deleted_at || undefined,
      },
    })),

    // Current context
    current_organization_id: currentOrganizationId,

    // Computed properties
    all_permissions: allPermissions,
    is_super_admin: isSuperAdmin,
    organization_admin_for: organizationAdminFor,
  };
}

/**
 * Get all organizations a user can access (including child organizations)
 * This simulates the organization hierarchy logic
 */
async function getAccessibleOrganizations(
  userOrganizations: Organization[]
): Promise<Organization[]> {
  const _tx = getCurrentTransaction();
  const _accessibleOrgIds = new Set(userOrganizations.map((org) => org.organization_id));

  // For simplicity in tests, just return the user's direct organizations
  // In a real implementation, this would traverse the organization hierarchy
  return userOrganizations;
}

/**
 * Create a PermissionChecker for a user with database context
 * Useful for testing permission logic directly
 */
export async function createPermissionChecker(user: User): Promise<PermissionChecker> {
  const userContext = await buildUserContext(user);
  return new PermissionChecker(userContext);
}

/**
 * Test if a user has a specific permission
 * Returns both the result and detailed information
 * Uses server-side permission service for full database validation including practice ownership
 */
export async function testUserPermission(
  user: User,
  permission: PermissionName,
  resourceId?: string,
  organizationId?: string
): Promise<{ granted: boolean; scope?: string; reason?: string | undefined }> {
  const userContext = await buildUserContext(user);
  const testDb = getCurrentTransaction(); // Use the test transaction for database queries
  const serverService = new ServerPermissionService(userContext, testDb as any);
  const result = await serverService.checkPermission(permission, resourceId, organizationId);

  return {
    granted: result.granted,
    scope: result.scope,
    reason: result.reason,
  };
}

/**
 * Helper to create a user with specific roles and permissions
 * Useful for setting up test scenarios quickly
 */
export async function createUserWithRoles(
  roleNames: string[],
  organization?: Organization,
  userOptions: Partial<User> = {}
): Promise<{ user: User; userContext: UserContext }> {
  // Create the user
  const user = await createTestUser(userOptions);

  // Assign to organization if specified
  if (organization) {
    await assignUserToOrganization(user, organization);
  }

  // Create and assign roles
  for (const roleName of roleNames) {
    const roleOptions: any = {
      name: roleName,
      isSystemRole: !organization, // System role if no organization
    };

    if (organization?.organization_id) {
      roleOptions.organizationId = organization.organization_id;
    }

    const role = await createTestRole(roleOptions);
    // Map the role to ensure type compatibility
    const mappedRole: Role = {
      role_id: role.role_id,
      name: role.name,
      description: role.description || undefined,
      organization_id: role.organization_id || undefined,
      is_system_role: role.is_system_role || false,
      is_active: role.is_active || false,
      created_at: role.created_at || new Date(),
      updated_at: role.updated_at || new Date(),
      deleted_at: role.deleted_at || undefined,
      permissions: [], // Permissions will be populated by RBAC logic
    };
    await assignRoleToUser(user, mappedRole, organization, user); // Self-granted for tests
  }

  // Build user context
  const userContext = await buildUserContext(user);

  return { user, userContext };
}

/**
 * Create a user with specific permissions
 * Useful for RBAC API testing - creates a user, role, and assigns permissions
 *
 * This is a convenience wrapper that combines createTestUser, createTestRole,
 * and assignRoleToUser to simplify the common pattern of creating a user
 * with specific permissions for API testing.
 *
 * @param permissionNames - Array of permission names (e.g., ['analytics:read:all'])
 * @param organizationId - Optional organization ID to scope the user to
 * @param userOptions - Optional user creation options
 * @returns The created user
 *
 * @example
 * // Create user with analytics read permission
 * const user = await createUserWithPermissions(['analytics:read:all'])
 *
 * // Create user within specific organization
 * const org = await createTestOrganization()
 * const user = await createUserWithPermissions(
 *   ['analytics:read:organization'],
 *   org.organization_id
 * )
 *
 * // Create user with no permissions (for negative testing)
 * const restrictedUser = await createUserWithPermissions([])
 */
export async function createUserWithPermissions(
  permissionNames: PermissionName[],
  organizationId?: string,
  userOptions: Partial<User> = {}
): Promise<User> {
  const tx = getCurrentTransaction();

  // Create the user
  const user = await createTestUser(userOptions);

  // Look up organization if ID provided
  let organization: Organization | undefined;
  if (organizationId) {
    const orgs = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.organization_id, organizationId));

    if (orgs.length > 0) {
      organization = mapDatabaseOrgToOrg(orgs[0]!);
      await assignUserToOrganization(user, organization);
    }
  }

  // Create a role with the specified permissions using the factory
  const roleOptions: {
    name: string;
    description: string;
    isSystemRole: boolean;
    permissions: PermissionName[];
    organizationId?: string;
  } = {
    name: `test_role_${user.user_id.substring(0, 8)}`,
    description: `Test role with ${permissionNames.length} permissions`,
    isSystemRole: !organizationId,
    permissions: permissionNames,
  };

  // Only add organizationId if it exists (exactOptionalPropertyTypes compatibility)
  if (organizationId) {
    roleOptions.organizationId = organizationId;
  }

  const role = await createTestRole(roleOptions);

  // Map the role and assign to user
  const mappedRole: Role = mapDatabaseRoleToRole(role);
  await assignRoleToUser(user, mappedRole, organization, user);

  return user;
}
