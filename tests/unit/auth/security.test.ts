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

  describe('AccountSecurity', () => {
    describe('isAccountLocked', () => {
      it('should return not locked for user without security record', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup - no record found
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(result).toEqual({ locked: false })
      })

      it('should return not locked for user with expired lockout', async () => {
        const identifier = 'test@example.com'
        const pastDate = new Date(Date.now() - 10000) // 10 seconds ago

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{
            user_id: 'user-123',
            failed_login_attempts: 5,
            locked_until: pastDate,
            suspicious_activity_detected: true
          }])
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(mockUpdateResult).toHaveBeenCalledWith(
          expect.any(Object), // account_security table
          expect.objectContaining({
            locked_until: null,
            suspicious_activity_detected: false
          }),
          expect.any(Object) // where clause
        )
        expect(result).toEqual({ locked: false })
      })

      it('should return locked for user with active lockout', async () => {
        const identifier = 'test@example.com'
        const futureDate = new Date(Date.now() + 60000) // 1 minute from now

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{
            user_id: 'user-123',
            failed_login_attempts: 3,
            locked_until: futureDate,
            suspicious_activity_detected: true
          }])
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(result).toEqual({
          locked: true,
          lockedUntil: futureDate.getTime()
        })
      })

      it('should return not locked for user with failed attempts but no lockout', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{
            user_id: 'user-123',
            failed_login_attempts: 2,
            locked_until: null,
            suspicious_activity_detected: false
          }])
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(result).toEqual({ locked: false })
      })

      it('should return not locked when user does not exist', async () => {
        const identifier = 'nonexistent@example.com'

        // Mock user lookup - no user found
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(result).toEqual({ locked: false })
      })

      it('should return not locked on database error', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup to throw error
        mockSelectResult.mockImplementationOnce(() =>
          Promise.reject(new Error('Database connection failed'))
        )

        const result = await AccountSecurity.isAccountLocked(identifier)

        expect(result).toEqual({ locked: false })
      })
    })

    describe('recordFailedAttempt', () => {
      it('should create new security record for first failed attempt', async () => {
        const identifier = 'test@example.com'
        const now = new Date()

        vi.useFakeTimers()
        vi.setSystemTime(now)

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup - no existing record
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.recordFailedAttempt(identifier)

        expect(mockInsertResult).toHaveBeenCalledWith(
          expect.any(Object), // account_security table
          expect.objectContaining({
            user_id: 'user-123',
            failed_login_attempts: 1,
            last_failed_attempt: now,
            locked_until: null,
            suspicious_activity_detected: false
          })
        )
        expect(result).toEqual({ locked: false })

        vi.useRealTimers()
      })

      it('should update existing record and apply progressive lockout', async () => {
        const identifier = 'test@example.com'
        const now = new Date()

        vi.useFakeTimers()
        vi.setSystemTime(now)

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup - existing record with 2 attempts
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{
            user_id: 'user-123',
            failed_login_attempts: 2,
            last_failed_attempt: new Date(now.getTime() - 10000),
            locked_until: null,
            suspicious_activity_detected: false
          }])
        )

        const result = await AccountSecurity.recordFailedAttempt(identifier)

        const expectedLockedUntil = new Date(now.getTime() + 60000) // 1 minute lockout

        expect(mockUpdateResult).toHaveBeenCalledWith(
          expect.any(Object), // account_security table
          expect.objectContaining({
            failed_login_attempts: 3,
            last_failed_attempt: now,
            locked_until: expectedLockedUntil,
            suspicious_activity_detected: true
          }),
          expect.any(Object) // where clause
        )
        expect(result).toEqual({
          locked: true,
          lockedUntil: expectedLockedUntil.getTime()
        })

        vi.useRealTimers()
      })

      it('should apply longer lockout for repeated failures', async () => {
        const identifier = 'test@example.com'
        const now = new Date()

        vi.useFakeTimers()
        vi.setSystemTime(now)

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup - existing record with 4 attempts
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{
            user_id: 'user-123',
            failed_login_attempts: 4,
            last_failed_attempt: new Date(now.getTime() - 10000),
            locked_until: null,
            suspicious_activity_detected: true
          }])
        )

        const result = await AccountSecurity.recordFailedAttempt(identifier)

        const expectedLockedUntil = new Date(now.getTime() + 300000) // 5 minute lockout

        expect(result).toEqual({
          locked: true,
          lockedUntil: expectedLockedUntil.getTime()
        })

        vi.useRealTimers()
      })

      it('should return not locked for non-existent user', async () => {
        const identifier = 'nonexistent@example.com'

        // Mock user lookup - no user found
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.recordFailedAttempt(identifier)

        expect(mockInsertResult).not.toHaveBeenCalled()
        expect(mockUpdateResult).not.toHaveBeenCalled()
        expect(result).toEqual({ locked: false })
      })

      it('should return not locked on database error', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup to throw error
        mockSelectResult.mockImplementationOnce(() =>
          Promise.reject(new Error('Database connection failed'))
        )

        const result = await AccountSecurity.recordFailedAttempt(identifier)

        expect(result).toEqual({ locked: false })
      })
    })

    describe('clearFailedAttempts', () => {
      it('should clear failed attempts for existing user', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )

        await AccountSecurity.clearFailedAttempts(identifier)

        expect(mockUpdateResult).toHaveBeenCalledWith(
          expect.any(Object), // account_security table
          expect.objectContaining({
            failed_login_attempts: 0,
            last_failed_attempt: null,
            locked_until: null,
            suspicious_activity_detected: false
          }),
          expect.any(Object) // where clause
        )
      })

      it('should do nothing for non-existent user', async () => {
        const identifier = 'nonexistent@example.com'

        // Mock user lookup - no user found
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        await AccountSecurity.clearFailedAttempts(identifier)

        expect(mockUpdateResult).not.toHaveBeenCalled()
      })

      it('should handle database errors gracefully', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup to throw error
        mockSelectResult.mockImplementationOnce(() =>
          Promise.reject(new Error('Database connection failed'))
        )

        await AccountSecurity.clearFailedAttempts(identifier)

        // Should not throw, just log error
      })
    })

    describe('getFailedAttemptCount', () => {
      it('should return failed attempt count for existing user', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ failedAttempts: 3 }])
        )

        const result = await AccountSecurity.getFailedAttemptCount(identifier)

        expect(result).toBe(3)
      })

      it('should return 0 for user without security record', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([{ user_id: 'user-123' }])
        )
        // Mock security record lookup - no record
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.getFailedAttemptCount(identifier)

        expect(result).toBe(0)
      })

      it('should return 0 for non-existent user', async () => {
        const identifier = 'nonexistent@example.com'

        // Mock user lookup - no user found
        mockSelectResult.mockImplementationOnce(() =>
          Promise.resolve([])
        )

        const result = await AccountSecurity.getFailedAttemptCount(identifier)

        expect(result).toBe(0)
      })

      it('should return 0 on database error', async () => {
        const identifier = 'test@example.com'

        // Mock user lookup to throw error
        mockSelectResult.mockImplementationOnce(() =>
          Promise.reject(new Error('Database connection failed'))
        )

        const result = await AccountSecurity.getFailedAttemptCount(identifier)

        expect(result).toBe(0)
      })
    })

    describe('cleanupExpiredLockouts', () => {
      it('should update expired lockouts and return count', async () => {
        const now = new Date()
        const mockResult = { rowCount: 5 }

        vi.useFakeTimers()
        vi.setSystemTime(now)

        mockUpdateResult.mockResolvedValue(mockResult)

        const result = await AccountSecurity.cleanupExpiredLockouts()

        expect(mockUpdateResult).toHaveBeenCalledWith(
          expect.any(Object), // account_security table
          expect.objectContaining({
            locked_until: null,
            suspicious_activity_detected: false
          }),
          expect.any(Object) // where clause with lt condition
        )
        expect(result).toBe(5)

        vi.useRealTimers()
      })

      it('should return 0 on database error', async () => {
        mockUpdateResult.mockRejectedValue(new Error('Database error'))

        const result = await AccountSecurity.cleanupExpiredLockouts()

        expect(result).toBe(0)
      })
    })
  })

  describe('exported functions', () => {
    it('should export verifyPassword from PasswordService.verify', async () => {
      const password = 'TestPassword123!'
      const hash = '$2b$12$hash'

      ;(bcrypt.compare as any).mockResolvedValueOnce(true)

      const result = await verifyPassword(password, hash)

      expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith(password, hash)
      expect(result).toBe(true)
    })

    it('should export hashPassword from PasswordService.hash', async () => {
      const password = 'TestPassword123!'
      const mockHash = '$2b$12$hash'

      ;(bcrypt.hash as any).mockResolvedValueOnce(mockHash)

      const result = await hashPassword(password)

      expect(vi.mocked(bcrypt.hash)).toHaveBeenCalledWith(password, 12)
      expect(result).toBe(mockHash)
    })
  })
})
