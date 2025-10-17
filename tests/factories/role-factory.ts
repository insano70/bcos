import type { InferSelectModel } from 'drizzle-orm';
import { inArray } from 'drizzle-orm';
import { permissions, role_permissions, roles } from '@/lib/db/rbac-schema';
import type { PermissionName } from '@/lib/types/rbac';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import { generateUniqueRoleName } from '@/tests/helpers/unique-generator';
import type { Organization } from './organization-factory';

type Role = InferSelectModel<typeof roles>;

/**
 * Configuration options for creating test roles
 */
export interface CreateRoleOptions {
  name?: string;
  description?: string;
  organizationId?: string;
  isSystemRole?: boolean;
  isActive?: boolean;
  permissions?: PermissionName[];
}

/**
 * Create a test role with optional permissions
 * Uses cryptographically unique identifiers for collision-free parallel testing
 */
export async function createTestRole(options: CreateRoleOptions = {}): Promise<Role> {
  const tx = getCurrentTransaction();

  const roleData = {
    name: options.name || generateUniqueRoleName(),
    description: options.description || 'Test role',
    organization_id: options.organizationId || null,
    is_system_role: options.isSystemRole ?? false,
    is_active: options.isActive ?? true,
  };

  const [role] = await tx.insert(roles).values(roleData).returning();
  if (!role) {
    throw new Error('Failed to create test role');
  }

  // Assign permissions if specified
  if (options.permissions && options.permissions.length > 0) {
    await assignPermissionsToRole(role.role_id, options.permissions);
  }

  return role;
}

/**
 * Assign permissions to a role
 * Looks up permissions by name and creates role_permission relationships
 */
export async function assignPermissionsToRole(
  roleId: string,
  permissionNames: PermissionName[]
): Promise<void> {
  const tx = getCurrentTransaction();

  // Get permission IDs for the specified permission names
  const permissionRecords = await tx
    .select()
    .from(permissions)
    .where(inArray(permissions.name, permissionNames));

  if (permissionRecords.length !== permissionNames.length) {
    const foundNames = permissionRecords.map((p) => p.name);
    const missingNames = permissionNames.filter((name) => !foundNames.includes(name));
    throw new Error(`Permissions not found: ${missingNames.join(', ')}`);
  }

  // Create role-permission relationships
  const rolePermissionData = permissionRecords.map((permission) => ({
    role_id: roleId,
    permission_id: permission.permission_id,
  }));

  await tx.insert(role_permissions).values(rolePermissionData);
}

/**
 * Create a test role within a specific organization
 * Useful for testing organization-scoped permissions
 */
export async function createTestRoleInOrganization(
  organization: Organization,
  options: Omit<CreateRoleOptions, 'organizationId'> = {}
): Promise<Role> {
  return createTestRole({
    ...options,
    organizationId: organization.organization_id,
  });
}

/**
 * Create a system-level test role (not tied to any organization)
 * Useful for testing global permissions like super_admin
 */
export async function createTestSystemRole(
  options: Omit<CreateRoleOptions, 'organizationId' | 'isSystemRole'> = {}
): Promise<Role> {
  return createTestRole({
    ...options,
    isSystemRole: true,
  });
}

/**
 * Create multiple test roles in a batch
 * Useful for testing role hierarchies or bulk role operations
 */
export async function createTestRoles(
  count: number,
  baseOptions: CreateRoleOptions = {}
): Promise<Role[]> {
  const roles: Role[] = [];

  for (let i = 0; i < count; i++) {
    const roleOptions: CreateRoleOptions = {
      ...baseOptions,
    };
    // Ensure each role gets unique identifiers
    if (baseOptions.name) {
      roleOptions.name = `${baseOptions.name}_${i}`;
    }
    const role = await createTestRole(roleOptions);
    roles.push(role);
  }

  return roles;
}

/**
 * Create an inactive test role
 * Useful for testing deactivated role scenarios
 */
export async function createInactiveTestRole(options: CreateRoleOptions = {}): Promise<Role> {
  return createTestRole({
    ...options,
    isActive: false,
  });
}
