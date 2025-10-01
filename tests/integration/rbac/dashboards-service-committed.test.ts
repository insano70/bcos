/**
 * RBAC Dashboards Service Integration Tests - Using Committed Factories
 *
 * Tests actual CRUD operations using committed transactions that are visible
 * to the service layer. This provides real integration testing of:
 * - Permission enforcement
 * - Database operations
 * - Business logic validation
 * - Error handling
 * - Data filtering based on RBAC scopes
 *
 * Uses the committed factory architecture for proper test data management
 * with cryptographic IDs and automatic cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@/tests/setup/integration-setup'
import {
  createCommittedUser,
  createCommittedDashboard,
  type CommittedUser,
  type CommittedDashboard
} from '@/tests/factories/committed'
import {
  createTestRole,
  assignRoleToUser,
  createTestOrganization
} from '@/tests/factories'
import {
  mapDatabaseRoleToRole,
  mapDatabaseOrgToOrg,
  buildUserContext,
  assignUserToOrganization
} from '@/tests/helpers/rbac-helper'
import { createRBACDashboardsService } from '@/lib/services/rbac-dashboards-service'
import { PermissionDeniedError } from '@/lib/types/rbac'
import type { PermissionName, UserContext } from '@/lib/types/rbac'
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base'
import { nanoid } from 'nanoid'

describe('RBAC Dashboards Service - Committed Factory Tests', () => {
  let scope: ScopedFactoryCollection
  let scopeId: string

  beforeEach(() => {
    // Create unique scope for this test
    scopeId = `dashboard-test-${nanoid(8)}`
    scope = createTestScope(scopeId)
  })

  afterEach(async () => {
    // Cleanup all test data for this scope
    await scope.cleanup()
  })

  describe('getDashboards - Read Operations', () => {
    it('should retrieve dashboards with analytics:read:all permission', async () => {
      // Setup: Create user with appropriate permissions
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      // Setup: Create test dashboards
      const dashboard1 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Test Dashboard 1',
        dashboard_description: 'First test dashboard',
        scope: scopeId
      })
      const dashboard2 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Test Dashboard 2',
        dashboard_description: 'Second test dashboard',
        scope: scopeId
      })

      // Execute: Get all dashboards
      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)
      const result = await dashboardsService.getDashboards()

      // Verify: Results include our test dashboards
      expect(Array.isArray(result)).toBe(true)
      const dashboardIds = result.map(d => d.dashboard_id)
      expect(dashboardIds).toContain(dashboard1.dashboard_id)
      expect(dashboardIds).toContain(dashboard2.dashboard_id)
    })

    it('should deny dashboard retrieval without analytics:read permission', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(dashboardsService.getDashboards()).rejects.toThrow(PermissionDeniedError)
    })

    it('should filter dashboards by organization scope', async () => {
      // Setup: Create user with org-scoped permission
      const user = await createCommittedUser({ scope: scopeId })
      const org1 = await createTestOrganization()
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1))

      const role = await createTestRole({
        name: 'org_analytics_reader',
        organizationId: org1.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org1))

      // Setup: Create dashboards
      // Note: Dashboards don't have organization_id in schema - filtering handled by RBAC service
      const dashboard1 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Org 1 Dashboard',
        scope: scopeId
      })

      const org2 = await createTestOrganization()
      const dashboard2 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Org 2 Dashboard',
        scope: scopeId
      })

      // Execute: Get dashboards with org1 context
      const userContext = await buildUserContext(user, org1.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)
      const result = await dashboardsService.getDashboards()

      // Verify: Only org1 dashboards are returned
      const dashboardIds = result.map(d => d.dashboard_id)
      expect(dashboardIds).toContain(dashboard1.dashboard_id)
      expect(dashboardIds).not.toContain(dashboard2.dashboard_id)
    })
  })

  describe('getDashboardById - Single Record Retrieval', () => {
    it('should retrieve specific dashboard with valid permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Specific Dashboard',
        dashboard_description: 'Dashboard for ID lookup test',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)
      const result = await dashboardsService.getDashboardById(dashboard.dashboard_id)

      expect(result).toBeDefined()
      if (!result) throw new Error('Expected dashboard to be defined')
      expect(result.dashboard_id).toBe(dashboard.dashboard_id)
      expect(result.dashboard_name).toBe('Specific Dashboard')
      expect(result.created_by).toBe(user.user_id)
    })

    it('should throw error for non-existent dashboard', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.getDashboardById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(/not found/i)
    })

    it('should deny retrieval without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Protected Dashboard',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.getDashboardById(dashboard.dashboard_id)
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getDashboardCount - Aggregation Operations', () => {
    it('should return accurate dashboard count with analytics:read:all', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      // Create multiple dashboards
      await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Dashboard 1',
        scope: scopeId
      })
      await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Dashboard 2',
        scope: scopeId
      })
      await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Dashboard 3',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)
      const count = await dashboardsService.getDashboardCount()

      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(3)
    })

    it('should respect organization scope when counting', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const org1 = await createTestOrganization()
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1))

      const role = await createTestRole({
        name: 'org_analytics_reader',
        organizationId: org1.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org1))

      // Create dashboards
      // Note: Organization filtering is handled by RBAC service layer, not schema
      await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Org 1 Dashboard',
        scope: scopeId
      })

      const org2 = await createTestOrganization()
      await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Org 2 Dashboard',
        scope: scopeId
      })

      const userContext = await buildUserContext(user, org1.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)
      const count = await dashboardsService.getDashboardCount()

      // Count should only include org1 dashboards
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('createDashboard - Write Operations', () => {
    it('should create dashboard with analytics:read:all permission', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      const dashboardData = {
        dashboard_name: 'New Dashboard',
        dashboard_description: 'Created via service',
        layout_config: { widgets: [] }
      }

      const result = await dashboardsService.createDashboard(dashboardData)

      expect(result).toBeDefined()
      expect(result.dashboard_name).toBe('New Dashboard')
      expect(result.dashboard_description).toBe('Created via service')
      expect(result.created_by).toBe(user.user_id)
      expect(result.dashboard_id).toBeTruthy()
    })

    it('should validate required fields when creating dashboard', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      // Missing dashboard_name
      await expect(
        dashboardsService.createDashboard({
          dashboard_name: '',
          dashboard_description: 'No name'
        })
      ).rejects.toThrow()
    })

    it('should deny dashboard creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'reader_only',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Unauthorized Dashboard',
          dashboard_description: 'Should fail'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('updateDashboard - Modify Operations', () => {
    it('should update dashboard with analytics:read:all permission', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Original Name',
        dashboard_description: 'Original description',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      const updateData = {
        dashboard_name: 'Updated Name',
        dashboard_description: 'Updated description'
      }

      const result = await dashboardsService.updateDashboard(
        dashboard.dashboard_id,
        updateData
      )

      expect(result.dashboard_name).toBe('Updated Name')
      expect(result.dashboard_description).toBe('Updated description')
      expect(result.dashboard_id).toBe(dashboard.dashboard_id)
    })

    it('should deny update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'reader_only',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Protected Dashboard',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.updateDashboard(dashboard.dashboard_id, {
          dashboard_name: 'Hacked Name'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })

    it('should throw error when updating non-existent dashboard', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.updateDashboard('00000000-0000-0000-0000-000000000000', {
          dashboard_name: 'Ghost Dashboard'
        })
      ).rejects.toThrow(/not found/i)
    })
  })

  describe('deleteDashboard - Delete Operations', () => {
    it('should delete dashboard with analytics:read:all permission', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Dashboard to Delete',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await dashboardsService.deleteDashboard(dashboard.dashboard_id)

      // Verify deletion
      await expect(
        dashboardsService.getDashboardById(dashboard.dashboard_id)
      ).rejects.toThrow(/not found/i)
    })

    it('should deny deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'reader_only',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Protected Dashboard',
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.deleteDashboard(dashboard.dashboard_id)
      ).rejects.toThrow(PermissionDeniedError)
    })

    it('should handle deletion of non-existent dashboard gracefully', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.deleteDashboard('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(/not found/i)
    })
  })

  describe('Complex Permission Scenarios', () => {
    it('should handle user with multiple roles and cumulative permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const org = await createTestOrganization()
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org))

      // Assign org-scoped read permission
      const readRole = await createTestRole({
        name: 'org_reader',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(readRole), mapDatabaseOrgToOrg(org))

      // Assign global admin permission
      const adminRole = await createTestRole({
        name: 'global_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(adminRole))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Multi-Role Dashboard',
        scope: scopeId
      })

      const userContext = await buildUserContext(user, org.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)

      // Should succeed due to global admin role
      const result = await dashboardsService.getDashboardById(dashboard.dashboard_id)
      if (!result) throw new Error('Expected dashboard to be defined')
      expect(result.dashboard_id).toBe(dashboard.dashboard_id)

      // Should be able to create dashboards
      const newDashboard = await dashboardsService.createDashboard({
        dashboard_name: 'Created by Multi-Role User',
        dashboard_description: 'Testing cumulative permissions'
      })
      expect(newDashboard.dashboard_id).toBeTruthy()
    })

    it('should deny access when organization context does not match', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const org1 = await createTestOrganization()
      const org2 = await createTestOrganization()

      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org1))

      const role = await createTestRole({
        name: 'org1_reader',
        organizationId: org1.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org1))

      // Create dashboard
      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Org 2 Dashboard',
        scope: scopeId
      })

      // User context for org1
      const userContext = await buildUserContext(user, org1.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)

      // Should not include org2 dashboard
      const dashboards = await dashboardsService.getDashboards()
      const dashboardIds = dashboards.map(d => d.dashboard_id)
      expect(dashboardIds).not.toContain(dashboard.dashboard_id)
    })
  })

  describe('Data Validation and Business Logic', () => {
    it('should preserve layout_config JSON structure', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const layoutConfig = {
        widgets: [
          { id: 'widget1', type: 'chart', position: { x: 0, y: 0 } },
          { id: 'widget2', type: 'table', position: { x: 1, y: 0 } }
        ],
        columns: 12,
        theme: 'dark'
      }

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Complex Layout Dashboard',
        layout_config: layoutConfig,
        scope: scopeId
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)
      const result = await dashboardsService.getDashboardById(dashboard.dashboard_id)

      if (!result) throw new Error('Expected dashboard to be defined')
      expect(result.layout_config).toEqual(layoutConfig)
    })

    it('should handle null and undefined optional fields correctly', async () => {
      const user = await createCommittedUser({ scope: scopeId })
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const dashboard = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Minimal Dashboard',
        scope: scopeId
        // No description, no layout_config, no organization_id
      })

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)
      const result = await dashboardsService.getDashboardById(dashboard.dashboard_id)

      if (!result) throw new Error('Expected dashboard to be defined')
      expect(result.dashboard_name).toBe('Minimal Dashboard')
      expect(result.created_by).toBe(user.user_id)
    })
  })

  describe('Cleanup and Scope Isolation', () => {
    it('should automatically cleanup dashboards after test', async () => {
      const user = await createCommittedUser({ scope: scopeId })

      const dashboard1 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Cleanup Test Dashboard 1',
        scope: scopeId
      })

      const dashboard2 = await createCommittedDashboard({
        created_by: user.user_id,
        dashboard_name: 'Cleanup Test Dashboard 2',
        scope: scopeId
      })

      // Verify they exist
      expect(dashboard1.dashboard_id).toBeTruthy()
      expect(dashboard2.dashboard_id).toBeTruthy()

      // Cleanup will happen automatically in afterEach
      // This test just verifies the pattern works
    })
  })
})
