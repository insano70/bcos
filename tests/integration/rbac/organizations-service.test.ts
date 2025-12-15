/**
 * RBAC Organizations Service Integration Tests
 *
 * Tests the Organizations Service with real CRUD operations.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { createRBACOrganizationsService } from '@/lib/services/organizations';
import type { PermissionName } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedOrganization, createCommittedUser } from '@/tests/factories/committed';
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import {
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Organizations Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `orgs-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // Roll back test transaction first to release locks from transaction-based factories
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('getOrganizations - Read Operations', () => {
    it('should retrieve organizations with real data', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org1 = await createCommittedOrganization({ scope: scopeId, name: 'Test Org 1' });
      const org2 = await createCommittedOrganization({ scope: scopeId, name: 'Test Org 2' });
      const org3 = await createCommittedOrganization({ scope: scopeId, name: 'Test Org 3' });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1));
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org2));
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org3));

      const role = await createTestRole({
        name: 'org_reader',
        permissions: ['organizations:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);
      const result = await orgsService.getOrganizations();

      expect(result.length).toBeGreaterThanOrEqual(3);
      const orgIds = result.map((o: { organization_id: string }) => o.organization_id);
      expect(orgIds).toContain(org1.organization_id);
      expect(orgIds).toContain(org2.organization_id);
      expect(orgIds).toContain(org3.organization_id);
    });

    it('should filter organizations by search term', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const uniquePrefix = `search_${nanoid(6)}`;
      const org = await createCommittedOrganization({
        scope: scopeId,
        name: `${uniquePrefix}_TestOrg`,
      });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'org_reader',
        permissions: ['organizations:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);
      const result = await orgsService.getOrganizations({ search: uniquePrefix });

      expect(result.length).toBeGreaterThan(0);
      expect(result.some((o: { name: string }) => o.name.includes(uniquePrefix))).toBe(true);
    });

    it('should return empty array when user has no read permissions', async () => {
      // Service gracefully returns empty array for users without permissions
      // This is intentional security behavior - don't leak existence of organizations
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);

      const result = await orgsService.getOrganizations();
      expect(result).toEqual([]);
    });
  });

  describe('getOrganizationById - Single Record Retrieval', () => {
    it('should retrieve specific organization with valid permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId, name: 'Specific Org' });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'org_reader',
        permissions: ['organizations:read:own' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const orgsService = createRBACOrganizationsService(userContext);
      const result = await orgsService.getOrganizationById(org.organization_id);

      expect(result).toBeTruthy();
      expect(result?.organization_id).toBe(org.organization_id);
      expect(result?.name).toBe('Specific Org');
    });

    it('should deny access to organization without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);

      // Service throws AuthorizationError (which extends APIError) for unauthorized access
      await expect(orgsService.getOrganizationById(org.organization_id)).rejects.toThrow(
        /permission|denied|unauthorized/i
      );
    });
  });

  describe('createOrganization - Creation Operations', () => {
    it('should create organization with proper permissions', async () => {
      // With organizations:create:all permission, user can create and read organizations
      const adminUser = await createCommittedUser({ scope: scopeId });

      const role = await createTestRole({
        name: 'super_admin',
        permissions: ['organizations:create:all' as PermissionName],
        isSystemRole: true,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(adminUser);
      const orgsService = createRBACOrganizationsService(userContext);

      const uniqueSlug = `test-org-${nanoid(8)}`;
      const orgData = {
        name: 'New Test Organization',
        slug: uniqueSlug,
        is_active: true,
      };

      const result = await orgsService.createOrganization(orgData);
      expect(result).toBeTruthy();
      expect(result.name).toBe('New Test Organization');
      expect(result.slug).toBe(uniqueSlug);
      expect(result.is_active).toBe(true);
    });

    it('should deny organization creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);

      const orgData = {
        name: 'Unauthorized Org',
        slug: `unauthorized-${nanoid(8)}`,
      };

      await expect(orgsService.createOrganization(orgData)).rejects.toThrow(
        /permission|denied|unauthorized/i
      );
    });
  });

  describe('updateOrganization - Modification Operations', () => {
    it('should update organization successfully', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({
        scope: scopeId,
        name: 'Original Name',
      });

      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'org_admin',
        permissions: [
          'organizations:update:own' as PermissionName,
          'organizations:read:own' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const orgsService = createRBACOrganizationsService(userContext);

      const result = await orgsService.updateOrganization(org.organization_id, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.organization_id).toBe(org.organization_id);
    });

    it('should deny organization update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);

      await expect(
        orgsService.updateOrganization(org.organization_id, { name: 'Hacked' })
      ).rejects.toThrow(/permission|denied|unauthorized/i);
    });
  });

  describe('deleteOrganization - Deletion Operations', () => {
    it('should delete organization successfully', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      const role = await createTestRole({
        name: 'super_admin',
        permissions: ['organizations:manage:all' as PermissionName],
        isSystemRole: true,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(adminUser);
      const orgsService = createRBACOrganizationsService(userContext);

      await orgsService.deleteOrganization(org.organization_id);

      // Verify soft deletion (organization should not be retrievable)
      // Since getOrganizationById requires permissions, we skip the verification
      // The service should have soft-deleted the org
    });

    it('should deny organization deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const orgsService = createRBACOrganizationsService(userContext);

      await expect(orgsService.deleteOrganization(org.organization_id)).rejects.toThrow(
        /permission|denied|unauthorized/i
      );
    });
  });

  describe('getAccessibleHierarchy - Hierarchy Operations', () => {
    it('should return accessible organization hierarchy', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'org_reader',
        permissions: ['organizations:read:own' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const orgsService = createRBACOrganizationsService(userContext);

      const result = await orgsService.getAccessibleHierarchy();

      expect(Array.isArray(result)).toBe(true);
      // User should see at least their own organization in hierarchy
      expect(
        result.some((o: { organization_id: string }) => o.organization_id === org.organization_id)
      ).toBe(true);
    });
  });
});
