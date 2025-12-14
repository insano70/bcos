/**
 * RBAC Work Item Attachments Service Integration Tests
 *
 * Tests RBAC permission enforcement and database operations for attachments.
 *
 * Note: S3 operations (upload URL generation, download URL, file deletion) require
 * real S3 infrastructure. These tests focus on permission checks which happen
 * before S3 operations, and database-only operations like getTotalAttachmentSize.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { work_item_attachments } from '@/lib/db/schema';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { createRBACWorkItemAttachmentsService } from '@/lib/services/rbac-work-item-attachments-service';
import type { PermissionName } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import {
  cleanupCommittedWorkItems,
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

describe('RBAC Work Item Attachments Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;

  beforeEach(() => {
    scopeId = `attachments-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
  });

  afterEach(async () => {
    // Clean up work items first (they have FK constraints to users)
    await cleanupCommittedWorkItems(scopeId);
    await rollbackTransaction();
    await scope.cleanup();
  });

  /**
   * Helper to create a work item with all required dependencies
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

  /**
   * Helper to insert a test attachment directly into the database
   * This bypasses S3 operations for testing database/RBAC operations
   */
  async function insertTestAttachment(options: {
    workItemId: string;
    uploadedBy: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
  }) {
    const [attachment] = await db
      .insert(work_item_attachments)
      .values({
        work_item_id: options.workItemId,
        uploaded_by: options.uploadedBy,
        file_name: options.fileName || `test-file-${nanoid(8)}.pdf`,
        file_size: options.fileSize || 1024,
        file_type: options.fileType || 'application/pdf',
        s3_key: `test-key-${nanoid(8)}`,
        s3_bucket: 'test-bucket',
      })
      .returning();

    return attachment;
  }

  describe('getAttachments - Read Operations', () => {
    it('should retrieve attachments for a work item with read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      // Insert test attachment directly (bypasses S3)
      const attachment = await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileName: 'test-document.pdf',
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const result = await attachmentsService.getAttachments({
        work_item_id: workItem.work_item_id,
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]?.work_item_attachment_id).toBe(attachment?.work_item_attachment_id);
      expect(result[0]?.file_name).toBe('test-document.pdf');
    });

    it('should include uploader information in attachments', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({
        firstName: 'Upload',
        lastName: 'User',
        scope: scopeId,
      });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const result = await attachmentsService.getAttachments({
        work_item_id: workItem.work_item_id,
      });

      expect(result[0]?.uploaded_by).toBe(user.user_id);
      expect(result[0]?.uploaded_by_name).toBe('Upload User');
    });

    it('should deny attachment retrieval without work-items:read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const workItemOwner = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(workItemOwner, mapDatabaseOrgToOrg(org));

      // User without permissions
      const unauthorizedUser = await createCommittedUser({ scope: scopeId });
      const noPermRole = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(unauthorizedUser, mapDatabaseRoleToRole(noPermRole));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: workItemOwner.user_id,
      });

      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: workItemOwner.user_id,
      });

      const userContext = await buildUserContext(unauthorizedUser);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      await expect(
        attachmentsService.getAttachments({ work_item_id: workItem.work_item_id })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getAttachmentById - Single Record Retrieval', () => {
    it('should retrieve specific attachment by ID', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const attachment = await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileName: 'specific-file.docx',
        fileSize: 2048,
        fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const result = await attachmentsService.getAttachmentById(
        attachment?.work_item_attachment_id ?? ''
      );

      expect(result).toBeDefined();
      expect(result?.file_name).toBe('specific-file.docx');
      expect(result?.file_size).toBe(2048);
      expect(result?.file_type).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('should return null for non-existent attachment', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const result = await attachmentsService.getAttachmentById(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(result).toBeNull();
    });
  });

  describe('createAttachment - Permission Checking', () => {
    it('should deny attachment creation without update permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const workItemOwner = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(workItemOwner, mapDatabaseOrgToOrg(org));

      // User with only read permissions
      const readOnlyUser = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(readOnlyUser, mapDatabaseOrgToOrg(org));

      const readRole = await createTestRole({
        name: 'read_only',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(readOnlyUser, mapDatabaseRoleToRole(readRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: workItemOwner.user_id,
      });

      const userContext = await buildUserContext(readOnlyUser, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      // Permission check happens before S3 operations, so this should fail immediately
      await expect(
        attachmentsService.createAttachment({
          work_item_id: workItem.work_item_id,
          file_name: 'test.pdf',
          file_size: 1024,
          file_type: 'application/pdf',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('should deny attachment creation for non-accessible work item', async () => {
      const org1 = await createCommittedOrganization({ scope: scopeId });
      const org2 = await createCommittedOrganization({ scope: scopeId });

      const org1User = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(org1User, mapDatabaseOrgToOrg(org1));

      const org2User = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(org2User, mapDatabaseOrgToOrg(org2));

      // org2User has update permission but only for org2
      const updateRole = await createTestRole({
        name: 'org2_updater',
        permissions: ['work-items:update:organization' as PermissionName],
        organizationId: org2.organization_id,
      });
      await assignRoleToUser(org2User, mapDatabaseRoleToRole(updateRole), mapDatabaseOrgToOrg(org2));

      // Create work item in org1
      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org1.organization_id,
        createdBy: org1User.user_id,
      });

      // org2User tries to create attachment on org1's work item
      const userContext = await buildUserContext(org2User, org2.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      await expect(
        attachmentsService.createAttachment({
          work_item_id: workItem.work_item_id,
          file_name: 'test.pdf',
          file_size: 1024,
          file_type: 'application/pdf',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getTotalAttachmentSize - Aggregation Operations', () => {
    it('should calculate total attachment size for a work item', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      // Insert multiple attachments with different sizes
      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileSize: 1000,
      });
      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileSize: 2500,
      });
      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileSize: 500,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const totalSize = await attachmentsService.getTotalAttachmentSize(workItem.work_item_id);

      expect(totalSize).toBe(4000); // 1000 + 2500 + 500
    });

    it('should return 0 for work item with no attachments', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const totalSize = await attachmentsService.getTotalAttachmentSize(workItem.work_item_id);

      expect(totalSize).toBe(0);
    });

    it('should deny total size calculation without read permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const workItemOwner = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(workItemOwner, mapDatabaseOrgToOrg(org));

      const unauthorizedUser = await createCommittedUser({ scope: scopeId });
      const noPermRole = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(unauthorizedUser, mapDatabaseRoleToRole(noPermRole));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: workItemOwner.user_id,
      });

      const userContext = await buildUserContext(unauthorizedUser);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      await expect(
        attachmentsService.getTotalAttachmentSize(workItem.work_item_id)
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('deleteAttachment - Permission Checking', () => {
    it('should deny deletion without update permission', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const workItemOwner = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(workItemOwner, mapDatabaseOrgToOrg(org));

      const readOnlyUser = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(readOnlyUser, mapDatabaseOrgToOrg(org));

      const readRole = await createTestRole({
        name: 'read_only',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(readOnlyUser, mapDatabaseRoleToRole(readRole), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: workItemOwner.user_id,
      });

      const attachment = await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: workItemOwner.user_id,
      });

      const userContext = await buildUserContext(readOnlyUser, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      // Permission check happens before S3 deletion, so this should fail immediately
      await expect(
        attachmentsService.deleteAttachment(attachment?.work_item_attachment_id ?? '')
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('Attachment Metadata', () => {
    it('should store and return correct file metadata', async () => {
      const org = await createCommittedOrganization({ scope: scopeId });
      const user = await createCommittedUser({ scope: scopeId });
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'work_item_reader',
        permissions: ['work-items:read:organization' as PermissionName],
        organizationId: org.organization_id,
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const { workItem } = await createTestWorkItemWithDeps({
        organizationId: org.organization_id,
        createdBy: user.user_id,
      });

      // Insert attachment with specific metadata
      const testFileName = `report-${nanoid(8)}.xlsx`;
      const testFileSize = 52428800; // 50MB
      const testFileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      await insertTestAttachment({
        workItemId: workItem.work_item_id,
        uploadedBy: user.user_id,
        fileName: testFileName,
        fileSize: testFileSize,
        fileType: testFileType,
      });

      const userContext = await buildUserContext(user, org.organization_id);
      const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

      const result = await attachmentsService.getAttachments({
        work_item_id: workItem.work_item_id,
      });

      expect(result[0]?.file_name).toBe(testFileName);
      expect(result[0]?.file_size).toBe(testFileSize);
      expect(result[0]?.file_type).toBe(testFileType);
      expect(result[0]?.uploaded_at).toBeInstanceOf(Date);
    });
  });
});
