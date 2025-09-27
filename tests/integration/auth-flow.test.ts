/**
 * Authentication Flow Integration Tests
 * Tests the complete auth flow: login → session → authorization → logout
 */

import { describe, it, expect, beforeEach } from 'vitest'
import '@/tests/setup/integration-setup' // Import integration setup for database access
import { createTestUser } from '@/tests/factories/user-factory'
import { createTestOrganization } from '@/tests/factories/organization-factory'
import { createTestRole } from '@/tests/factories/role-factory'

describe('Authentication Flow Integration', () => {
  let testUser: any
  let testOrg: any
  let testRole: any

  beforeEach(async () => {
    // Create test data for auth flow
    testOrg = await createTestOrganization()
    testRole = await createTestRole({ 
      name: 'test_admin',
      organizationId: testOrg.organization_id 
    })
    testUser = await createTestUser({
      email: 'authtest@example.com',
      password: 'TestPassword123!'
    })
  })

  describe('Complete Auth Flow', () => {
    it('should handle login → session creation → authorization → logout flow', async () => {
      // Test the business outcome: complete auth flow works end-to-end
      
      // 1. Login should create session and return tokens
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'TestPassword123!'
        })
      })
      
      expect(loginResponse.status).toBe(200)
      const loginData = await loginResponse.json()
      expect(loginData.success).toBe(true)
      expect(loginData.data.accessToken).toBeDefined()
      expect(loginData.data.user.id).toBe(testUser.user_id)
      
      // 2. Use token for authorized request
      const meResponse = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      })
      
      expect(meResponse.status).toBe(200)
      const meData = await meResponse.json()
      expect(meData.success).toBe(true)
      expect(meData.data.user.id).toBe(testUser.user_id)
      
      // 3. Logout should invalidate session
      const logoutResponse = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      })
      
      expect(logoutResponse.status).toBe(200)
      
      // 4. Token should no longer work after logout
      const postLogoutResponse = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      })
      
      expect(postLogoutResponse.status).toBe(401)
    })

    it('should reject invalid credentials', async () => {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
      })
      
      expect(loginResponse.status).toBe(401)
      const loginData = await loginResponse.json()
      expect(loginData.success).toBe(false)
    })

    it('should handle token refresh flow', async () => {
      // Login first
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testUser.email,
          password: 'TestPassword123!'
        })
      })
      
      const loginData = await loginResponse.json()
      
      // Refresh token
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loginData.data.accessToken}`
        }
      })
      
      expect(refreshResponse.status).toBe(200)
      const refreshData = await refreshResponse.json()
      expect(refreshData.success).toBe(true)
      expect(refreshData.data.accessToken).toBeDefined()
      expect(refreshData.data.accessToken).not.toBe(loginData.data.accessToken)
    })
  })
})
