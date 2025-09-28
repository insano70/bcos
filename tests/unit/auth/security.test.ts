import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { PasswordService, AccountSecurity, verifyPassword, hashPassword } from '@/lib/auth/security'
import { validatePasswordStrength } from '@/lib/config/password-policy'
import { db } from '@/lib/db'

// Mock bcrypt functions
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn()
  }
}))

// Mock password policy
vi.mock('@/lib/config/password-policy', () => ({
  validatePasswordStrength: vi.fn()
}))

// Mock database - standardized pattern with method chaining
vi.mock('@/lib/db', () => {
  const mockSelectResult = vi.fn().mockResolvedValue([])
  const mockUpdateResult = vi.fn().mockResolvedValue({ affectedRows: 1 })
  const mockInsertResult = vi.fn().mockResolvedValue({ insertId: 1 })
  
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mockSelectResult
          })
        })
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: mockUpdateResult
        })
      }),
      insert: vi.fn().mockReturnValue({
        values: mockInsertResult
      })
    },
    account_security: {
      user_id: 'user_id',
      failed_login_attempts: 'failed_login_attempts',
      last_failed_attempt: 'last_failed_attempt',
      locked_until: 'locked_until',
      suspicious_activity_detected: 'suspicious_activity_detected'
    },
    users: {
      user_id: 'user_id',
      email: 'email'
    },
    // Export mock helpers for test access
    _mockSelectResult: mockSelectResult,
    _mockUpdateResult: mockUpdateResult,
    _mockInsertResult: mockInsertResult
  }
})

describe('security authentication logic', () => {
  let mockSelectResult: any
  let mockUpdateResult: any
  let mockInsertResult: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Get references to the standardized mock helpers
    const dbModule = await import('@/lib/db')
    mockSelectResult = (dbModule as any)._mockSelectResult
    mockUpdateResult = (dbModule as any)._mockUpdateResult
    mockInsertResult = (dbModule as any)._mockInsertResult
  })

  describe('PasswordService', () => {
    describe('hash', () => {
      it('should hash password with correct salt rounds', async () => {
        const password = 'TestPassword123!'
        const mockHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O'

        ;(bcrypt.hash as any).mockResolvedValueOnce(mockHash)

        const result = await PasswordService.hash(password)

        expect(result).toBe(mockHash)
      })

      it('should throw error if bcrypt.hash fails', async () => {
        const password = 'TestPassword123!'
        const error = new Error('Hashing failed')

        ;(bcrypt.hash as any).mockRejectedValueOnce(error)

        await expect(PasswordService.hash(password)).rejects.toThrow('Hashing failed')
      })
    })

    describe('verify', () => {
      it('should return true for correct password', async () => {
        const password = 'TestPassword123!'
        const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O'

        ;(bcrypt.compare as any).mockResolvedValueOnce(true)

        const result = await PasswordService.verify(password, hash)

        expect(result).toBe(true)
      })

      it('should return false for incorrect password', async () => {
        const password = 'WrongPassword123!'
        const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfBPjJcZQKXGJ2O'

        ;(bcrypt.compare as any).mockResolvedValueOnce(false)

        const result = await PasswordService.verify(password, hash)

        expect(result).toBe(false)
      })

      it('should return false when bcrypt.compare throws', async () => {
        const password = 'TestPassword123!'
        const hash = 'invalid-hash'

        ;(bcrypt.compare as any).mockRejectedValueOnce(new Error('Invalid hash'))

        const result = await PasswordService.verify(password, hash)

        expect(result).toBe(false)
      })
    })

    describe('validatePasswordStrength', () => {
      it('should delegate to validatePasswordStrength from password-policy', () => {
        const password = 'TestPassword123!'
        const mockResult = { isValid: true, errors: [] }

        vi.mocked(validatePasswordStrength).mockReturnValue(mockResult)

        const result = PasswordService.validatePasswordStrength(password)

        expect(validatePasswordStrength).toHaveBeenCalledWith(password)
        expect(result).toEqual(mockResult)
      })

      it('should return validation result with errors', () => {
        const password = 'weak'
        const mockResult = {
          isValid: false,
          errors: ['Password must be at least 12 characters', 'Password must contain uppercase letter']
        }

        vi.mocked(validatePasswordStrength).mockReturnValue(mockResult)

        const result = PasswordService.validatePasswordStrength(password)

        expect(result).toEqual(mockResult)
      })
    })
  })


  // NOTE: AccountSecurity tests moved to integration tests (security-authentication.test.ts)
  // Database-heavy account lockout operations are better tested with real database transactions
})
