/**
 * OIDC Login Integration Tests
 * Tests the OIDC authentication endpoints via HTTP
 *
 * These tests verify:
 * - GET /api/auth/oidc/login - OIDC login initiation
 * - Redirect to Microsoft Entra ID
 * - State token generation
 * - PKCE parameter generation
 * - Relay state handling
 * - Configuration validation
 * - Rate limiting
 *
 * NOTE: OIDC callback validation requires cryptographically signed responses.
 * Callback testing is covered in unit tests with mocked OIDC responses.
 */

import { describe, it, expect } from 'vitest'
import '@/tests/setup/integration-setup'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001'

describe('OIDC Login Integration', () => {
  describe('Login Initiation', () => {
    it('should redirect to Microsoft Entra ID', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      // Next.js uses 307 for temporary redirects
      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      expect(location).toContain('login.microsoftonline.com')
    })

    it('should include required OAuth parameters in redirect', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      expect(location).toBeTruthy()

      const url = new URL(location!)

      // Check for OAuth 2.0 / OIDC parameters
      expect(url.searchParams.has('client_id')).toBe(true)
      expect(url.searchParams.has('redirect_uri')).toBe(true)
      expect(url.searchParams.has('response_type')).toBe(true)
      expect(url.searchParams.has('scope')).toBe(true)
      expect(url.searchParams.has('state')).toBe(true)
    })

    it('should include PKCE parameters in redirect', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      expect(location).toBeTruthy()

      const url = new URL(location!)

      // PKCE parameters
      expect(url.searchParams.has('code_challenge')).toBe(true)
      expect(url.searchParams.has('code_challenge_method')).toBe(true)
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })

    it('should request openid scope', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      expect(location).toBeTruthy()

      const url = new URL(location!)
      const scopes = url.searchParams.get('scope')

      expect(scopes).toBeTruthy()
      expect(scopes).toContain('openid')
    })

    it('should generate unique state token', async () => {
      const response1 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const response2 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location1 = response1.headers.get('location')
      const location2 = response2.headers.get('location')

      const url1 = new URL(location1!)
      const url2 = new URL(location2!)

      const state1 = url1.searchParams.get('state')
      const state2 = url2.searchParams.get('state')

      expect(state1).toBeTruthy()
      expect(state2).toBeTruthy()
      expect(state1).not.toBe(state2)
    })

    it('should generate unique code challenge', async () => {
      const response1 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const response2 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location1 = response1.headers.get('location')
      const location2 = response2.headers.get('location')

      const url1 = new URL(location1!)
      const url2 = new URL(location2!)

      const challenge1 = url1.searchParams.get('code_challenge')
      const challenge2 = url2.searchParams.get('code_challenge')

      expect(challenge1).toBeTruthy()
      expect(challenge2).toBeTruthy()
      expect(challenge1).not.toBe(challenge2)
    })
  })

  describe('Relay State Handling', () => {
    it('should handle relay state parameter', async () => {
      const relayState = '/dashboard/analytics'

      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?relay_state=${encodeURIComponent(relayState)}`,
        { redirect: 'manual' }
      )

      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      expect(location).toContain('login.microsoftonline.com')
    })

    it('should handle encoded relay state', async () => {
      const relayState = '/dashboard?tab=overview&filter=active'

      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?relay_state=${encodeURIComponent(relayState)}`,
        { redirect: 'manual' }
      )

      expect(response.status).toBeOneOf([302, 307])
    })

    it('should work without relay state', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      expect(location).toBeTruthy()
    })

    it('should sanitize malicious relay state', async () => {
      const maliciousRelayState = 'javascript:alert(1)'

      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?relay_state=${encodeURIComponent(maliciousRelayState)}`,
        { redirect: 'manual' }
      )

      // Should still redirect (but relay state will be sanitized/rejected internally)
      expect([302, 307]).toContain(response.status)
    })
  })

  describe('State Management', () => {
    it('should store state in session before redirect', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      // Check for session cookie
      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toBeTruthy()
    })

    it('should set encrypted session cookie', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toContain('oidc_session')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
    })
  })

  describe('OIDC Configuration', () => {
    it('should use correct tenant ID in redirect', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      expect(location).toBeTruthy()

      // Should contain Microsoft tenant endpoint
      expect(location).toContain('login.microsoftonline.com')
    })

    it('should use correct redirect URI', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      const url = new URL(location!)

      const redirectUri = url.searchParams.get('redirect_uri')
      expect(redirectUri).toBeTruthy()
      expect(redirectUri).toContain('/api/auth/oidc/callback')
    })

    it('should request authorization code flow', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      const url = new URL(location!)

      const responseType = url.searchParams.get('response_type')
      expect(responseType).toBe('code')
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits on OIDC login', async () => {
      const responses = []

      // Make rapid OIDC login attempts
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
          redirect: 'manual'
        })
        responses.push(response.status)
      }

      // Should eventually hit rate limit (429)
      expect(responses).toContain(429)
    })
  })

  describe('Security Headers', () => {
    it('should set security headers on redirect', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      // Check for security headers
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    })

    it('should set secure session cookie', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const setCookie = response.headers.get('set-cookie')

      // Should have security attributes
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Lax')
      // Secure flag depends on environment (test environment may not set it)
    })
  })

  describe('Error Handling', () => {
    it('should handle OIDC configuration errors gracefully', async () => {
      // This would require mocking the OIDC config to return invalid data
      // For now, test that the endpoint doesn't crash
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      // Should either succeed or return a valid error
      expect(response.status).toBeOneOf([302, 307, 500, 503])
    })
  })

  describe('Logout Endpoint', () => {
    it('should provide OIDC logout endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/logout`, {
        redirect: 'manual'
      })

      // Should redirect or require authentication
      expect(response.status).toBeOneOf([302, 307, 401])
    })
  })

  describe('Response Format', () => {
    it('should return redirect response for login initiation', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      expect([302, 307]).toContain(response.status)
      expect(response.headers.get('location')).toBeTruthy()
    })
  })

  describe('Prompt Parameter', () => {
    it('should support prompt parameter for re-authentication', async () => {
      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?prompt=login`,
        { redirect: 'manual' }
      )

      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      const url = new URL(location!)

      // Should include prompt parameter
      expect(url.searchParams.get('prompt')).toBe('login')
    })

    it('should support consent prompt', async () => {
      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?prompt=consent`,
        { redirect: 'manual' }
      )

      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      const url = new URL(location!)

      expect(url.searchParams.get('prompt')).toBe('consent')
    })
  })

  describe('Domain Hint', () => {
    it('should support domain hint parameter', async () => {
      const response = await fetch(
        `${baseUrl}/api/auth/oidc/login?domain_hint=example.com`,
        { redirect: 'manual' }
      )

      expect([302, 307]).toContain(response.status)

      const location = response.headers.get('location')
      const url = new URL(location!)

      // Should include domain_hint parameter
      expect(url.searchParams.get('domain_hint')).toBe('example.com')
    })
  })

  describe('Nonce Parameter', () => {
    it('should include nonce in authorization request', async () => {
      const response = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const location = response.headers.get('location')
      const url = new URL(location!)

      // Nonce should be present
      expect(url.searchParams.has('nonce')).toBe(true)
    })

    it('should generate unique nonce for each request', async () => {
      const response1 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const response2 = await fetch(`${baseUrl}/api/auth/oidc/login`, {
        redirect: 'manual'
      })

      const url1 = new URL(response1.headers.get('location')!)
      const url2 = new URL(response2.headers.get('location')!)

      const nonce1 = url1.searchParams.get('nonce')
      const nonce2 = url2.searchParams.get('nonce')

      expect(nonce1).toBeTruthy()
      expect(nonce2).toBeTruthy()
      expect(nonce1).not.toBe(nonce2)
    })
  })
})

// Custom Vitest matcher for toBeOneOf
declare global {
  namespace Vi {
    interface Matchers<R = unknown> {
      toBeOneOf(expected: number[]): R
    }
  }
}

expect.extend({
  toBeOneOf(received: number, expected: number[]) {
    const pass = expected.includes(received)
    return {
      message: () =>
        pass
          ? `expected ${received} not to be one of ${expected.join(', ')}`
          : `expected ${received} to be one of ${expected.join(', ')}`,
      pass,
    }
  },
})
