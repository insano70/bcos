/**
 * CSRF Token Lifecycle Integration Tests
 * Tests the complete CSRF token lifecycle including cross-time-window scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateAnonymousToken, verifyCSRFToken, validateAnonymousToken, generateAuthenticatedToken, validateAuthenticatedToken } from '@/lib/security/csrf-unified'
import { validateTokenStructure } from '@/lib/security/csrf-client'
import type { NextRequest } from 'next/server'

// Mock the CSRF monitoring instance to use our test mock
vi.mock('@/lib/security/csrf-monitoring-instance', async () => {
  const mock = await import('../helpers/csrf-monitor-mock')
  return {
    csrfMonitor: mock.getMockCSRFMonitor(),
    getCSRFMonitor: () => mock.getMockCSRFMonitor(),
    resetCSRFMonitor: () => mock.resetMockCSRFMonitor(),
  }
})

// Import test helpers
import { getMockCSRFMonitor } from '../helpers/csrf-monitor-mock'

// Mock environment variables
const mockEnv = {
  NODE_ENV: 'test',
  CSRF_SECRET: 'test-csrf-secret-that-is-long-enough-for-security-requirements-32-chars'
}

// Mock fetch for server requests
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
  }),
}))

// Mock Web Crypto API for testing
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      verify: vi.fn().mockResolvedValue(true),
    },
  },
  writable: true,
})

// Helper to create mock NextRequest
function createMockRequest(options: {
  pathname?: string
  ip?: string
  userAgent?: string
  method?: string
  headers?: Record<string, string>
  cookies?: Record<string, string>
} = {}): NextRequest {
  const headers = new Headers()
  Object.entries(options.headers || {}).forEach(([key, value]) => {
    headers.set(key, value)
  })

  if (options.ip) headers.set('x-forwarded-for', options.ip)
  if (options.userAgent) headers.set('user-agent', options.userAgent)

  const pathname = options.pathname || '/api/test'
  const baseUrl = 'http://localhost:3000'

  return {
    method: options.method || 'POST',
    headers,
    url: `${baseUrl}${pathname}`, // Add proper URL
    nextUrl: {
      pathname: pathname,
      href: `${baseUrl}${pathname}`
    },
    cookies: {
      get: (name: string) => ({
        value: options.cookies?.[name] || null,
      }),
    },
  } as any
}

describe('CSRF Token Lifecycle Integration Tests', () => {
  beforeEach(async () => {
    // Set up environment variables
    Object.entries(mockEnv).forEach(([key, value]) => {
      process.env[key] = value
      if (globalThis.process?.env) {
        globalThis.process.env[key] = value
      }
    })

    // Clear security monitor state
    const monitor = getMockCSRFMonitor()
    await monitor.clearAllEvents()

    // Clear fetch mock
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Anonymous Token Lifecycle', () => {
    it('should generate valid anonymous tokens', async () => {
      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(request)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(2)
      
      // Token should be base64 encoded payload + hex signature
      const [payload, signature] = token.split('.')
      expect(payload).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(signature).toMatch(/^[a-f0-9]+$/)
    })

    it('should validate anonymous tokens with matching request fingerprint', async () => {
      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(request)
      const isValid = await validateAnonymousToken(request, token)
      
      expect(isValid).toBe(true)
    })

    it('should reject anonymous tokens with different IP address', async () => {
      const originalRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(originalRequest)

      const differentRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.2', // Different IP
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const isValid = await validateAnonymousToken(differentRequest, token)
      expect(isValid).toBe(false)
    })

    it('should reject anonymous tokens with different User-Agent', async () => {
      const originalRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(originalRequest)

      const differentRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Chrome/91.0 Different Browser' // Different UA
      })

      const isValid = await validateAnonymousToken(differentRequest, token)
      expect(isValid).toBe(false)
    })
  })

  describe('Cross-Time-Window Scenarios', () => {
    it('should handle time window transitions in development', async () => {
      // Mock development environment
      vi.stubEnv('NODE_ENV', 'development')

      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(request)
      
      // Mock time passage to next window (15 minutes in dev = 900000ms)
      const originalNow = Date.now
      const mockNow = vi.fn().mockReturnValue(originalNow() + 900001) // Just past window
      Date.now = mockNow

      try {
        // In development, should allow 1 window drift
        const isValid = await validateAnonymousToken(request, token)
        expect(isValid).toBe(true)
      } finally {
        Date.now = originalNow
      }
    })

    it('should reject tokens beyond time window in production', async () => {
      // Mock production environment
      vi.stubEnv('NODE_ENV', 'production')

      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const token = await generateAnonymousToken(request)
      
      // Mock time passage to next window (5 minutes in prod = 300000ms)
      const originalNow = Date.now
      const mockNow = vi.fn().mockReturnValue(originalNow() + 300001) // Just past window
      Date.now = mockNow

      try {
        // In production, should reject tokens from different time windows
        const isValid = await validateAnonymousToken(request, token)
        expect(isValid).toBe(false)
      } finally {
        Date.now = originalNow
      }
    })
  })

  describe('Authenticated Token Lifecycle', () => {
    it('should generate valid authenticated tokens', async () => {
      const userId = 'test-user-123'
      const token = await generateAuthenticatedToken(userId)
      
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(2)

      // Decode and verify payload structure
      const [encodedPayload] = token.split('.')
      expect(encodedPayload).toBeDefined()
      const payload = JSON.parse(atob(encodedPayload!))
      
      expect(payload.type).toBe('authenticated')
      expect(payload.userId).toBe(userId)
      expect(payload.timestamp).toBeTypeOf('number')
      expect(payload.nonce).toBeDefined()
    })

    it('should validate fresh authenticated tokens', async () => {
      const userId = 'test-user-123'
      const token = await generateAuthenticatedToken(userId)
      const isValid = await validateAuthenticatedToken(token)
      
      expect(isValid).toBe(true)
    })

    it('should reject expired authenticated tokens', async () => {
      const userId = 'test-user-123'
      
      // Mock token generation 25 hours ago (beyond 24 hour limit)
      const originalNow = Date.now
      const pastTime = originalNow() - (25 * 60 * 60 * 1000)
      Date.now = vi.fn().mockReturnValue(pastTime)

      const token = await generateAuthenticatedToken(userId)
      
      // Restore current time for validation
      Date.now = originalNow

      const isValid = await validateAuthenticatedToken(token)
      expect(isValid).toBe(false)
    })
  })

  describe('Client-Side Token Validation', () => {
    it('should validate token structure correctly', () => {
      const validTokenData = {
        type: 'anonymous',
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        timeWindow: Math.floor(Date.now() / 300000),
        nonce: 'test123'
      }

      const encodedPayload = btoa(JSON.stringify(validTokenData))
      const signature = 'abcd1234' // Mock signature
      const token = `${encodedPayload}.${signature}`

      const validation = validateTokenStructure(token)
      expect(validation.isValid).toBe(true)
      expect(validation.shouldRefresh).toBe(false)
    })

    it('should detect invalid token formats', () => {
      const invalidTokens = [
        '', // Empty
        'invalid', // No dot separator
        'payload.', // Missing signature
        '.signature', // Missing payload
        'payload.signature.extra', // Too many parts
      ]

      invalidTokens.forEach(token => {
        const validation = validateTokenStructure(token)
        expect(validation.isValid).toBe(false)
        expect(validation.shouldRefresh).toBe(true)
      })
    })

    it('should detect expired authenticated tokens', () => {
      const expiredTokenData = {
        type: 'authenticated',
        timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
        nonce: 'test123',
        userId: 'test-user'
      }

      const encodedPayload = btoa(JSON.stringify(expiredTokenData))
      const token = `${encodedPayload}.signature`

      const validation = validateTokenStructure(token)
      expect(validation.isValid).toBe(false)
      expect(validation.reason).toBe('token_expired')
      expect(validation.shouldRefresh).toBe(true)
    })

    it('should detect expired anonymous tokens', () => {
      const currentWindow = Math.floor(Date.now() / 300000)
      const expiredTokenData = {
        type: 'anonymous',
        timeWindow: currentWindow - 5, // 5 windows ago (too old)
        ip: '192.168.1.1',
        userAgent: 'Test Browser',
        nonce: 'test123'
      }

      const encodedPayload = btoa(JSON.stringify(expiredTokenData))
      const token = `${encodedPayload}.signature`

      const validation = validateTokenStructure(token)
      expect(validation.isValid).toBe(false)
      expect(validation.reason).toBe('time_window_expired')
      expect(validation.shouldRefresh).toBe(true)
    })
  })

  describe('Security Monitoring Integration', () => {
    it('should record CSRF failures for monitoring', async () => {
      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Malicious Bot'
      })

      // Generate token with one request, validate with different IP
      const token = await generateAnonymousToken(request)
      
      const differentRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.2', // Different IP
        userAgent: 'Malicious Bot'
      })

      // This should fail validation and record the failure
      const isValid = await verifyCSRFToken(differentRequest)
      expect(isValid).toBe(false)

      // Check that failure was recorded
      const monitor = getMockCSRFMonitor()
      const stats = await monitor.getFailureStats()
      expect(stats.totalEvents).toBeGreaterThan(0)
      expect(stats.topIPs).toContainEqual(
        expect.objectContaining({
          ip: '192.168.1.2',
          count: expect.any(Number)
        })
      )
    })

    it('should detect attack patterns', async () => {
      const attackIP = '192.168.1.100'
      
      // Simulate multiple rapid failures from same IP
      for (let i = 0; i < 15; i++) {
        const request = createMockRequest({
          pathname: `/api/auth/login`,
          ip: attackIP,
          userAgent: 'Attack Bot',
          headers: {
            'x-csrf-token': 'invalid-token'
          }
        })

        // This should fail and record the failure
        await verifyCSRFToken(request)
      }

      const monitor = getMockCSRFMonitor()
      const stats = await monitor.getFailureStats()
      expect(stats.totalEvents).toBeGreaterThanOrEqual(15)
      
      const attackerStats = stats.topIPs.find((ipStats) => ipStats.ip === attackIP)
      expect(attackerStats).toBeDefined()
      expect(attackerStats?.count).toBeGreaterThanOrEqual(15)
    })
  })

  describe('End-to-End Token Flow', () => {
    it('should handle complete anonymous token lifecycle', async () => {
      // 1. Generate anonymous token for login
      const loginRequest = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const anonymousToken = await generateAnonymousToken(loginRequest)
      
      // 2. Validate token on login request
      const loginRequestWithToken = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        headers: {
          'x-csrf-token': anonymousToken
        }
      })

      const isLoginValid = await verifyCSRFToken(loginRequestWithToken)
      expect(isLoginValid).toBe(true)

      // 3. After login, generate authenticated token
      const userId = 'test-user-123'
      const authenticatedToken = await generateAuthenticatedToken(userId)

      // 4. Use authenticated token for protected endpoint
      const protectedRequest = createMockRequest({
        pathname: '/api/user/profile',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        headers: {
          'x-csrf-token': authenticatedToken
        },
        cookies: {
          'csrf-token': authenticatedToken
        }
      })

      const isProtectedValid = await verifyCSRFToken(protectedRequest)
      expect(isProtectedValid).toBe(true)
    })

    it('should prevent anonymous tokens on protected endpoints', async () => {
      // 1. Generate anonymous token
      const request = createMockRequest({
        pathname: '/api/auth/login',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser'
      })

      const anonymousToken = await generateAnonymousToken(request)
      
      // 2. Try to use anonymous token on protected endpoint (should fail)
      const protectedRequest = createMockRequest({
        pathname: '/api/user/profile', // Protected endpoint
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        headers: {
          'x-csrf-token': anonymousToken // Anonymous token on protected endpoint
        },
        cookies: {
          'csrf-token': 'some-cookie-token'
        }
      })

      const isValid = await verifyCSRFToken(protectedRequest)
      expect(isValid).toBe(false) // Should reject anonymous token on protected endpoint

      // Should also record high-severity security event
      const monitor = getMockCSRFMonitor()
      const stats = await monitor.getFailureStats()
      expect(stats.totalEvents).toBeGreaterThan(0)
    })
  })
})
