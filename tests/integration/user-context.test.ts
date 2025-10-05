/**
 * User Context Integration Tests
 * Tests the /api/auth/me endpoint via HTTP
 *
 * These tests verify:
 * - GET /api/auth/me - Retrieve authenticated user context
 * - User data retrieval with RBAC context
 * - Authentication requirement
 * - Token validation
 * - Role and permission inclusion
 * - Organization context
 */

import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'
import { createTestUser } from '@/tests/factories/user-factory'
import { generateUniqueEmail } from '@/tests/helpers/unique-generator'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

/**
 * Helper to authenticate user and get tokens/cookies
 */
async function authenticateUser(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  const data = await response.json()
  const cookies = response.headers.get('set-cookie') || ''

  return {
    accessToken: data.data.accessToken,
    csrfToken: data.data.csrfToken,
    cookies,
    sessionId: data.data.sessionId,
    user: data.data.user
  }
}

describe('User Context Integration - GET /api/auth/me', () => {
  describe('Successful User Context Retrieval', () => {
    it('should return authenticated user context', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.user.email).toBe(email)
    })

    it('should return user with roles and permissions', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(data.data.user.roles).toBeDefined()
      expect(data.data.user.permissions).toBeDefined()
      expect(Array.isArray(data.data.user.roles)).toBe(true)
      expect(Array.isArray(data.data.user.permissions)).toBe(true)
    })

    it('should return complete user profile data', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({
        email,
        password,
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe'
      })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(data.data.user.id).toBeTruthy()
      expect(data.data.user.email).toBe(email)
      expect(data.data.user.firstName).toBe('John')
      expect(data.data.user.lastName).toBe('Doe')
      expect(data.data.user.emailVerified).toBe(true)
    })

    it('should work with cookie-only authentication', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Request using only cookies (no Authorization header)
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.user.email).toBe(email)
    })

    it('should work with Authorization header only', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Request using only Authorization header (no cookies)
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Authentication Required', () => {
    it('should reject request without authentication', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET'
      })

      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should reject request with invalid access token', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })

      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should reject request with expired token', async () => {
      // Test with malformed token that will fail validation
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token'
        }
      })

      expect(response.status).toBe(401)
    })

    it('should reject request with blacklisted token', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Logout to blacklist token
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      // Try to use blacklisted token
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(401)
    })
  })

  describe('Token Refresh Integration', () => {
    it('should work with refreshed tokens', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Refresh tokens
      const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Cookie': auth.cookies
        }
      })

      const refreshData = await refreshResponse.json()
      const newAccessToken = refreshData.data.accessToken
      const newCookies = refreshResponse.headers.get('set-cookie') || ''

      // Use refreshed tokens
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newAccessToken}`,
          'Cookie': newCookies
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.data.user.email).toBe(email)
    })
  })

  describe('Response Format', () => {
    it('should return standardized success response', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('data')
      expect(data.success).toBe(true)
    })

    it('should return standardized error response', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET'
      })

      const data = await response.json()
      expect(data).toHaveProperty('success')
      expect(data).toHaveProperty('error')
      expect(data.success).toBe(false)
    })

    it('should not include sensitive data in response', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      const responseText = JSON.stringify(data)

      // Should not expose sensitive fields
      expect(responseText).not.toContain('password')
      expect(responseText).not.toContain('password_hash')
      expect(responseText).not.toContain('refresh_token')
    })
  })

  describe('RBAC Context', () => {
    it('should include role information', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(data.data.user.role).toBeDefined()
      expect(typeof data.data.user.role).toBe('string')
    })

    it('should include permissions array', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(Array.isArray(data.data.user.permissions)).toBe(true)
    })
  })

  describe('Caching and Performance', () => {
    it('should handle multiple rapid requests', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Make 5 rapid requests
      const promises = Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${auth.accessToken}`,
            'Cookie': auth.cookies
          }
        })
      )

      const responses = await Promise.all(promises)

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })
    })
  })

  describe('Security Headers', () => {
    it('should set security headers on response', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
        }
      })

      // Check for security headers
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    })

    it('should not expose implementation details in errors', async () => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })

      const data = await response.json()
      const errorText = JSON.stringify(data).toLowerCase()

      // Should not leak implementation details
      expect(errorText).not.toContain('database')
      expect(errorText).not.toContain('sql')
      expect(errorText).not.toContain('jwt')
      expect(errorText).not.toContain('secret')
    })
  })
})
