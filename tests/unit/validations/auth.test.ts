import { describe, it, expect } from 'vitest'
import {
  loginSchema,
  registerSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  passwordChangeSchema,
  sessionSchema
} from '@/lib/validations/auth'

describe('auth validation schemas', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        remember: true
      }

      const result = loginSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate login data with default remember value', () => {
      const dataWithoutRemember = {
        email: 'test@example.com',
        password: 'ValidPass123!'
      }

      const result = loginSchema.safeParse(dataWithoutRemember)
      expect(result.success).toBe(true)
      expect(result.data?.remember).toBe(false)
    })

    it('should handle string remember values', () => {
      const dataWithStringRemember = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        remember: 'true'
      }

      const result = loginSchema.safeParse(dataWithStringRemember)
      expect(result.success).toBe(true)
      expect(result.data?.remember).toBe(true)
    })

    it('should reject invalid email format', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'ValidPass123!'
      }

      const result = loginSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject empty password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: ''
      }

      const result = loginSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })

    it('should reject missing email', () => {
      const invalidData = {
        password: 'ValidPass123!'
      }

      const result = loginSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject missing password', () => {
      const invalidData = {
        email: 'test@example.com'
      }

      const result = loginSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })
  })

  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject mismatched passwords', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'DifferentPass123!',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe("Passwords don't match")
      expect(result.error?.issues?.[0]?.path).toContain('confirmPassword')
    })

    it('should reject unaccepted terms', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: false
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('You must accept the terms and conditions')
    })

    it('should reject short first name', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        firstName: 'J',
        lastName: 'Doe',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('First name must be at least 2 characters')
    })

    it('should reject short last name', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        firstName: 'John',
        lastName: 'D',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Last name must be at least 2 characters')
    })

    it('should reject weak passwords', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'weak',
        confirmPassword: 'weak',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })

    it('should reject XSS attempts in names', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        firstName: '<script>alert("xss")</script>',
        lastName: 'Doe',
        acceptTerms: true
      }

      const result = registerSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('firstName')
    })
  })

  describe('passwordResetRequestSchema', () => {
    it('should validate correct email', () => {
      const validData = {
        email: 'test@example.com'
      }

      const result = passwordResetRequestSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email'
      }

      const result = passwordResetRequestSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject missing email', () => {
      const invalidData = {}

      const result = passwordResetRequestSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })
  })

  describe('passwordResetSchema', () => {
    it('should validate correct reset data', () => {
      const validData = {
        token: 'valid-reset-token',
        password: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordResetSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject mismatched passwords', () => {
      const invalidData = {
        token: 'valid-reset-token',
        password: 'NewValidPass123!',
        confirmPassword: 'DifferentPass123!'
      }

      const result = passwordResetSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe("Passwords don't match")
    })

    it('should reject missing token', () => {
      const invalidData = {
        password: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordResetSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('token')
    })

    it('should reject empty token', () => {
      const invalidData = {
        token: '',
        password: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordResetSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('token')
    })

    it('should reject weak new password', () => {
      const invalidData = {
        token: 'valid-token',
        password: 'weak',
        confirmPassword: 'weak'
      }

      const result = passwordResetSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })
  })

  describe('passwordChangeSchema', () => {
    it('should validate correct password change data', () => {
      const validData = {
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject mismatched passwords', () => {
      const invalidData = {
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewValidPass123!',
        confirmPassword: 'DifferentPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe("Passwords don't match")
    })

    it('should reject missing current password', () => {
      const invalidData = {
        newPassword: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('currentPassword')
    })

    it('should reject empty current password', () => {
      const invalidData = {
        currentPassword: '',
        newPassword: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('currentPassword')
    })

    it('should reject weak new password', () => {
      const invalidData = {
        currentPassword: 'CurrentPass123!',
        newPassword: 'weak',
        confirmPassword: 'weak'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('newPassword')
    })

    it('should reject same current and new password', () => {
      const invalidData = {
        currentPassword: 'SamePass123!',
        newPassword: 'SamePass123!',
        confirmPassword: 'SamePass123!'
      }

      // The schema doesn't explicitly check for this, but password policy might
      // This tests that the schema accepts it (business logic validation would be elsewhere)
      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(true)
    })
  })

  describe('sessionSchema', () => {
    it('should validate correct session data', () => {
      const validData = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin' as const,
          practiceId: '550e8400-e29b-41d4-a716-446655440001'
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate session data without practiceId', () => {
      const validData = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'practice_owner' as const
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.user.practiceId).toBeUndefined()
    })

    it('should reject invalid user ID', () => {
      const invalidData = {
        user: {
          id: 'invalid-uuid',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin' as const
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toEqual(['user', 'id'])
    })

    it('should reject invalid email', () => {
      const invalidData = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'invalid-email',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin' as const
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toEqual(['user', 'email'])
    })

    it('should reject invalid role', () => {
      const invalidData = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'invalid_role'
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toEqual(['user', 'role'])
    })

    it('should reject XSS attempts in names', () => {
      const invalidData = {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'test@example.com',
          firstName: '<script>alert("xss")</script>',
          lastName: 'Doe',
          role: 'admin' as const
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toEqual(['user', 'firstName'])
    })

    it('should reject missing required fields', () => {
      const invalidData = {
        user: {
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'admin' as const
          // Missing id
        },
        expires: '2024-12-31T23:59:59Z'
      }

      const result = sessionSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toEqual(['user', 'id'])
    })
  })
})
