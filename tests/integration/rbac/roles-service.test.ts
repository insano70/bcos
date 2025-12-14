/**
 * RBAC Roles Service Integration Tests
 *
 * Tests core read operations and permission enforcement for roles.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { createRBACRolesService } from '@/lib/services/rbac-roles-service';
import type { PermissionName } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedRole } from '@/tests/factories/committed/role-factory';
import { createCommittedOrganization, createCommittedUser } from '@/tests/factories/committed';
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import {
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Roles Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `roles-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // Roll back test transaction first to release locks from transaction-based factories
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('getRoles - Read Operations', () => {
    it('should retrieve roles with permissions when user has read:all permission', async () => {
      const adminUser = await createCommittedUser({
        firstName: 'Admin',
        lastName: 'User',
        scope: scopeId,
      });

      // Create role with read:all permission
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      // Create test roles with permissions
      const uniqueSearchTerm = `TestRole_${nanoid(8)}`;
      const testRole = await createCommittedRole({
        name: `${uniqueSearchTerm}_editor`,
        description: 'Test editor role',
        permissionNames: ['charts:read:all', 'charts:manage:all'],
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoles({ search: uniqueSearchTerm });

      expect(Array.isArray(result)).toBe(true);
      const roleIds = result.map((r) => r.role_id);
      expect(roleIds).toContain(testRole.role_id);

      // Verify permissions are included
      const foundRole = result.find((r) => r.role_id === testRole.role_id);
      expect(foundRole).toBeDefined();
      expect(foundRole?.permissions).toBeDefined();
      expect(Array.isArray(foundRole?.permissions)).toBe(true);
      expect(foundRole?.permissions.length).toBeGreaterThan(0);
    });

    it('should filter roles by search term', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const uniqueSearchTerm = `UniqueRoleName_${nanoid(8)}`;
      await createCommittedRole({
        name: uniqueSearchTerm,
        description: 'A unique test role',
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoles({ search: uniqueSearchTerm });

      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe(uniqueSearchTerm);
    });

    it('should filter roles by active status', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const uniqueSearchTerm = `StatusTest_${nanoid(8)}`;
      await createCommittedRole({
        name: `${uniqueSearchTerm}_active`,
        isActive: true,
        scope: scopeId,
      });
      await createCommittedRole({
        name: `${uniqueSearchTerm}_inactive`,
        isActive: false,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);

      // Get only active roles
      const activeRoles = await rolesService.getRoles({
        search: uniqueSearchTerm,
        is_active: true,
      });
      expect(activeRoles.length).toBe(1);
      expect(activeRoles[0]?.name).toBe(`${uniqueSearchTerm}_active`);

      // Get only inactive roles
      const inactiveRoles = await rolesService.getRoles({
        search: uniqueSearchTerm,
        is_active: false,
      });
      expect(inactiveRoles.length).toBe(1);
      expect(inactiveRoles[0]?.name).toBe(`${uniqueSearchTerm}_inactive`);
    });

    it('should return empty array when user has no role permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: `no_perms_${nanoid(8)}`,
        permissions: [], // No role permissions
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoles();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should return organization and system roles with organization scope', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      // Create role with organization read permission
      const orgReaderRole = await createTestRole({
        name: `org_reader_${nanoid(8)}`,
        permissions: ['roles:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(orgReaderRole), mapDatabaseOrgToOrg(org));

      const uniqueSearchTerm = `OrgScopeTest_${nanoid(8)}`;

      // Create organization-scoped role
      const orgRole = await createCommittedRole({
        name: `${uniqueSearchTerm}_org`,
        organizationId: org.organization_id,
        scope: scopeId,
      });

      // Create system role
      const systemRole = await createCommittedRole({
        name: `${uniqueSearchTerm}_system`,
        isSystemRole: true,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoles({ search: uniqueSearchTerm });

      const roleIds = result.map((r) => r.role_id);
      expect(roleIds).toContain(orgRole.role_id);
      expect(roleIds).toContain(systemRole.role_id);
    });
  });

  describe('getRoleById - Single Record Retrieval', () => {
    it('should retrieve specific role with permissions', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const targetRole = await createCommittedRole({
        name: `target_role_${nanoid(8)}`,
        description: 'Role to retrieve',
        permissionNames: ['users:read:all', 'users:update:all'],
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoleById(targetRole.role_id);

      expect(result).toBeDefined();
      expect(result?.role_id).toBe(targetRole.role_id);
      expect(result?.name).toBe(targetRole.name);
      expect(result?.description).toBe('Role to retrieve');
      expect(result?.permissions).toHaveLength(2);

      const permNames = result?.permissions.map((p) => p.name);
      expect(permNames).toContain('users:read:all');
      expect(permNames).toContain('users:update:all');
    });

    it('should throw NotFoundError for non-existent role', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);

      await expect(
        rolesService.getRoleById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Role not found');
    });

    it('should throw NotFoundError when user lacks access to role', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      // User has organization-scoped read permission
      const orgReaderRole = await createTestRole({
        name: `org_reader_${nanoid(8)}`,
        permissions: ['roles:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(orgReaderRole), mapDatabaseOrgToOrg(org));

      // Create a different organization
      const otherOrg = await createCommittedOrganization({
        name: 'Other Org',
        scope: scopeId,
      });

      // Create role in the other organization (user should not have access)
      const otherOrgRole = await createCommittedRole({
        name: `other_org_role_${nanoid(8)}`,
        organizationId: otherOrg.organization_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const rolesService = createRBACRolesService(userContext);

      // User should not be able to access role from other organization
      await expect(rolesService.getRoleById(otherOrgRole.role_id)).rejects.toThrow(
        'Role not found'
      );
    });

    it('should allow access to system roles with organization scope', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const orgReaderRole = await createTestRole({
        name: `org_reader_${nanoid(8)}`,
        permissions: ['roles:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(orgReaderRole), mapDatabaseOrgToOrg(org));

      // Create a system role (should be accessible from any org)
      const systemRole = await createCommittedRole({
        name: `system_role_${nanoid(8)}`,
        isSystemRole: true,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoleById(systemRole.role_id);

      expect(result).toBeDefined();
      expect(result?.role_id).toBe(systemRole.role_id);
      expect(result?.is_system_role).toBe(true);
    });
  });

  describe('getRoleCount - Aggregation Operations', () => {
    it('should return accurate role count with read:all permission', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      // Create test roles
      await createCommittedRole({ name: `count_role_1_${nanoid(8)}`, scope: scopeId });
      await createCommittedRole({ name: `count_role_2_${nanoid(8)}`, scope: scopeId });
      await createCommittedRole({ name: `count_role_3_${nanoid(8)}`, scope: scopeId });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const count = await rolesService.getRoleCount();

      expect(typeof count).toBe('number');
      // At least 3 test roles + admin role + any seed roles
      expect(count).toBeGreaterThanOrEqual(4);
    });

    it('should return zero when user has no role permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: `no_perms_${nanoid(8)}`,
        permissions: [], // No role permissions
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const rolesService = createRBACRolesService(userContext);
      const count = await rolesService.getRoleCount();

      expect(count).toBe(0);
    });

    it('should count only accessible roles with organization scope', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const orgReaderRole = await createTestRole({
        name: `org_reader_${nanoid(8)}`,
        permissions: ['roles:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(orgReaderRole), mapDatabaseOrgToOrg(org));

      // Create roles in user's organization
      await createCommittedRole({
        name: `org_role_1_${nanoid(8)}`,
        organizationId: org.organization_id,
        scope: scopeId,
      });
      await createCommittedRole({
        name: `org_role_2_${nanoid(8)}`,
        organizationId: org.organization_id,
        scope: scopeId,
      });

      // Create role in different organization (should not be counted)
      const otherOrg = await createCommittedOrganization({ scope: scopeId });
      await createCommittedRole({
        name: `other_org_role_${nanoid(8)}`,
        organizationId: otherOrg.organization_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const rolesService = createRBACRolesService(userContext);
      const count = await rolesService.getRoleCount();

      // Count should include org roles + system roles, but not other org's roles
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(2); // At least our 2 org roles
    });
  });

  describe('Permission Binding Verification', () => {
    it('should return roles with all associated permissions', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const uniqueSearchTerm = `MultiPerm_${nanoid(8)}`;
      const multiPermRole = await createCommittedRole({
        name: uniqueSearchTerm,
        permissionNames: [
          'charts:read:all',
          'charts:manage:all',
          'dashboards:read:all',
          'dashboards:manage:all',
        ],
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoleById(multiPermRole.role_id);

      expect(result).toBeDefined();
      expect(result?.permissions).toHaveLength(4);

      const permNames = result?.permissions.map((p) => p.name) ?? [];
      expect(permNames).toContain('charts:read:all');
      expect(permNames).toContain('charts:manage:all');
      expect(permNames).toContain('dashboards:read:all');
      expect(permNames).toContain('dashboards:manage:all');

      // Verify permission structure
      const chartPerm = result?.permissions.find((p) => p.name === 'charts:read:all');
      expect(chartPerm?.resource).toBe('charts');
      expect(chartPerm?.action).toBe('read');
      expect(chartPerm?.scope).toBe('all');
    });

    it('should return role with empty permissions array when no permissions assigned', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['roles:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole));

      const noPermRole = await createCommittedRole({
        name: `no_perm_role_${nanoid(8)}`,
        permissionNames: [], // No permissions
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser);
      const rolesService = createRBACRolesService(userContext);
      const result = await rolesService.getRoleById(noPermRole.role_id);

      expect(result).toBeDefined();
      expect(result?.permissions).toBeDefined();
      expect(result?.permissions).toHaveLength(0);
    });
  });
});
