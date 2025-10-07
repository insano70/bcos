/**
 * RBAC Practices Service Integration Tests
 * Tests practice permission enforcement with RBAC
 *
 * Following the pattern from tests/integration/rbac/charts-service.test.ts
 *
 * NOTE: These tests focus on RBAC permission enforcement.
 * Full CRUD testing requires the service to use the test transaction,
 * which is a future architecture improvement.
 */

import { describe, it, expect } from 'vitest';
import '@/tests/setup/integration-setup';
import {
  createTestUser,
  createTestRole,
  assignRoleToUser
} from '@/tests/factories';
import { mapDatabaseRoleToRole, buildUserContext } from '@/tests/helpers/rbac-helper';
import { createRBACPracticesService } from '@/lib/services/rbac-practices-service';
import type { PermissionName } from '@/lib/types/rbac';

describe('RBAC Practices Service - Permission Enforcement', () => {
  describe('getPractices', () => {
    it('should allow listing practices with practices:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_admin',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should not throw error
      const practices = await practicesService.getPractices({});
      expect(Array.isArray(practices)).toBe(true);
    });

    it('should allow listing practices with practices:read:own permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_owner',
        permissions: ['practices:read:own' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should not throw error
      const practices = await practicesService.getPractices({});
      expect(Array.isArray(practices)).toBe(true);
    });

    it('should return empty array without any read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_practice_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const practices = await practicesService.getPractices({});
      expect(practices).toEqual([]);
    });

    it('should support pagination parameters', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_admin',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should not throw error with pagination
      const practices = await practicesService.getPractices({ limit: 10, offset: 0 });
      expect(Array.isArray(practices)).toBe(true);
    });

    it('should support status filter parameters', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_admin',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should not throw error with status filter
      const practices = await practicesService.getPractices({ status: 'active' });
      expect(Array.isArray(practices)).toBe(true);
    });
  });

  describe('getPracticeById', () => {
    it('should deny retrieving practice without read permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_practice_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should return null since user has no read permission (empty array from getPractices logic)
      const practice = await practicesService.getPracticeById('00000000-0000-0000-0000-000000000000');
      expect(practice).toBeNull();
    });
  });

  describe('getPracticeCount', () => {
    it('should allow counting practices with practices:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_admin',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const count = await practicesService.getPracticeCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should allow counting practices with practices:read:own permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_owner',
        permissions: ['practices:read:own' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const count = await practicesService.getPracticeCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 without read permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_practice_access',
        permissions: []
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const count = await practicesService.getPracticeCount();
      expect(count).toBe(0);
    });

    it('should support status filter in count', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_admin',
        permissions: ['practices:read:all' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      // Should not throw error with status filter
      const count = await practicesService.getPracticeCount({ status: 'active' });
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createPractice', () => {
    it('should deny creating practice without practices:create:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_reader',
        permissions: ['practices:read:own' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const practiceData = {
        name: 'Test Practice',
        domain: `test-${Date.now()}.local`,
        template_id: '00000000-0000-0000-0000-000000000000'
      };

      await expect(practicesService.createPractice(practiceData)).rejects.toThrow('Access denied');
    });
  });

  describe('updatePractice', () => {
    it('should deny updating practice without update permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_reader',
        permissions: ['practices:read:own' as PermissionName]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      const updateData = { name: 'Attempted Update' };

      await expect(
        practicesService.updatePractice('00000000-0000-0000-0000-000000000000', updateData)
      ).rejects.toThrow('Access denied');
    });
  });

  describe('deletePractice', () => {
    it('should deny deleting practice for non-super-admin', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'practice_owner',
        permissions: [
          'practices:read:own' as PermissionName,
          'practices:update:own' as PermissionName
        ]
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const practicesService = createRBACPracticesService(userContext);

      await expect(
        practicesService.deletePractice('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Only super administrators');
    });
  });
});
