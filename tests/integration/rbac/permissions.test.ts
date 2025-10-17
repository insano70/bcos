import { describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup'; // Import integration setup for database access
import {
  assignRoleToUser,
  assignUserToOrganization,
  createTestOrganization,
  createTestPractice,
  createTestRole,
  createTestUser,
  testUserPermission,
} from '@/tests/factories';
import { mapDatabaseOrgToOrg, mapDatabaseRoleToRole } from '@/tests/helpers/rbac-helper';

/**
 * Comprehensive RBAC Permission Test Suite
 *
 * Tests every permission in the system with both positive and negative cases.
 * Ensures permissions work correctly across different scopes (own, organization, all).
 */

describe('RBAC Permission System', () => {
  // ===== USER PERMISSIONS =====

  describe('User Permissions', () => {
    describe('users:read:own', () => {
      it('should allow reading own profile', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'user_reader',
          permissions: ['users:read:own'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'users:read:own');
        expect(result.granted).toBe(true);
      });

      it('should deny reading own profile without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'users:read:own');
        expect(result.granted).toBe(false);
      });
    });

    describe('users:update:own', () => {
      it('should allow updating own profile', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'user_updater',
          permissions: ['users:update:own'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'users:update:own');
        expect(result.granted).toBe(true);
      });

      it('should deny updating own profile without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'users:update:own');
        expect(result.granted).toBe(false);
      });
    });

    describe('users:read:organization', () => {
      it('should allow reading users in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'org_user_reader',
          organizationId: org.organization_id,
          permissions: ['users:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading users in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });

      it('should deny reading users in different organization', async () => {
        const user = await createTestUser();
        const org1 = await createTestOrganization();
        const org2 = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1));

        const role = await createTestRole({
          name: 'org1_user_reader',
          organizationId: org1.organization_id,
          permissions: ['users:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org1));

        const result = await testUserPermission(
          user,
          'users:read:organization',
          undefined,
          org2.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('users:create:organization', () => {
      it('should allow creating users in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'org_user_creator',
          organizationId: org.organization_id,
          permissions: ['users:create:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:create:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny creating users in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:create:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('users:update:organization', () => {
      it('should allow updating users in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'org_user_updater',
          organizationId: org.organization_id,
          permissions: ['users:update:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny updating users in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('users:delete:organization', () => {
      it('should allow deleting users in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'org_user_deleter',
          organizationId: org.organization_id,
          permissions: ['users:delete:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:delete:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny deleting users in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'users:delete:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('users:read:all', () => {
      it('should allow reading all users (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'super_admin',
          isSystemRole: true,
          permissions: ['users:read:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'users:read:all');
        expect(result.granted).toBe(true);
      });

      it('should deny reading all users without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'users:read:all');
        expect(result.granted).toBe(false);
      });
    });

    describe('users:manage:all', () => {
      it('should allow managing all users (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'user_manager',
          isSystemRole: true,
          permissions: ['users:manage:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'users:manage:all');
        expect(result.granted).toBe(true);
      });

      it('should deny managing all users without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'users:manage:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== PRACTICE PERMISSIONS =====

  describe('Practice Permissions', () => {
    describe('practices:read:own', () => {
      it('should allow reading own practice', async () => {
        const user = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user.user_id });

        const role = await createTestRole({
          name: 'practice_reader',
          permissions: ['practices:read:own'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'practices:read:own', practice.practice_id);
        expect(result.granted).toBe(true);
      });

      it('should deny reading practice owned by different user', async () => {
        const user1 = await createTestUser();
        const user2 = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user2.user_id });

        const role = await createTestRole({
          name: 'practice_reader',
          permissions: ['practices:read:own'],
        });
        await assignRoleToUser(user1, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user1, 'practices:read:own', practice.practice_id);
        expect(result.granted).toBe(false);
      });
    });

    describe('practices:update:own', () => {
      it('should allow updating own practice', async () => {
        const user = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user.user_id });

        const role = await createTestRole({
          name: 'practice_updater',
          permissions: ['practices:update:own'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'practices:update:own', practice.practice_id);
        expect(result.granted).toBe(true);
      });

      it('should deny updating practice owned by different user', async () => {
        const user1 = await createTestUser();
        const user2 = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user2.user_id });

        const role = await createTestRole({
          name: 'practice_updater',
          permissions: ['practices:update:own'],
        });
        await assignRoleToUser(user1, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(
          user1,
          'practices:update:own',
          practice.practice_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('practices:staff:manage:own', () => {
      it('should allow managing staff in own practice', async () => {
        const user = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user.user_id });

        const role = await createTestRole({
          name: 'practice_staff_manager',
          permissions: ['practices:staff:manage:own'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(
          user,
          'practices:staff:manage:own',
          practice.practice_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny managing staff in practice owned by different user', async () => {
        const user1 = await createTestUser();
        const user2 = await createTestUser();
        const practice = await createTestPractice({ ownerUserId: user2.user_id });

        const role = await createTestRole({
          name: 'practice_staff_manager',
          permissions: ['practices:staff:manage:own'],
        });
        await assignRoleToUser(user1, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(
          user1,
          'practices:staff:manage:own',
          practice.practice_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('practices:create:all', () => {
      it('should allow creating practices (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'practice_creator',
          isSystemRole: true,
          permissions: ['practices:create:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'practices:create:all');
        expect(result.granted).toBe(true);
      });

      it('should deny creating practices without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'practices:create:all');
        expect(result.granted).toBe(false);
      });
    });

    describe('practices:read:all', () => {
      it('should allow reading all practices (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'practice_reader_all',
          isSystemRole: true,
          permissions: ['practices:read:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'practices:read:all');
        expect(result.granted).toBe(true);
      });

      it('should deny reading all practices without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'practices:read:all');
        expect(result.granted).toBe(false);
      });
    });

    describe('practices:manage:all', () => {
      it('should allow managing all practices (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'practice_manager_all',
          isSystemRole: true,
          permissions: ['practices:manage:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'practices:manage:all');
        expect(result.granted).toBe(true);
      });

      it('should deny managing all practices without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'practices:manage:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== ANALYTICS PERMISSIONS =====

  describe('Analytics Permissions', () => {
    describe('analytics:read:organization', () => {
      it('should allow reading analytics in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'analytics_reader',
          organizationId: org.organization_id,
          permissions: ['analytics:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'analytics:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading analytics in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'analytics:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('analytics:export:organization', () => {
      it('should allow exporting analytics in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'analytics_exporter',
          organizationId: org.organization_id,
          permissions: ['analytics:export:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'analytics:export:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny exporting analytics in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'analytics:export:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('analytics:read:all', () => {
      it('should allow reading all analytics (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'analytics_reader_all',
          isSystemRole: true,
          permissions: ['analytics:read:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'analytics:read:all');
        expect(result.granted).toBe(true);
      });

      it('should deny reading all analytics without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'analytics:read:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== ROLE PERMISSIONS =====

  describe('Role Permissions', () => {
    describe('roles:read:organization', () => {
      it('should allow reading roles in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'role_reader',
          organizationId: org.organization_id,
          permissions: ['roles:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading roles in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('roles:create:organization', () => {
      it('should allow creating roles in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'role_creator',
          organizationId: org.organization_id,
          permissions: ['roles:create:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:create:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny creating roles in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:create:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('roles:update:organization', () => {
      it('should allow updating roles in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'role_updater',
          organizationId: org.organization_id,
          permissions: ['roles:update:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny updating roles in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('roles:delete:organization', () => {
      it('should allow deleting roles in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'role_deleter',
          organizationId: org.organization_id,
          permissions: ['roles:delete:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:delete:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny deleting roles in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'roles:delete:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('roles:manage:all', () => {
      it('should allow managing all roles (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'role_manager_all',
          isSystemRole: true,
          permissions: ['roles:manage:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'roles:manage:all');
        expect(result.granted).toBe(true);
      });

      it('should deny managing all roles without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'roles:manage:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== SETTINGS PERMISSIONS =====

  describe('Settings Permissions', () => {
    describe('settings:read:organization', () => {
      it('should allow reading settings in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'settings_reader',
          organizationId: org.organization_id,
          permissions: ['settings:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'settings:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading settings in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'settings:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('settings:update:organization', () => {
      it('should allow updating settings in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'settings_updater',
          organizationId: org.organization_id,
          permissions: ['settings:update:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'settings:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny updating settings in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'settings:update:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('settings:read:all', () => {
      it('should allow reading all settings (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'settings_reader_all',
          isSystemRole: true,
          permissions: ['settings:read:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'settings:read:all');
        expect(result.granted).toBe(true);
      });

      it('should deny reading all settings without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'settings:read:all');
        expect(result.granted).toBe(false);
      });
    });

    describe('settings:update:all', () => {
      it('should allow updating all settings (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'settings_updater_all',
          isSystemRole: true,
          permissions: ['settings:update:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'settings:update:all');
        expect(result.granted).toBe(true);
      });

      it('should deny updating all settings without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'settings:update:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== TEMPLATE PERMISSIONS =====

  describe('Template Permissions', () => {
    describe('templates:read:organization', () => {
      it('should allow reading templates in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'template_reader',
          organizationId: org.organization_id,
          permissions: ['templates:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'templates:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading templates in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'templates:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('templates:manage:all', () => {
      it('should allow managing all templates (super admin)', async () => {
        const user = await createTestUser();
        const role = await createTestRole({
          name: 'template_manager',
          isSystemRole: true,
          permissions: ['templates:manage:all'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role));

        const result = await testUserPermission(user, 'templates:manage:all');
        expect(result.granted).toBe(true);
      });

      it('should deny managing all templates without permission', async () => {
        const user = await createTestUser();

        const result = await testUserPermission(user, 'templates:manage:all');
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== API PERMISSIONS =====

  describe('API Permissions', () => {
    describe('api:read:organization', () => {
      it('should allow reading API access in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'api_reader',
          organizationId: org.organization_id,
          permissions: ['api:read:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'api:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny reading API access in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'api:read:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });

    describe('api:write:organization', () => {
      it('should allow writing API access in organization', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const role = await createTestRole({
          name: 'api_writer',
          organizationId: org.organization_id,
          permissions: ['api:write:organization'],
        });
        await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'api:write:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(true);
      });

      it('should deny writing API access in organization without permission', async () => {
        const user = await createTestUser();
        const org = await createTestOrganization();
        await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

        const result = await testUserPermission(
          user,
          'api:write:organization',
          undefined,
          org.organization_id
        );
        expect(result.granted).toBe(false);
      });
    });
  });

  // ===== CROSS-SCOPE PERMISSION TESTS =====

  describe('Cross-Scope Permission Behavior', () => {
    it('should allow super admin to access everything', async () => {
      const user = await createTestUser();
      const superAdminRole = await createTestRole({
        name: 'super_admin',
        isSystemRole: true,
        permissions: [
          'users:manage:all',
          'practices:manage:all',
          'analytics:read:all',
          'roles:manage:all',
          'settings:update:all',
          'templates:manage:all',
        ],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(superAdminRole));

      // Test a few key permissions
      expect((await testUserPermission(user, 'users:manage:all')).granted).toBe(true);
      expect((await testUserPermission(user, 'practices:manage:all')).granted).toBe(true);
      expect((await testUserPermission(user, 'analytics:read:all')).granted).toBe(true);
      expect((await testUserPermission(user, 'roles:manage:all')).granted).toBe(true);
      expect((await testUserPermission(user, 'settings:update:all')).granted).toBe(true);
      expect((await testUserPermission(user, 'templates:manage:all')).granted).toBe(true);
    });

    it('should properly isolate organization-scoped permissions', async () => {
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const org1 = await createTestOrganization();
      const org2 = await createTestOrganization();

      // User1 in org1 with permissions
      await assignUserToOrganization(user1, mapDatabaseOrgToOrg(org1));
      const role1 = await createTestRole({
        name: 'org1_user_manager',
        organizationId: org1.organization_id,
        permissions: ['users:read:organization'],
      });
      await assignRoleToUser(user1, mapDatabaseRoleToRole(role1), mapDatabaseOrgToOrg(org1));

      // User2 in org2 without permissions
      await assignUserToOrganization(user2, mapDatabaseOrgToOrg(org2));

      // User1 should have access to org1
      expect(
        (
          await testUserPermission(
            user1,
            'users:read:organization',
            undefined,
            org1.organization_id
          )
        ).granted
      ).toBe(true);

      // User1 should NOT have access to org2
      expect(
        (
          await testUserPermission(
            user1,
            'users:read:organization',
            undefined,
            org2.organization_id
          )
        ).granted
      ).toBe(false);

      // User2 should NOT have access to org2 (no permissions)
      expect(
        (
          await testUserPermission(
            user2,
            'users:read:organization',
            undefined,
            org2.organization_id
          )
        ).granted
      ).toBe(false);
    });
  });
});
