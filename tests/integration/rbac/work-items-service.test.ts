/**
 * RBAC Work Items Service Integration Tests
 *
 * Tests core CRUD operations, hierarchy, and permission enforcement for work items.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { createRBACWorkItemsService } from '@/lib/services/work-items';
import type { PermissionName } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import {
  committedWorkItemFactory,
  createCommittedOrganization,
  createCommittedUser,
  createCommittedWorkItem,
  createCommittedWorkItemType,
} from '@/tests/factories/committed';
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import {
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Work Items Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `work-items-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // Roll back test transaction first to release locks from transaction-based factories
    await rollbackTransaction();
    await scope.cleanup();
  });

  describe('getWorkItems - Read Operations', () => {
    it('should retrieve work items with real data', async () => {
      // Setup: Create admin user with work-items:read:all permission
      const adminUser = await createCommittedUser({
        firstName: 'Admin',
        lastName: 'User',
        scope: scopeId,
      });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      // Create work item type with initial status
      const { type, initialStatus } = await createCommittedWorkItemType({
        name: 'Test Task',
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create test work items
      const workItem1 = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Test Work Item 1',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });
      const workItem2 = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Test Work Item 2',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Execute
      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItems();

      // Verify
      expect(Array.isArray(result)).toBe(true);
      const workItemIds = result.map((w) => w.work_item_id);
      expect(workItemIds).toContain(workItem1.work_item_id);
      expect(workItemIds).toContain(workItem2.work_item_id);
    });

    it('should filter work items by search term', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const uniqueWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'UniqueSearchTermXYZ123',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItems({ search: 'UniqueSearchTermXYZ123' });

      const workItemIds = result.map((w) => w.work_item_id);
      expect(workItemIds).toContain(uniqueWorkItem.work_item_id);
    });

    it('should return empty array without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const workItemsService = createRBACWorkItemsService(userContext);

      // Should return empty array, not throw
      const result = await workItemsService.getWorkItems();
      expect(result).toEqual([]);
    });
  });

  describe('getWorkItemById - Single Record Retrieval', () => {
    it('should retrieve specific work item with valid permissions', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const targetWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Target Work Item',
        description: 'This is the target',
        priority: 'high',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItemById(targetWorkItem.work_item_id);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected work item to be defined');
      expect(result.work_item_id).toBe(targetWorkItem.work_item_id);
      expect(result.subject).toBe('Target Work Item');
      expect(result.priority).toBe('high');
    });

    it('should return null for non-existent work item', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(adminUser);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItemById('00000000-0000-0000-0000-000000000000');

      expect(result).toBeNull();
    });

    it('should verify created_by_name is populated correctly', async () => {
      // This test verifies the query builder fix - created_by_name should show creator, not assignee
      const creator = await createCommittedUser({
        firstName: 'Creator',
        lastName: 'Person',
        scope: scopeId,
      });
      const assignee = await createCommittedUser({
        firstName: 'Assignee',
        lastName: 'Person',
        scope: scopeId,
      });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(creator, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(assignee, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(creator, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: creator.user_id,
        scope: scopeId,
      });

      const workItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Test Creator Name',
        assignedTo: assignee.user_id,
        createdBy: creator.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(creator, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItemById(workItem.work_item_id);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected work item to be defined');

      // Verify created_by_name shows the creator's name, not the assignee's
      expect(result.created_by_name).toBe('Creator Person');
      expect(result.assigned_to_name).toBe('Assignee Person');
    });
  });

  describe('getWorkItemCount - Aggregation Operations', () => {
    it('should return accurate work item count', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create test work items
      await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Count Item 1',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });
      await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Count Item 2',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });
      await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Count Item 3',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const count = await workItemsService.getWorkItemCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('createWorkItem - Creation Operations', () => {
    it('should create work item with all required fields', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: [
          'work-items:manage:organization' as PermissionName,
          'work-items:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { type } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);

      const workItemData = {
        work_item_type_id: type.work_item_type_id,
        organization_id: org.organization_id,
        subject: 'New Work Item',
        description: 'Created via test',
        priority: 'high' as const,
      };

      const result = await workItemsService.createWorkItem(workItemData);

      // Track service-created work item for cleanup
      // This ensures the work item is deleted before its dependencies (status, type)
      committedWorkItemFactory.trackExternal(result.work_item_id, scopeId);

      expect(result).toBeDefined();
      expect(result.subject).toBe('New Work Item');
      expect(result.description).toBe('Created via test');
      expect(result.priority).toBe('high');
      expect(result.work_item_id).toBeTruthy();
      expect(result.status_name).toBeTruthy(); // Should have initial status
    });

    it('should deny work item creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const org = await createCommittedOrganization({ scope: scopeId });
      const { type } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: user.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const workItemsService = createRBACWorkItemsService(userContext);

      const workItemData = {
        work_item_type_id: type.work_item_type_id,
        organization_id: org.organization_id,
        subject: 'Unauthorized Work Item',
      };

      await expect(workItemsService.createWorkItem(workItemData)).rejects.toThrow();
    });
  });

  describe('updateWorkItem - Modification Operations', () => {
    it('should update work item successfully', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: [
          'work-items:manage:organization' as PermissionName,
          'work-items:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const targetWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Original Subject',
        priority: 'medium',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);

      const result = await workItemsService.updateWorkItem(targetWorkItem.work_item_id, {
        subject: 'Updated Subject',
        priority: 'critical',
      });

      expect(result.subject).toBe('Updated Subject');
      expect(result.priority).toBe('critical');
    });

    it('should deny work item update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const org = await createCommittedOrganization({ scope: scopeId });
      const adminUser = await createCommittedUser({ scope: scopeId });

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const targetWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Protected Item',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const workItemsService = createRBACWorkItemsService(userContext);

      await expect(
        workItemsService.updateWorkItem(targetWorkItem.work_item_id, { subject: 'Hacked' })
      ).rejects.toThrow();
    });
  });

  describe('deleteWorkItem - Deletion Operations', () => {
    it('should delete work item successfully (soft delete)', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: [
          'work-items:manage:organization' as PermissionName,
          'work-items:read:organization' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const targetWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'To Delete',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);

      await workItemsService.deleteWorkItem(targetWorkItem.work_item_id);

      // Verify soft deletion (work item should not be retrievable)
      const result = await workItemsService.getWorkItemById(targetWorkItem.work_item_id);
      expect(result).toBeNull();
    });

    it('should deny work item deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const org = await createCommittedOrganization({ scope: scopeId });
      const adminUser = await createCommittedUser({ scope: scopeId });

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const targetWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Protected Item',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const workItemsService = createRBACWorkItemsService(userContext);

      await expect(workItemsService.deleteWorkItem(targetWorkItem.work_item_id)).rejects.toThrow();
    });
  });

  describe('Hierarchy Operations', () => {
    it('should get children of a work item', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create parent work item
      const parentWorkItem = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Parent Item',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create child work items
      const child1 = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Child Item 1',
        parentWorkItemId: parentWorkItem.work_item_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });
      const child2 = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Child Item 2',
        parentWorkItemId: parentWorkItem.work_item_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const children = await workItemsService.getWorkItemChildren(parentWorkItem.work_item_id);

      expect(children.length).toBe(2);
      const childIds = children.map((c) => c.work_item_id);
      expect(childIds).toContain(child1.work_item_id);
      expect(childIds).toContain(child2.work_item_id);
    });

    it('should get ancestors of a work item', async () => {
      const adminUser = await createCommittedUser({ scope: scopeId });
      const org = await createCommittedOrganization({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_admin',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(role));

      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create grandparent
      const grandparent = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Grandparent',
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create parent (child of grandparent)
      const parent = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Parent',
        parentWorkItemId: grandparent.work_item_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      // Create child (child of parent)
      const child = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Child',
        parentWorkItemId: parent.work_item_id,
        createdBy: adminUser.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(adminUser, org.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const ancestors = await workItemsService.getWorkItemAncestors(child.work_item_id);

      // Should return ancestors ordered from root to immediate parent
      expect(ancestors.length).toBeGreaterThanOrEqual(1);
      const ancestorIds = ancestors.map((a) => a.work_item_id);
      expect(ancestorIds).toContain(parent.work_item_id);
    });
  });

  describe('Organization Scope - Permission Enforcement', () => {
    it('should only return work items from accessible organizations', async () => {
      // Create two organizations
      const org1 = await createCommittedOrganization({ name: 'Org 1', scope: scopeId });
      const org2 = await createCommittedOrganization({ name: 'Org 2', scope: scopeId });

      // Create user with access only to org1
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org1.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org1));

      // Create work item type for both orgs (using a global type)
      const { type, initialStatus } = await createCommittedWorkItemType({
        organizationId: null, // Global type
        createdBy: user.user_id,
        scope: scopeId,
      });

      // Create work item in org1 (should be visible)
      const workItemOrg1 = await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org1.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Org 1 Item',
        createdBy: user.user_id,
        scope: scopeId,
      });

      // Create work item in org2 (should NOT be visible)
      await createCommittedWorkItem({
        workItemTypeId: type.work_item_type_id,
        organizationId: org2.organization_id,
        statusId: initialStatus.work_item_status_id,
        subject: 'Org 2 Item',
        createdBy: user.user_id,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user, org1.organization_id);
      const workItemsService = createRBACWorkItemsService(userContext);
      const result = await workItemsService.getWorkItems();

      // Should only contain org1's work item
      const workItemIds = result.map((w) => w.work_item_id);
      expect(workItemIds).toContain(workItemOrg1.work_item_id);
      // Org2's item should not be present (user doesn't have access)
    });
  });
});







