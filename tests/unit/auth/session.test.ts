import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCurrentUserFromToken,
  validateTokenAndGetUser,
  requireTokenRole,
  requireTokenAdmin,
  requireTokenPracticeAccess
} from '@/lib/auth/session'
import { TokenManager } from '@/lib/auth/token-manager'
import { db } from '@/lib/db'

// Mock TokenManager
vi.mock('@/lib/auth/token-manager', () => ({
  TokenManager: {
    validateAccessToken: vi.fn()
  }
}))

// Mock database with simpler approach
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([])
        })
      })
    })
  },
  users: {
    user_id: 'user_id',
    email: 'email',
    first_name: 'first_name',
    last_name: 'last_name',
    is_active: 'is_active',
    email_verified: 'email_verified'
  }
}))

describe('session authentication logic', () => {
  let mockDb: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Get reference to the mocked database
    const { db } = await import('@/lib/db')
    mockDb = vi.mocked(db)
  })

  describe('getCurrentUserFromToken', () => {
    it('should return user data for valid token and active user', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        firstName: 'John',
        lastName: 'Doe'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await getCurrentUserFromToken(mockToken)

      expect(TokenManager.validateAccessToken).toHaveBeenCalledWith(mockToken)
      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        emailVerified: true,
        practiceId: undefined
      })
    })

    it('should return null for invalid token', async () => {
      const mockToken = 'invalid.jwt.token'

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(null)

      const result = await getCurrentUserFromToken(mockToken)

      expect(TokenManager.validateAccessToken).toHaveBeenCalledWith(mockToken)
      expect(result).toBeNull()
    })

    it('should return null for inactive user', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: false,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toBeNull()
    })

    it('should return null when user not found', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([]) // No user found

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toBeNull()
    })

    it('should return null when token validation throws', async () => {
      const mockToken = 'malformed.jwt.token'

      vi.mocked(TokenManager.validateAccessToken).mockRejectedValue(new Error('Invalid token'))

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toBeNull()
    })

    it('should handle payload without sub field', async () => {
      const mockToken = 'token.without.sub'
      const mockPayload = {
        email: 'test@example.com',
        role: 'admin'
        // Missing sub field
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toBeNull()
    })

    it('should handle database query errors gracefully', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockRejectedValue(new Error('Database connection failed'))

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toBeNull()
    })

    it('should return user with unverified email', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        email_verified: false
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await getCurrentUserFromToken(mockToken)

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        emailVerified: false,
        practiceId: undefined
      })
    })
  })

  describe('validateTokenAndGetUser', () => {
    it('should return user for valid token', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await validateTokenAndGetUser(mockToken)

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        role: 'admin',
        emailVerified: true,
        practiceId: undefined
      })
    })

    it('should throw error for invalid token', async () => {
      const mockToken = 'invalid.jwt.token'

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(null)

      await expect(validateTokenAndGetUser(mockToken))
        .rejects
        .toThrow('Authentication required')
    })

    it('should throw error for inactive user', async () => {
      const mockToken = 'valid.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_active: false,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(validateTokenAndGetUser(mockToken))
        .rejects
        .toThrow('Authentication required')
    })
  })

  describe('requireTokenRole', () => {
    it('should return user for allowed role', async () => {
      const mockToken = 'admin.jwt.token'
      const allowedRoles = ['admin', 'moderator']
      const mockPayload = {
        sub: 'user-123',
        email: 'admin@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await requireTokenRole(mockToken, allowedRoles)

      expect(result.role).toBe('admin')
    })

    it('should throw error for insufficient role', async () => {
      const mockToken = 'user.jwt.token'
      const allowedRoles = ['admin']
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'user@example.com',
        first_name: 'Regular',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenRole(mockToken, allowedRoles))
        .rejects
        .toThrow('Access denied. Required role: admin')
    })

    it('should handle multiple allowed roles', async () => {
      const mockToken = 'moderator.jwt.token'
      const allowedRoles = ['admin', 'moderator', 'editor']
      const mockPayload = {
        sub: 'user-123',
        email: 'mod@example.com',
        role: 'moderator'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'mod@example.com',
        first_name: 'Mod',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await requireTokenRole(mockToken, allowedRoles)

      expect(result.role).toBe('moderator')
    })

    it('should format error message for multiple roles', async () => {
      const mockToken = 'user.jwt.token'
      const allowedRoles = ['admin', 'moderator']
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'user@example.com',
        first_name: 'Regular',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenRole(mockToken, allowedRoles))
        .rejects
        .toThrow('Access denied. Required role: admin or moderator')
    })
  })

  describe('requireTokenAdmin', () => {
    it('should return user for admin role', async () => {
      const mockToken = 'admin.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'admin@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await requireTokenAdmin(mockToken)

      expect(result.role).toBe('admin')
    })

    it('should throw error for non-admin role', async () => {
      const mockToken = 'user.jwt.token'
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'user@example.com',
        first_name: 'Regular',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenAdmin(mockToken))
        .rejects
        .toThrow('Access denied. Required role: admin')
    })
  })

  describe('requireTokenPracticeAccess', () => {
    it('should allow admin access to any practice', async () => {
      const mockToken = 'admin.jwt.token'
      const practiceId = 'practice-456'
      const mockPayload = {
        sub: 'user-123',
        email: 'admin@example.com',
        role: 'admin'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'admin@example.com',
        first_name: 'Admin',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await requireTokenPracticeAccess(mockToken, practiceId)

      expect(result.role).toBe('admin')
    })

    it('should allow practice owner access to their own practice', async () => {
      const mockToken = 'owner.jwt.token'
      const practiceId = 'practice-456'
      const mockPayload = {
        sub: 'user-123',
        email: 'owner@example.com',
        role: 'practice_owner'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'owner@example.com',
        first_name: 'Practice',
        last_name: 'Owner',
        is_active: true,
        email_verified: true,
        practiceId: 'practice-456' // User owns this practice
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      const result = await requireTokenPracticeAccess(mockToken, practiceId)

      expect(result.role).toBe('practice_owner')
    })

    it('should deny practice owner access to different practice', async () => {
      const mockToken = 'owner.jwt.token'
      const practiceId = 'different-practice-789'
      const mockPayload = {
        sub: 'user-123',
        email: 'owner@example.com',
        role: 'practice_owner'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'owner@example.com',
        first_name: 'Practice',
        last_name: 'Owner',
        is_active: true,
        email_verified: true,
        practiceId: 'practice-456' // User owns different practice
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenPracticeAccess(mockToken, practiceId))
        .rejects
        .toThrow('You do not have access to this practice')
    })

    it('should deny non-admin/non-owner access', async () => {
      const mockToken = 'user.jwt.token'
      const practiceId = 'practice-456'
      const mockPayload = {
        sub: 'user-123',
        email: 'user@example.com',
        role: 'user'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'user@example.com',
        first_name: 'Regular',
        last_name: 'User',
        is_active: true,
        email_verified: true
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenPracticeAccess(mockToken, practiceId))
        .rejects
        .toThrow('You do not have access to this practice')
    })

    it('should handle practice owner with undefined practiceId', async () => {
      const mockToken = 'owner.jwt.token'
      const practiceId = 'practice-456'
      const mockPayload = {
        sub: 'user-123',
        email: 'owner@example.com',
        role: 'practice_owner'
      }
      const mockUser = {
        user_id: 'user-123',
        email: 'owner@example.com',
        first_name: 'Practice',
        last_name: 'Owner',
        is_active: true,
        email_verified: true,
        practiceId: undefined // No practice assigned
      }

      vi.mocked(TokenManager.validateAccessToken).mockResolvedValue(mockPayload)
      mockDbLimit.mockResolvedValue([mockUser])

      await expect(requireTokenPracticeAccess(mockToken, practiceId))
        .rejects
        .toThrow('You do not have access to this practice')
    })
  })
})
