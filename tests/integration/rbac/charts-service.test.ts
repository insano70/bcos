/**
 * RBAC Charts Service Integration Tests
 * Tests RBACChartsService permission checking
 *
 * Following the pattern from tests/integration/rbac/permissions.test.ts
 *
 * NOTE: These tests focus on RBAC permission enforcement.
 * Full CRUD testing requires the service to use the test transaction,
 * which is a future architecture improvement.
 */

import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'
import {
  createTestUser,
  createTestRole,
  assignRoleToUser
} from '@/tests/factories'
import { mapDatabaseRoleToRole, buildUserContext } from '@/tests/helpers/rbac-helper'
import { createRBACChartsService } from '@/lib/services/rbac-charts-service'
import { PermissionDeniedError } from '@/lib/types/rbac'
import type { PermissionName } from '@/lib/types/rbac'

describe('RBAC Charts Service - Permission Enforcement', () => {
  describe('getCharts', () => {
    it('should allow listing charts with analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      // Should not throw PermissionDeniedError
      const charts = await chartsService.getCharts()
      expect(Array.isArray(charts)).toBe(true)
    })

    it('should deny listing charts without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      await expect(chartsService.getCharts()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getChartCount', () => {
    it('should allow counting charts with analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['analytics:read:all' as PermissionName]
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      const count = await chartsService.getChartCount()
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should deny counting charts without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      await expect(chartsService.getChartCount()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('getChartById', () => {
    it('should deny retrieving chart by ID without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      await expect(
        chartsService.getChartById('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('createChart', () => {
    it('should deny creating chart without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      const chartData = {
        chart_name: 'New Chart',
        chart_type: 'line',
        data_source: { type: 'query', query: 'SELECT 1' }
      }

      await expect(chartsService.createChart(chartData)).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('updateChart', () => {
    it('should deny updating chart without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      const updateData = {
        chart_name: 'Updated Chart'
      }

      await expect(
        chartsService.updateChart('00000000-0000-0000-0000-000000000000', updateData)
      ).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('deleteChart', () => {
    it('should deny deleting chart without analytics:read:all permission', async () => {
      const user = await createTestUser()
      const role = await createTestRole({
        name: 'no_analytics',
        permissions: []
      })
      await assignRoleToUser(user, mapDatabaseRoleToRole(role))

      const userContext = await buildUserContext(user)
      const chartsService = createRBACChartsService(userContext)

      await expect(
        chartsService.deleteChart('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(PermissionDeniedError)
    })
  })
})
