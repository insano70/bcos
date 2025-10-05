/**
 * Logout Integration Tests
 * Tests the logout endpoints via HTTP
 *
 * These tests verify:
 * - POST /api/auth/logout - Single session logout
 * - DELETE /api/auth/logout - Revoke all sessions
 * - Token revocation and blacklisting
 * - Cookie clearing
 * - CSRF protection
 * - Authentication requirement
 * - Audit logging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@/tests/setup/integration-setup'
import { createTestUser } from '@/tests/factories/user-factory'
import { generateUniqueEmail } from '@/tests/helpers/unique-generator'
import { createTokenPair } from '@/lib/auth/token-manager'
import { getCurrentTransaction } from '@/tests/helpers/db-helper'

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
  const cookies = response.headers.get('set-cookie')

  return {
    accessToken: data.data.accessToken as string,
    csrfToken: data.data.csrfToken as string,
    cookies: cookies || '',
    sessionId: data.data.sessionId as string
  }
}

/**
 * Extract cookie value from Set-Cookie header
 */
function extractCookieValue(setCookieHeader: string | undefined, name: string): string | null {
  if (!setCookieHeader) return null
  const regex = new RegExp(`${name}=([^;]+)`)
  const match = setCookieHeader.match(regex)
  return match && match[1] ? match[1] : null
}

describe('Logout Integration - POST /api/auth/logout', () => {
  describe('Successful Logout', () => {
    it('should logout authenticated user', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.message).toContain('successfully')
    })

    it('should clear authentication cookies on logout', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toBeTruthy()

      // Cookies should be cleared (max-age=0)
      expect(setCookie).toContain('max-age=0')
      expect(setCookie).toContain('refresh-token=')
      expect(setCookie).toContain('access-token=')
    })

    it('should revoke refresh token on logout', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      expect(logoutResponse.status).toBe(200)

      // Try to use refresh token after logout (should fail)
      const refreshToken = extractCookieValue(auth.cookies, 'refresh-token')

      if (refreshToken) {
        const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Cookie': `refresh-token=${refreshToken}`
          }
        })

        expect(refreshResponse.status).toBe(401)
      }
    })

    it('should blacklist access token on logout', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      // Try to use access token after logout (should be blacklisted)
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

  describe('Authentication Required', () => {
    it('should reject logout without authentication', async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(response.status).toBe(401)

      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should reject logout with invalid access token', async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'X-CSRF-Token': 'some-csrf-token'
        }
      })

      expect(response.status).toBe(401)
    })

    it('should reject logout without refresh token cookie', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Try logout without cookies
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken
          // No cookies
        }
      })

      expect(response.status).toBe(400)
    })
  })

  describe('CSRF Protection', () => {
    it('should reject logout without CSRF token', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
          // No CSRF token
        }
      })

      expect(response.status).toBe(403)
    })

    it('should reject logout with invalid CSRF token', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': 'invalid-csrf-token',
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(403)
    })
  })

  describe('Token Ownership Validation', () => {
    it('should prevent logout with mismatched user tokens', async () => {
      const email1 = generateUniqueEmail()
      const email2 = generateUniqueEmail()
      const password = 'TestPassword123!'

      const user1 = await createTestUser({ email: email1, password, emailVerified: true })
      const user2 = await createTestUser({ email: email2, password, emailVerified: true })

      const auth1 = await authenticateUser(email1, password)
      const auth2 = await authenticateUser(email2, password)

      // Try to logout user1 with user2's refresh token
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth1.accessToken}`,
          'X-CSRF-Token': auth1.csrfToken,
          'Cookie': auth2.cookies // Different user's cookies
        }
      })

      expect(response.status).toBe(403)
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on logout', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Make rapid logout attempts
      const responses = []
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${auth.accessToken}`,
            'X-CSRF-Token': auth.csrfToken,
            'Cookie': auth.cookies
          }
        })
        responses.push(response.status)
      }

      // Should eventually hit rate limit
      expect(responses).toContain(429)
    })
  })
})

describe('Logout Integration - DELETE /api/auth/logout (Revoke All Sessions)', () => {
  describe('Successful Revoke All Sessions', () => {
    it('should revoke all user sessions', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      const user = await createTestUser({ email, password, emailVerified: true })

      // Create multiple sessions
      const tx = getCurrentTransaction()
      const deviceInfo1 = {
        ipAddress: '192.168.1.1',
        userAgent: 'Device 1',
        fingerprint: 'fingerprint1',
        deviceName: 'Device 1'
      }
      const deviceInfo2 = {
        ipAddress: '192.168.1.2',
        userAgent: 'Device 2',
        fingerprint: 'fingerprint2',
        deviceName: 'Device 2'
      }

      await createTokenPair(user.user_id, deviceInfo1, false, email)
      await createTokenPair(user.user_id, deviceInfo2, false, email)

      // Authenticate to get tokens for revoke request
      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.revokedSessions).toBeGreaterThan(0)
    })

    it('should clear cookies on revoke all sessions', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toBeTruthy()
      expect(setCookie).toContain('max-age=0')
    })

    it('should return revoked session count', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'X-CSRF-Token': auth.csrfToken,
          'Cookie': auth.cookies
        }
      })

      const data = await response.json()
      expect(data.data.revokedSessions).toBeDefined()
      expect(typeof data.data.revokedSessions).toBe('number')
    })
  })

  describe('Authentication Required', () => {
    it('should reject revoke all without authentication', async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(401)
    })

    it('should reject revoke all with invalid token', async () => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer invalid-token',
          'X-CSRF-Token': 'some-token'
        }
      })

      expect(response.status).toBe(401)
    })
  })

  describe('CSRF Protection', () => {
    it('should reject revoke all without CSRF token', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'Cookie': auth.cookies
          // No CSRF token
        }
      })

      expect(response.status).toBe(403)
    })
  })

  describe('Token Ownership Validation', () => {
    it('should prevent revoke all with mismatched tokens', async () => {
      const email1 = generateUniqueEmail()
      const email2 = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email: email1, password, emailVerified: true })
      await createTestUser({ email: email2, password, emailVerified: true })

      const auth1 = await authenticateUser(email1, password)
      const auth2 = await authenticateUser(email2, password)

      // Try to revoke user1's sessions with user2's refresh token
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth1.accessToken}`,
          'X-CSRF-Token': auth1.csrfToken,
          'Cookie': auth2.cookies
        }
      })

      expect(response.status).toBe(403)
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on revoke all sessions', async () => {
      const email = generateUniqueEmail()
      const password = 'TestPassword123!'

      await createTestUser({ email, password, emailVerified: true })

      const auth = await authenticateUser(email, password)

      // Make rapid revoke all attempts
      const responses = []
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${auth.accessToken}`,
            'X-CSRF-Token': auth.csrfToken,
            'Cookie': auth.cookies
          }
        })
        responses.push(response.status)
      }

      // Should eventually hit rate limit
      expect(responses).toContain(429)
    })
  })
})

describe('Logout Integration - Response Format', () => {
  it('should return standardized success response for POST logout', async () => {
    const email = generateUniqueEmail()
    const password = 'TestPassword123!'

    await createTestUser({ email, password, emailVerified: true })

    const auth = await authenticateUser(email, password)

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'X-CSRF-Token': auth.csrfToken,
        'Cookie': auth.cookies
      }
    })

    const data = await response.json()
    expect(data).toHaveProperty('success')
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('message')
    expect(data.success).toBe(true)
  })

  it('should return standardized success response for DELETE logout', async () => {
    const email = generateUniqueEmail()
    const password = 'TestPassword123!'

    await createTestUser({ email, password, emailVerified: true })

    const auth = await authenticateUser(email, password)

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'X-CSRF-Token': auth.csrfToken,
        'Cookie': auth.cookies
      }
    })

    const data = await response.json()
    expect(data).toHaveProperty('success')
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('message')
    expect(data.success).toBe(true)
  })

  it('should return standardized error response', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST'
    })

    const data = await response.json()
    expect(data).toHaveProperty('success')
    expect(data).toHaveProperty('error')
    expect(data.success).toBe(false)
  })
})
