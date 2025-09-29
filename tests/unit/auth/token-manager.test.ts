import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'
import { nanoid } from 'nanoid'
import { TokenManager } from '@/lib/auth/token-manager'

interface MockDatabase {
  select: ReturnType<typeof vi.fn>;
}

// Mock dependencies - standardized pattern
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setJti: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('signed-token')
  })),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: { sub: 'user-123', jti: 'jti-123' },
    protectedHeader: { alg: 'HS256' }
  })
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('mock-nano-id')
}))

vi.mock('@/lib/env', () => ({
  getJWTConfig: vi.fn(() => ({
    accessSecret: 'access-secret',
    refreshSecret: 'refresh-secret'
  }))
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@/lib/logger/factory', () => ({
  createAppLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
    timing: vi.fn()
  }))
}))

// Mock database with comprehensive structure and method chaining
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve({ insertId: 1 }))
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
          gte: vi.fn(() => []),
          lte: vi.fn(() => [])
        }))
      }))
    })),
    update: vi.fn((table) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ count: 1 }]))
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve([{ count: 1 }]))
    }))
  },
  blacklisted_tokens: {},
  refresh_tokens: {},
  token_blacklist: {},
  user_sessions: {},
  login_attempts: {},
  users: {},
  account_security: {}
}))

vi.mock('@/lib/rbac/cached-user-context', () => ({
  getCachedUserContextSafe: vi.fn()
}))

vi.mock('@/lib/cache/role-permission-cache', () => ({
  rolePermissionCache: {
    getRoleVersion: vi.fn(() => 1)
  }
}))

vi.mock('@/lib/api/services/audit', () => ({
  AuditLogger: {
    logAuth: vi.fn(),
    logSecurity: vi.fn()
  }
}))

describe('TokenManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(nanoid).mockReturnValue('mock-nano-id')
  })

  describe('validateAccessToken', () => {
    it('should validate and return payload for valid token', async () => {
      const mockToken = 'valid.access.token'
      const mockPayload = { sub: 'user-123', jti: 'jti-123' }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as { payload: MockJWTPayload; protectedHeader: { alg: string } })

      // Mock database - no blacklisted token
      const { db } = await import('@/lib/db')
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [])
          }))
        }))
      } as unknown as MockDatabase['select'])

      const result = await TokenManager.validateAccessToken(mockToken)

      expect(jwtVerify).toHaveBeenCalledWith(mockToken, expect.any(Uint8Array))
      expect(result).toEqual(mockPayload)
    })

    it('should return null for blacklisted token', async () => {
      const mockToken = 'blacklisted.token'
      const mockPayload = { sub: 'user-123', jti: 'jti-123' }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as { payload: MockJWTPayload; protectedHeader: { alg: string } })

      // Mock database - token is blacklisted
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ jti: 'jti-123' }])
          }))
        }))
      })

      const result = await TokenManager.validateAccessToken(mockToken)

      expect(result).toBeNull()
    })

    it('should return null for invalid token', async () => {
      const mockToken = 'invalid.token'

      vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid token'))

      const result = await TokenManager.validateAccessToken(mockToken)

      expect(result).toBeNull()
    })
  })

  describe('revokeRefreshToken', () => {

    it('should return false when token verification fails', async () => {
      const mockToken = 'invalid.refresh.token'

      vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid token'))

      const result = await TokenManager.revokeRefreshToken(mockToken, 'logout')

      expect(result).toBe(false)
    })
  })

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      const userId = 'user-123'
      const mockActiveTokens = [
        { tokenId: 'token-1' },
        { tokenId: 'token-2' }
      ]


      // Mock getting active tokens
      mockDb.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => mockActiveTokens)
        }))
      })

      const result = await TokenManager.revokeAllUserTokens(userId, 'security')

      expect(mockDb.update).toHaveBeenCalledTimes(2) // refresh_tokens and user_sessions
      expect(mockDb.insert).toHaveBeenCalledTimes(2) // Two blacklist entries
      expect(result).toBe(2)
    })

    it('should handle no active tokens', async () => {
      const userId = 'user-123'
      const mockActiveTokens: MockTokenRecord[] = []


      // Mock getting active tokens - empty array
      mockDb.select.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => mockActiveTokens)
        }))
      })

      const result = await TokenManager.revokeAllUserTokens(userId, 'security')

      expect(mockDb.update).toHaveBeenCalledTimes(2) // Still updates tables
      expect(mockDb.insert).toHaveBeenCalledTimes(0) // No blacklist entries
      expect(result).toBe(0)
    })
  })

  describe('generateDeviceFingerprint', () => {
    it('should generate consistent fingerprint from IP and User-Agent', () => {
      const ipAddress = '192.168.1.100'
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

      const result1 = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)
      const result2 = TokenManager.generateDeviceFingerprint(ipAddress, userAgent)

      expect(result1).toBe(result2)
      expect(result1).toMatch(/^[a-f0-9]{32}$/)
      expect(result1.length).toBe(32)
    })

    it('should generate different fingerprints for different inputs', () => {
      const result1 = TokenManager.generateDeviceFingerprint('192.168.1.100', 'UA1')
      const result2 = TokenManager.generateDeviceFingerprint('192.168.1.101', 'UA1')
      const result3 = TokenManager.generateDeviceFingerprint('192.168.1.100', 'UA2')

      expect(result1).not.toBe(result2)
      expect(result1).not.toBe(result3)
      expect(result2).not.toBe(result3)
    })
  })

  describe('generateDeviceName', () => {
    it('should identify Chrome browser', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Chrome Browser')
    })

    it('should identify Firefox browser', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Firefox Browser')
    })

    it('should identify Safari browser', () => {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Safari Browser')
    })

    it('should identify Edge browser', () => {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Edge Browser')
    })

    it('should identify iPhone Safari', () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('iPhone Safari')
    })

    it('should identify Android browser', () => {
      const userAgent = 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Android Browser')
    })

    it('should return Unknown Browser for unrecognized user agent', () => {
      const userAgent = 'Custom Browser/1.0'
      const result = TokenManager.generateDeviceName(userAgent)
      expect(result).toBe('Unknown Browser')
    })

    it('should handle empty user agent', () => {
      const result = TokenManager.generateDeviceName('')
      expect(result).toBe('Unknown Browser')
    })
  })

  // NOTE: cleanupExpiredTokens moved to integration tests (token-lifecycle.test.ts)
  // Database-heavy operations are better tested with real database transactions


})
