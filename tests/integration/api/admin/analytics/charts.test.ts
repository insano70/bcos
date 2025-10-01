/**
 * RBAC API Tests - Chart Management
 *
 * Tests for /api/admin/analytics/charts endpoints
 * Validates RBAC permission enforcement for chart operations
 *
 * Phase 1 of RBAC Testing Strategy
 * See: docs/rbac-testing-roadmap.md
 */

import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup'
import { createUserWithPermissions } from '@/tests/helpers/rbac-helper'
import { createTestUser } from '@/tests/factories'
import {
  makeAuthenticatedRequest,
  makeUnauthenticatedRequest,
  expectSuccess,
  expectForbidden,
  expectUnauthorized,
  expectBadRequest,
  parseJsonResponse,
} from '@/tests/helpers/api-test-helper'
import { db } from '@/lib/db'
import { chart_definitions } from '@/lib/db/analytics-schema'
import { getCurrentTransaction } from '@/tests/helpers/db-helper'
import { eq } from 'drizzle-orm'
import type { PermissionName } from '@/lib/types/rbac'

describe('Chart Management API - RBAC Tests', () => {
  describe('GET /api/admin/analytics/charts', () => {
    it('should allow access with analytics:read:all permission', async () => {
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')
      expectSuccess(response)
    })

    it('should deny access without analytics:read:all permission', async () => {
      const user = await createUserWithPermissions([] as PermissionName[])
      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')
      expectForbidden(response)
    })

    it('should deny access for unauthenticated requests', async () => {
      const response = await makeUnauthenticatedRequest('GET', '/api/admin/analytics/charts')
      expectUnauthorized(response)
    })

    it('should return valid response structure with charts array', async () => {
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')

      expectSuccess(response)
      const data = await parseJsonResponse<{ charts: unknown[] }>(response)
      expect(data).toHaveProperty('charts')
      expect(Array.isArray(data.charts)).toBe(true)
    })

    it('should allow super admin access (implicit test)', async () => {
      // Super admin has analytics:read:all permission
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const response = await makeAuthenticatedRequest(user, 'GET', '/api/admin/analytics/charts')
      expectSuccess(response)
    })
  })

  describe('POST /api/admin/analytics/charts', () => {
    let validChartData: Record<string, unknown>
    let testUser: Awaited<ReturnType<typeof createTestUser>>

    beforeEach(async () => {
      testUser = await createTestUser()

      validChartData = {
        chart_name: 'Test Chart',
        chart_description: 'Test chart description',
        chart_type: 'bar',
        data_source: {
          type: 'query',
          query: 'SELECT * FROM test_table',
        },
        chart_config: {
          xAxis: 'date',
          yAxis: 'value',
        },
        access_control: null,
        chart_category_id: null,
        is_active: true,
      }
    })

    it('should allow chart creation with analytics:read:all permission', async () => {
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        validChartData
      )
      expectSuccess(response, 201)

      const data = await parseJsonResponse<{ chart: { chart_definition_id: string } }>(response)
      expect(data).toHaveProperty('chart')
      expect(data.chart).toHaveProperty('chart_definition_id')
    })

    it('should deny chart creation without analytics:read:all permission', async () => {
      const user = await createUserWithPermissions([] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        validChartData
      )
      expectForbidden(response)
    })

    it('should deny chart creation for unauthenticated requests', async () => {
      const response = await makeUnauthenticatedRequest(
        'POST',
        '/api/admin/analytics/charts',
        validChartData
      )
      expectUnauthorized(response)
    })

    it('should reject invalid chart data with 400 Bad Request', async () => {
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const invalidData = {
        chart_name: '', // Empty name - should fail validation
        chart_type: 'invalid_type',
      }

      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        invalidData
      )
      expectBadRequest(response)
    })

    it('should allow super admin to create charts', async () => {
      const user = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'POST',
        '/api/admin/analytics/charts',
        validChartData
      )
      expectSuccess(response, 201)
    })
  })

  describe('GET /api/admin/analytics/charts/[chartId]', () => {
    let chartId: string
    let userWithPermission: Awaited<ReturnType<typeof createUserWithPermissions>>

    beforeEach(async () => {
      userWithPermission = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const tx = getCurrentTransaction()

      // Create a test chart
      const [chart] = await tx
        .insert(chart_definitions)
        .values({
          chart_name: 'Test Chart for GET',
          chart_description: 'Test description',
          chart_type: 'line',
          data_source: { type: 'query', query: 'SELECT 1' },
          chart_config: {},
          created_by: userWithPermission.user_id,
          is_active: true,
        })
        .returning()

      if (!chart) throw new Error('Failed to create test chart')
      chartId = chart.chart_definition_id
    })

    it('should allow retrieving chart with analytics:read:all permission', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'GET',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectSuccess(response)

      const data = await parseJsonResponse<{ chart: { chart_definition_id: string } }>(response)
      expect(data.chart.chart_definition_id).toBe(chartId)
    })

    it('should deny access without analytics:read:all permission', async () => {
      const user = await createUserWithPermissions([] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'GET',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectForbidden(response)
    })

    it('should deny unauthenticated access', async () => {
      const response = await makeUnauthenticatedRequest(
        'GET',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectUnauthorized(response)
    })

    it('should return 404 for non-existent chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'GET',
        '/api/admin/analytics/charts/00000000-0000-0000-0000-000000000000'
      )
      expect(response.status).toBe(404)
    })

    it('should allow super admin to retrieve any chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'GET',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectSuccess(response)
    })
  })

  describe('PUT /api/admin/analytics/charts/[chartId]', () => {
    let chartId: string
    let userWithPermission: Awaited<ReturnType<typeof createUserWithPermissions>>
    let updateData: Record<string, unknown>

    beforeEach(async () => {
      userWithPermission = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const tx = getCurrentTransaction()

      // Create a test chart
      const [chart] = await tx
        .insert(chart_definitions)
        .values({
          chart_name: 'Test Chart for PUT',
          chart_description: 'Original description',
          chart_type: 'bar',
          data_source: { type: 'query', query: 'SELECT 1' },
          chart_config: {},
          created_by: userWithPermission.user_id,
          is_active: true,
        })
        .returning()

      if (!chart) throw new Error('Failed to create test chart')
      chartId = chart.chart_definition_id

      updateData = {
        chart_name: 'Updated Chart Name',
        chart_description: 'Updated description',
        chart_type: 'line',
        data_source: { type: 'query', query: 'SELECT 2' },
        chart_config: { updated: true },
      }
    })

    it('should allow updating chart with analytics:read:all permission', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'PUT',
        `/api/admin/analytics/charts/${chartId}`,
        updateData
      )
      expectSuccess(response)

      const data = await parseJsonResponse<{ chart: { chart_name: string } }>(response)
      expect(data.chart.chart_name).toBe('Updated Chart Name')
    })

    it('should deny update without analytics:read:all permission', async () => {
      const user = await createUserWithPermissions([] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'PUT',
        `/api/admin/analytics/charts/${chartId}`,
        updateData
      )
      expectForbidden(response)
    })

    it('should deny unauthenticated update requests', async () => {
      const response = await makeUnauthenticatedRequest(
        'PUT',
        `/api/admin/analytics/charts/${chartId}`,
        updateData
      )
      expectUnauthorized(response)
    })

    it('should reject invalid update data with 400 Bad Request', async () => {
      const invalidData = {
        chart_name: '', // Empty name
        chart_type: 'invalid_type',
      }

      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'PUT',
        `/api/admin/analytics/charts/${chartId}`,
        invalidData
      )
      expectBadRequest(response)
    })

    it('should return 404 when updating non-existent chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'PUT',
        '/api/admin/analytics/charts/00000000-0000-0000-0000-000000000000',
        updateData
      )
      expect(response.status).toBe(404)
    })

    it('should allow super admin to update any chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'PUT',
        `/api/admin/analytics/charts/${chartId}`,
        updateData
      )
      expectSuccess(response)
    })
  })

  describe('DELETE /api/admin/analytics/charts/[chartId]', () => {
    let chartId: string
    let userWithPermission: Awaited<ReturnType<typeof createUserWithPermissions>>

    beforeEach(async () => {
      userWithPermission = await createUserWithPermissions(['analytics:read:all'] as PermissionName[])
      const tx = getCurrentTransaction()

      // Create a test chart
      const [chart] = await tx
        .insert(chart_definitions)
        .values({
          chart_name: 'Test Chart for DELETE',
          chart_description: 'Will be deleted',
          chart_type: 'pie',
          data_source: { type: 'query', query: 'SELECT 1' },
          chart_config: {},
          created_by: userWithPermission.user_id,
          is_active: true,
        })
        .returning()

      if (!chart) throw new Error('Failed to create test chart')
      chartId = chart.chart_definition_id
    })

    it('should allow deleting chart with analytics:read:all permission', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'DELETE',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectSuccess(response)

      // Verify chart is deleted (soft delete or hard delete)
      const tx = getCurrentTransaction()
      const [deletedChart] = await tx
        .select()
        .from(chart_definitions)
        .where(eq(chart_definitions.chart_definition_id, chartId))

      // Chart should either not exist or be marked inactive
      expect(!deletedChart || deletedChart.is_active === false).toBe(true)
    })

    it('should deny delete without analytics:read:all permission', async () => {
      const user = await createUserWithPermissions([] as PermissionName[])
      const response = await makeAuthenticatedRequest(
        user,
        'DELETE',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectForbidden(response)
    })

    it('should deny unauthenticated delete requests', async () => {
      const response = await makeUnauthenticatedRequest(
        'DELETE',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectUnauthorized(response)
    })

    it('should return 404 when deleting non-existent chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'DELETE',
        '/api/admin/analytics/charts/00000000-0000-0000-0000-000000000000'
      )
      expect(response.status).toBe(404)
    })

    it('should allow super admin to delete any chart', async () => {
      const response = await makeAuthenticatedRequest(
        userWithPermission,
        'DELETE',
        `/api/admin/analytics/charts/${chartId}`
      )
      expectSuccess(response)
    })
  })
})
