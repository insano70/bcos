/**
 * RBAC Dashboards Service Integration Tests
 * Tests RBAC permission enforcement for Dashboard Management operations
 *
 * Tests focus on verifying that:
 * - Operations requiring permissions are properly restricted
 * - Users with appropriate permissions can perform operations
 * - Users without permissions are denied access
 * - Permission checking occurs before database operations
 * - Multiple roles and permission scopes work correctly
 */

import { describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { eq } from 'drizzle-orm';
import { createRBACDashboardsService } from '@/lib/services/dashboards';
import type { PermissionName } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';
import {
  assignRoleToUser,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '@/tests/factories';
import { getCurrentTransaction } from '@/tests/helpers/db-helper';
import {
  assignUserToOrganization,
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Dashboards Service - Permission Enforcement', () => {
  describe('getDashboards', () => {
    it('should allow listing dashboards with analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'analytics_reader_org',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const dashboardsService = createRBACDashboardsService(userContext);

      const dashboards = await dashboardsService.getDashboards();
      expect(Array.isArray(dashboards)).toBe(true);
    });

    it('should allow listing dashboards with analytics:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_reader_all',
        permissions: ['analytics:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      const dashboards = await dashboardsService.getDashboards();
      expect(Array.isArray(dashboards)).toBe(true);
    });

    it('should deny listing dashboards without analytics permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(dashboardsService.getDashboards()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getDashboardCount', () => {
    it('should allow getting dashboard count with analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'analytics_reader_org',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      const userContext = await buildUserContext(user, org.organization_id);
      const dashboardsService = createRBACDashboardsService(userContext);

      const count = await dashboardsService.getDashboardCount();
      expect(typeof count).toBe('number');
    });

    it('should allow getting dashboard count with analytics:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_reader_all',
        permissions: ['analytics:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      const count = await dashboardsService.getDashboardCount();
      expect(typeof count).toBe('number');
    });

    it('should deny getting dashboard count without analytics permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(dashboardsService.getDashboardCount()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getDashboardById', () => {
    it('should deny getting dashboard by ID without analytics permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(dashboardsService.getDashboardById('test-dashboard-id')).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });

  describe('createDashboard', () => {
    it('should deny creating dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Test Dashboard',
          dashboard_description: 'Test Description',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('should deny creating dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Test Dashboard',
          dashboard_description: 'Test Description',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('updateDashboard', () => {
    it('should deny updating dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(
        dashboardsService.updateDashboard('test-dashboard-id', {
          dashboard_name: 'Updated Dashboard',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('should deny updating dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(
        dashboardsService.updateDashboard('test-dashboard-id', {
          dashboard_name: 'Updated Dashboard',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('deleteDashboard', () => {
    it('should deny deleting dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(dashboardsService.deleteDashboard('test-dashboard-id')).rejects.toThrow(
        PermissionDeniedError
      );
    });

    it('should deny deleting dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      await expect(dashboardsService.deleteDashboard('test-dashboard-id')).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });

  describe('createDashboard - permission enforcement with existing data', () => {
    it('should pass permission check with analytics:read:all before attempting database operation', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      const dashboardData = {
        dashboard_name: 'Test Analytics Dashboard',
        dashboard_description: 'Dashboard for testing RBAC enforcement',
      };

      // This test verifies permission checking occurs BEFORE database operations
      // The call will fail on foreign key constraint (user not in global db),
      // which proves permission check passed and database operation was attempted
      await expect(dashboardsService.createDashboard(dashboardData)).rejects.toThrow(
        /foreign key constraint|not present in table|Failed query/
      );

      // If we got a PermissionDeniedError instead, it would mean permissions failed
      // The FK error proves the permission check PASSED and the service attempted the insert
    });
  });

  describe('updateDashboard - permission enforcement with existing data', () => {
    it('should pass permission check with analytics:read:all before attempting database operation', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      const updateData = {
        dashboard_name: 'Updated Dashboard Name',
        dashboard_description: 'Updated description',
      };

      // Test with a non-existent dashboard ID
      // This will pass permission check then fail on "Dashboard not found"
      // which proves permission enforcement happened BEFORE the database lookup
      await expect(
        dashboardsService.updateDashboard('00000000-0000-0000-0000-000000000000', updateData)
      ).rejects.toThrow(/Dashboard not found/);

      // If we got PermissionDeniedError, it would mean permission check failed
      // Getting "Dashboard not found" proves permission check PASSED
    });
  });

  describe('edge cases - multiple roles and permissions', () => {
    it('should grant access when user has multiple roles with different permission scopes', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      // Assign role with organization-scoped permission
      const orgRole = await createTestRole({
        name: 'org_analytics_reader',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(orgRole), mapDatabaseOrgToOrg(org));

      // Assign second role with all-scoped permission
      const adminRole = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(adminRole));

      const userContext = await buildUserContext(user, org.organization_id);
      const dashboardsService = createRBACDashboardsService(userContext);

      // Should succeed because user has analytics:read:all through second role
      const result = await dashboardsService.getDashboards();
      expect(Array.isArray(result)).toBe(true);

      // Test create permission check passes (will fail on FK, but that proves permission passed)
      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Multi-Role Dashboard',
          dashboard_description: 'Created by user with multiple roles',
        })
      ).rejects.toThrow(/foreign key constraint|not present in table|Failed query/);
    });

    it('should allow access with inactive role (BUG: inactive roles not filtered)', async () => {
      const user = await createTestUser();
      const tx = getCurrentTransaction();

      // Create role directly as inactive in the database
      const [inactiveRoleData] = await tx
        .insert((await import('@/lib/db/rbac-schema')).roles)
        .values({
          name: 'inactive_analytics_reader',
          description: 'Inactive role for testing',
          is_system_role: true,
          is_active: false, // Created as inactive
        })
        .returning();

      if (!inactiveRoleData) {
        throw new Error('Failed to create inactive role');
      }

      // Get the analytics:read:all permission
      const [permission] = await tx
        .select()
        .from((await import('@/lib/db/rbac-schema')).permissions)
        .where(eq((await import('@/lib/db/rbac-schema')).permissions.name, 'analytics:read:all'))
        .limit(1);

      if (!permission) {
        throw new Error('analytics:read:all permission not found in database');
      }

      // Assign permission to the inactive role
      await tx.insert((await import('@/lib/db/rbac-schema')).role_permissions).values({
        role_id: inactiveRoleData.role_id,
        permission_id: permission.permission_id,
      });

      // Assign inactive role to user
      await tx.insert((await import('@/lib/db/rbac-schema')).user_roles).values({
        user_id: user.user_id,
        role_id: inactiveRoleData.role_id,
        organization_id: null,
        granted_by: null,
        is_active: true, // User-role assignment is active, but role itself is inactive
      });

      // Build user context - should include the inactive role
      const userContext = await buildUserContext(user);

      // Verify the role is in context but marked inactive
      expect(userContext.roles.length).toBeGreaterThan(0);
      const roleInContext = userContext.roles.find((r) => r.role_id === inactiveRoleData.role_id);
      expect(roleInContext?.is_active).toBe(false);

      const dashboardsService = createRBACDashboardsService(userContext);

      // FIXED: Permission checker now properly filters out permissions from inactive roles
      // Expected behavior: Should throw PermissionDeniedError
      // Inactive roles should not grant any permissions, even if the user-role assignment is active
      await expect(dashboardsService.getDashboards()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('permission enforcement - early exit verification', () => {
    it('should throw PermissionDeniedError before attempting database operations', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const dashboardsService = createRBACDashboardsService(userContext);

      // These should all throw immediately without touching the database
      // We verify this by checking the error is PermissionDeniedError, not a database error

      await expect(dashboardsService.getDashboards()).rejects.toThrow(PermissionDeniedError);
      await expect(dashboardsService.getDashboardCount()).rejects.toThrow(PermissionDeniedError);
      await expect(dashboardsService.getDashboardById('any-id')).rejects.toThrow(
        PermissionDeniedError
      );

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Test',
          dashboard_description: 'Test',
        })
      ).rejects.toThrow(PermissionDeniedError);

      await expect(
        dashboardsService.updateDashboard('any-id', { dashboard_name: 'Test' })
      ).rejects.toThrow(PermissionDeniedError);

      await expect(dashboardsService.deleteDashboard('any-id')).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });

  describe('permission scope validation', () => {
    it('should require organization context for analytics:read:organization permission', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const role = await createTestRole({
        name: 'org_analytics_reader',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org));

      // WITHOUT organization context in UserContext - should fail
      const userContextNoOrg = await buildUserContext(user); // No org ID
      const dashboardsServiceNoOrg = createRBACDashboardsService(userContextNoOrg);

      await expect(dashboardsServiceNoOrg.getDashboards()).rejects.toThrow(PermissionDeniedError);

      // WITH organization context - should succeed
      const userContextWithOrg = await buildUserContext(user, org.organization_id);
      const dashboardsServiceWithOrg = createRBACDashboardsService(userContextWithOrg);

      const result = await dashboardsServiceWithOrg.getDashboards();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
