/**
 * RBAC Work Item Comments Service Integration Tests
 *
 * Tests core CRUD operations and permission enforcement for work item comments.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { createRBACWorkItemCommentsService } from '@/lib/services/rbac-work-item-comments-service';
import type { PermissionName } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedOrganization, createCommittedUser } from '@/tests/factories/committed';
import {
  cleanupCommittedWorkItems,
  createCommittedWorkItem,
  createCommittedWorkItemType,
} from '@/tests/factories/committed/work-item-factory';
import { assignUserToOrganization } from '@/tests/helpers/committed-rbac-helper';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import {
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Work Item Comments Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `comments-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // Clean up work items first (they have FK constraints to users)
    await cleanupCommittedWorkItems(scopeId);
    await rollbackTransaction();
    await scope.cleanup();
  });

  /**
   * Helper to create test work item with required dependencies
   */
  async function createTestWorkItemWithDeps(options: {
    organizationId: string;
    createdBy: string;
    subject?: string;
  }) {
    const { type, initialStatus } = await createCommittedWorkItemType({
      organizationId: options.organizationId,
      scope: scopeId,
    });

    const workItem = await createCommittedWorkItem({
      workItemTypeId: type.work_item_type_id,
      organizationId: options.organizationId,
      statusId: initialStatus.work_item_status_id,
      createdBy: options.createdBy,
      subject: options.subject || `Test Work Item ${nanoid(8)}`,
      scope: scopeId,
    });

    return { workItem, type, initialStatus };
  }

  describe('getComments - Read Operations', () => {
    it('should retrieve comments for a work item with read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_reader_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      // Create a comment first
      await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Test comment',
      });

      const comments = await commentsService.getComments({
        work_item_id: workItem.work_item_id,
      });

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThanOrEqual(1);
      expect(comments[0]?.comment_text).toBe('Test comment');
    });

    it('should include author information in comments', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({
        firstName: 'Comment',
        lastName: 'Author',
        scope: scopeId,
      });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_reader_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Comment with author',
      });

      const comments = await commentsService.getComments({
        work_item_id: workItem.work_item_id,
      });

      expect(comments[0]?.created_by).toBe(user.user_id);
      expect(comments[0]?.created_by_name).toBe('Comment Author');
    });

    it('should deny comment retrieval without work-items:read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const adminUser = await createCommittedUser({ scope: scopeId });
      const noPermUser = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(noPermUser, mapDatabaseOrgToOrg(org));

      // Admin creates work item
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
      });

      // User without permissions
      const noPermRole = await createTestRole({
        name: `no_perm_${nanoid(8)}`,
        permissions: [],
      });
      await assignRoleToUser(noPermUser, mapDatabaseRoleToRole(noPermRole));

      const userContext = await buildUserContext(noPermUser, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      await expect(
        commentsService.getComments({ work_item_id: workItem.work_item_id })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('createComment - Creation Operations', () => {
    it('should create comment with content', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      const comment = await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'This is a new comment',
      });

      expect(comment).toBeDefined();
      expect(comment.comment_text).toBe('This is a new comment');
      expect(comment.work_item_id).toBe(workItem.work_item_id);
      expect(comment.created_by).toBe(user.user_id);
      expect(comment.work_item_comment_id).toBeTruthy();
    });

    it('should record author and timestamp on creation', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const beforeCreate = new Date();
      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      const comment = await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Comment with timestamp',
      });

      expect(comment.created_by).toBe(user.user_id);
      expect(comment.created_at).toBeInstanceOf(Date);
      expect(comment.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime() - 1000);
    });

    it('should deny comment creation without read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const adminUser = await createCommittedUser({ scope: scopeId });
      const noPermUser = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(adminUser, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(noPermUser, mapDatabaseOrgToOrg(org));

      // Admin creates work item
      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(adminUser, mapDatabaseRoleToRole(adminRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: adminUser.user_id,
      });

      // User without permissions
      const noPermRole = await createTestRole({
        name: `no_perm_${nanoid(8)}`,
        permissions: [],
      });
      await assignRoleToUser(noPermUser, mapDatabaseRoleToRole(noPermRole));

      const userContext = await buildUserContext(noPermUser, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      await expect(
        commentsService.createComment({
          work_item_id: workItem.work_item_id,
          comment_text: 'Unauthorized comment',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('updateComment - Modification Operations', () => {
    it('should update own comment content', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      const comment = await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Original comment',
      });

      const updated = await commentsService.updateComment(comment.work_item_comment_id, {
        comment_text: 'Updated comment',
      });

      expect(updated.comment_text).toBe('Updated comment');
      expect(updated.work_item_comment_id).toBe(comment.work_item_comment_id);
    });

    it('should deny update of others\' comments without admin permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const author = await createCommittedUser({ scope: scopeId });
      const otherUser = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(author, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(otherUser, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(author, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));
      await assignRoleToUser(otherUser, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: author.user_id,
      });

      // Author creates comment
      const authorContext = await buildUserContext(author, org.organization_id);
      const authorCommentsService = createRBACWorkItemCommentsService(authorContext);
      const comment = await authorCommentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Author\'s comment',
      });

      // Other user tries to update
      const otherContext = await buildUserContext(otherUser, org.organization_id);
      const otherCommentsService = createRBACWorkItemCommentsService(otherContext);

      await expect(
        otherCommentsService.updateComment(comment.work_item_comment_id, {
          comment_text: 'Hacked comment',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('should allow admin to update any comment', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const author = await createCommittedUser({ scope: scopeId });
      const admin = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(author, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(admin, mapDatabaseOrgToOrg(org));

      const userRole = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(author, mapDatabaseRoleToRole(userRole), mapDatabaseOrgToOrg(org));

      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: [
          'work-items:read:organization' as PermissionName,
          'work-items:manage:all' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(admin, mapDatabaseRoleToRole(adminRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: author.user_id,
      });

      // Author creates comment
      const authorContext = await buildUserContext(author, org.organization_id);
      const authorCommentsService = createRBACWorkItemCommentsService(authorContext);
      const comment = await authorCommentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Original comment',
      });

      // Admin updates comment
      const adminContext = await buildUserContext(admin, org.organization_id);
      const adminCommentsService = createRBACWorkItemCommentsService(adminContext);
      const updated = await adminCommentsService.updateComment(comment.work_item_comment_id, {
        comment_text: 'Admin updated comment',
      });

      expect(updated.comment_text).toBe('Admin updated comment');
    });
  });

  describe('deleteComment - Deletion Operations', () => {
    it('should delete own comment', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const commentsService = createRBACWorkItemCommentsService(userContext);

      const comment = await commentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Comment to delete',
      });

      await commentsService.deleteComment(comment.work_item_comment_id);

      // Verify deletion (soft delete - comment should not appear in list)
      const comments = await commentsService.getComments({
        work_item_id: workItem.work_item_id,
      });
      const deletedComment = comments.find(
        (c) => c.work_item_comment_id === comment.work_item_comment_id
      );
      expect(deletedComment).toBeUndefined();
    });

    it('should allow admin to delete any comment', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const author = await createCommittedUser({ scope: scopeId });
      const admin = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(author, mapDatabaseOrgToOrg(org));
      await assignUserToOrganization(admin, mapDatabaseOrgToOrg(org));

      const userRole = await createTestRole({
        name: `work_item_user_${nanoid(8)}`,
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(author, mapDatabaseRoleToRole(userRole), mapDatabaseOrgToOrg(org));

      const adminRole = await createTestRole({
        name: `admin_${nanoid(8)}`,
        permissions: [
          'work-items:read:organization' as PermissionName,
          'work-items:manage:all' as PermissionName,
        ],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(admin, mapDatabaseRoleToRole(adminRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: author.user_id,
      });

      // Author creates comment
      const authorContext = await buildUserContext(author, org.organization_id);
      const authorCommentsService = createRBACWorkItemCommentsService(authorContext);
      const comment = await authorCommentsService.createComment({
        work_item_id: workItem.work_item_id,
        comment_text: 'Comment by author',
      });

      // Admin deletes comment
      const adminContext = await buildUserContext(admin, org.organization_id);
      const adminCommentsService = createRBACWorkItemCommentsService(adminContext);
      await adminCommentsService.deleteComment(comment.work_item_comment_id);

      // Verify deletion
      const comments = await adminCommentsService.getComments({
        work_item_id: workItem.work_item_id,
      });
      const deletedComment = comments.find(
        (c) => c.work_item_comment_id === comment.work_item_comment_id
      );
      expect(deletedComment).toBeUndefined();
    });
  });
});
