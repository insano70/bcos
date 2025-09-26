import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, jwtVerify } from 'jose'
import { nanoid } from 'nanoid'
import { TokenManager } from '@/lib/auth/token-manager'

// Mock dependencies
vi.mock('jose', () => ({
  SignJWT: vi.fn(),
  jwtVerify: vi.fn()
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn()
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
    security: vi.fn(),
    timing: vi.fn()
  }))
}))

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn()
  },
  blacklisted_tokens: {},
  refresh_tokens: {}
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

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
          gte: vi.fn(() => []),
          lte: vi.fn(() => [])
        }))
      }))
    })),
    update: vi.fn(),
    delete: vi.fn()
  },
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

describe('TokenManager', () => {
  beforeEach(() => {
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
      } as any)

      // Mock database - no blacklisted token
      const { db } = await import('@/lib/db')
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [])
          }))
        }))
      } as any)

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
      } as any)

      // Mock database - token is blacklisted
      const mockDb: any = require('@/lib/db').db
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
    it('should revoke refresh token and update database', async () => {
      const mockToken = 'refresh.token'
      const mockPayload = {
        sub: 'user-123',
        jti: 'jti-123',
        session_id: 'session-123'
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      const mockDb: any = require('@/lib/db').db
      const now = new Date()

      vi.useFakeTimers()
      vi.setSystemTime(now)

      const result = await TokenManager.revokeRefreshToken(mockToken, 'logout')

      expect(mockDb.update).toHaveBeenCalledTimes(2) // refresh_tokens and user_sessions
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.any(Object), // token_blacklist table
        expect.objectContaining({
          jti: 'jti-123',
          user_id: 'user-123',
          token_type: 'refresh',
          reason: 'logout'
        })
      )

      expect(result).toBe(true)

      vi.useRealTimers()
    })

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

      const mockDb: any = require('@/lib/db').db

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
      const mockActiveTokens: any[] = []

      const mockDb: any = require('@/lib/db').db

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

  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens and return counts', async () => {
      const mockExpiredTokens = [{ count: 5 }]
      const mockExpiredBlacklist = [{ count: 3 }]

      const mockDb: any = require('@/lib/db').db
      mockDb.update.mockResolvedValue(mockExpiredTokens)
      mockDb.delete.mockResolvedValue(mockExpiredBlacklist)

      const result = await TokenManager.cleanupExpiredTokens()

      expect(mockDb.update).toHaveBeenCalled() // refresh_tokens update
      expect(mockDb.delete).toHaveBeenCalled() // token_blacklist delete
      expect(result).toEqual({
        refreshTokens: 5,
        blacklistEntries: 3
      })
    })

    it('should handle zero expired tokens', async () => {
      const mockExpiredTokens: any[] = []
      const mockExpiredBlacklist: any[] = []

      const mockDb: any = require('@/lib/db').db
      mockDb.update.mockResolvedValue(mockExpiredTokens)
      mockDb.delete.mockResolvedValue(mockExpiredBlacklist)

      const result = await TokenManager.cleanupExpiredTokens()

      expect(result).toEqual({
        refreshTokens: 0,
        blacklistEntries: 0
      })
    })
  })

  describe('createTokenPair', () => {
    it('should create token pair successfully', async () => {
      const userId = 'user-123'
      const deviceInfo = {
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome Browser',
        fingerprint: 'device-fingerprint',
        deviceName: 'Chrome Browser'
      }
      const email = 'test@example.com'
      const rememberMe = false

      // Mock user context
      const mockUserContext = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: true,
        roles: [{ role_id: 'role-1' }],
        user_roles: [{ user_role_id: 'ur-1' }],
        current_organization_id: 'org-1',
        is_super_admin: false,
        organization_admin_for: []
      }

      const { getCachedUserContextSafe } = require('@/lib/rbac/cached-user-context')
      vi.mocked(getCachedUserContextSafe).mockResolvedValue(mockUserContext)

      // Mock JWT signing
      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue('signed-token')
      }
      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      const now = new Date()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      const result = await TokenManager.createTokenPair(userId, deviceInfo, rememberMe, email)

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('expiresAt')
      expect(result).toHaveProperty('sessionId')
      expect(result.expiresAt.getTime()).toBe(now.getTime() + 15 * 60 * 1000) // 15 minutes

      vi.useRealTimers()
    })

    it('should throw error when user context cannot be loaded', async () => {
      const userId = 'user-123'
      const deviceInfo = {
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome Browser',
        fingerprint: 'device-fingerprint',
        deviceName: 'Chrome Browser'
      }

      const { getCachedUserContextSafe } = require('@/lib/rbac/cached-user-context')
      vi.mocked(getCachedUserContextSafe).mockResolvedValue(null)

      await expect(TokenManager.createTokenPair(userId, deviceInfo))
        .rejects
        .toThrow('Failed to load user context for JWT creation: user-123')
    })
  })

  describe('refreshTokenPair', () => {
    it('should refresh token pair successfully', async () => {
      const refreshToken = 'old.refresh.token'
      const deviceInfo = {
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome Browser',
        fingerprint: 'device-fingerprint',
        deviceName: 'Chrome Browser'
      }

      // Mock refresh token verification
      const mockPayload = {
        sub: 'user-123',
        jti: 'old-jti',
        session_id: 'session-123',
        remember_me: false
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      // Mock token record lookup
      const mockTokenRecord = {
        token_id: 'old-jti',
        user_id: 'user-123',
        rotation_count: 1
      }

      const mockDb: any = require('@/lib/db').db
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [mockTokenRecord])
          }))
        }))
      })

      // Mock user context
      const mockUserContext = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: true,
        roles: [{ role_id: 'role-1' }],
        user_roles: [{ user_role_id: 'ur-1' }],
        current_organization_id: 'org-1',
        is_super_admin: false,
        organization_admin_for: []
      }

      const { getCachedUserContextSafe } = require('@/lib/rbac/cached-user-context')
      vi.mocked(getCachedUserContextSafe).mockResolvedValue(mockUserContext)

      // Mock JWT signing
      const mockSignJWT = {
        setProtectedHeader: vi.fn().mockReturnThis(),
        setJti: vi.fn().mockReturnThis(),
        setIssuedAt: vi.fn().mockReturnThis(),
        setExpirationTime: vi.fn().mockReturnThis(),
        sign: vi.fn().mockResolvedValue('new-token')
      }
      vi.mocked(SignJWT).mockReturnValue(mockSignJWT as any)

      const result = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)

      expect(result).toBeTruthy()
      expect(result?.accessToken).toBe('new-token')
      expect(result?.refreshToken).toBe('new-token')
      expect(result?.sessionId).toBe('session-123')
    })

    it('should return null for invalid refresh token', async () => {
      const refreshToken = 'invalid.token'
      const deviceInfo = {
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome Browser',
        fingerprint: 'device-fingerprint',
        deviceName: 'Chrome Browser'
      }

      vi.mocked(jwtVerify).mockRejectedValue(new Error('Invalid token'))

      const result = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)

      expect(result).toBeNull()
    })

    it('should return null when refresh token not found', async () => {
      const refreshToken = 'valid.token'
      const deviceInfo = {
        ipAddress: '192.168.1.100',
        userAgent: 'Chrome Browser',
        fingerprint: 'device-fingerprint',
        deviceName: 'Chrome Browser'
      }

      const mockPayload = {
        sub: 'user-123',
        jti: 'jti-123',
        session_id: 'session-123'
      }

      vi.mocked(jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: { alg: 'HS256' }
      } as any)

      // Mock token record lookup - no record found
      const mockDb: any = require('@/lib/db').db
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [])
          }))
        }))
      })

      const result = await TokenManager.refreshTokenPair(refreshToken, deviceInfo)

      expect(result).toBeNull()
    })
  })
})
