/**
 * RBAC Dashboards Service Integration Tests
 * Tests RBAC permission enforcement for Dashboard Management operations
 *
 * Tests focus on verifying that:
 * - Operations requiring permissions are properly restricted
 * - Users with appropriate permissions can perform operations
 * - Users without permissions are denied access
 */

import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'
import {
  createTestUser,
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
import type { PermissionName } from '@/lib/types/rbac'

describe('RBAC Dashboards Service - Permission Enforcement', () => {
  describe('getDashboards', () => {
    it('should allow listing dashboards with analytics:read:organization permission', async () => {
      const user = await createTestUser()
      const org = await createTestOrganization()
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'analytics_reader_org',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(user, org.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)

      const dashboards = await dashboardsService.getDashboards()
      expect(Array.isArray(dashboards)).toBe(true)
    })

    it('should allow listing dashboards with analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader_all',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      const dashboards = await dashboardsService.getDashboards()
      expect(Array.isArray(dashboards)).toBe(true)
    })

    it('should deny listing dashboards without analytics permissions', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(dashboardsService.getDashboards()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getDashboardCount', () => {
    it('should allow getting dashboard count with analytics:read:organization permission', async () => {
      const user = await createTestUser()
      const org = await createTestOrganization()
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org))

      const role = await createTestRole({
        name: 'analytics_reader_org',
        organizationId: org.organization_id,
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role), mapDatabaseOrgToOrg(org))

      const userContext = await buildUserContext(user, org.organization_id)
      const dashboardsService = createRBACDashboardsService(userContext)

      const count = await dashboardsService.getDashboardCount()
      expect(typeof count).toBe('number')
    })

    it('should allow getting dashboard count with analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader_all',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      const count = await dashboardsService.getDashboardCount()
      expect(typeof count).toBe('number')
    })

    it('should deny getting dashboard count without analytics permissions', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(dashboardsService.getDashboardCount()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getDashboardById', () => {
    it('should deny getting dashboard by ID without analytics permissions', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.getDashboardById('test-dashboard-id')
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('createDashboard', () => {
    it('should deny creating dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Test Dashboard',
          dashboard_description: 'Test Description'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })

    it('should deny creating dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.createDashboard({
          dashboard_name: 'Test Dashboard',
          dashboard_description: 'Test Description'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('updateDashboard', () => {
    it('should deny updating dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.updateDashboard('test-dashboard-id', {
          dashboard_name: 'Updated Dashboard'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })

    it('should deny updating dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.updateDashboard('test-dashboard-id', {
          dashboard_name: 'Updated Dashboard'
        })
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('deleteDashboard', () => {
    it('should deny deleting dashboard without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.deleteDashboard('test-dashboard-id')
      ).rejects.toThrow(PermissionDeniedError)
    })

    it('should deny deleting dashboard with only analytics:read:organization permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader_org',
        permissions: ['analytics:read:organization' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const dashboardsService = createRBACDashboardsService(userContext)

      await expect(
        dashboardsService.deleteDashboard('test-dashboard-id')
      ).rejects.toThrow(PermissionDeniedError)
    })
  })
})
