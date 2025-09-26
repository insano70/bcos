import { describe, it, expect } from 'vitest'
import {
  userCreateSchema,
  userUpdateSchema,
  userQuerySchema,
  passwordChangeSchema,
  userParamsSchema
} from '@/lib/validations/user'

describe('user validation schemas', () => {
  describe('userCreateSchema', () => {
    it('should validate correct user creation data', () => {
      const validData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: ['550e8400-e29b-41d4-a716-446655440000'],
        email_verified: true,
        is_active: true
      }

      const result = userCreateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should apply default values for optional fields', () => {
      const dataWithoutDefaults = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = userCreateSchema.safeParse(dataWithoutDefaults)
      expect(result.success).toBe(true)
      expect(result.data?.email_verified).toBe(false)
      expect(result.data?.is_active).toBe(true)
    })

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject weak password', () => {
      const invalidData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'weak',
        role_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })

    it('should reject empty role_ids array', () => {
      const invalidData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: []
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('At least one role is required')
    })

    it('should reject invalid role UUIDs', () => {
      const invalidData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: ['invalid-uuid']
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid role ID')
    })

    it('should reject XSS attempts in names', () => {
      const invalidData = {
        email: 'test@example.com',
        first_name: '<script>alert("xss")</script>',
        last_name: 'Doe',
        password: 'ValidPass123!',
        role_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('first_name')
    })

    it('should reject missing required fields', () => {
      const invalidData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'ValidPass123!'
        // Missing role_ids
      }

      const result = userCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('role_ids')
    })
  })

  describe('userUpdateSchema', () => {
    it('should validate partial user update data', () => {
      const validData = {
        email: 'updated@example.com',
        first_name: 'Jane'
      }

      const result = userUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate complete user update data', () => {
      const validData = {
        email: 'updated@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        password: 'NewValidPass123!',
        role_ids: ['550e8400-e29b-41d4-a716-446655440001'],
        email_verified: true,
        is_active: false
      }

      const result = userUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should allow empty update (all optional)', () => {
      const emptyData = {}

      const result = userUpdateSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should reject invalid email in update', () => {
      const invalidData = {
        email: 'invalid-email'
      }

      const result = userUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject weak password in update', () => {
      const invalidData = {
        password: 'weak'
      }

      const result = userUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('password')
    })

    it('should reject invalid role UUIDs in update', () => {
      const invalidData = {
        role_ids: ['invalid-uuid', '550e8400-e29b-41d4-a716-446655440000']
      }

      const result = userUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid role ID')
    })

    it('should reject XSS attempts in names during update', () => {
      const invalidData = {
        first_name: '<img src=x onerror=alert("xss")>'
      }

      const result = userUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('first_name')
    })
  })

  describe('userQuerySchema', () => {
    it('should validate complete query parameters', () => {
      const validData = {
        email: 'test@example.com',
        is_active: 'true',
        email_verified: 'false',
        search: 'john doe'
      }

      const result = userQuerySchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        email: 'test@example.com',
        is_active: true,
        email_verified: false,
        search: 'john doe'
      })
    })

    it('should validate partial query parameters', () => {
      const partialData = {
        email: 'test@example.com',
        search: 'john'
      }

      const result = userQuerySchema.safeParse(partialData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(partialData)
    })

    it('should transform string booleans correctly', () => {
      const stringBooleans = {
        is_active: 'true',
        email_verified: 'false'
      }

      const result = userQuerySchema.safeParse(stringBooleans)
      expect(result.success).toBe(true)
      expect(result.data?.is_active).toBe(true)
      expect(result.data?.email_verified).toBe(false)
    })

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email'
      }

      const result = userQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should reject invalid boolean strings', () => {
      const invalidData = {
        is_active: 'maybe'
      }

      const result = userQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('is_active')
    })

    it('should reject overly long search strings', () => {
      const longSearch = 'a'.repeat(256)
      const invalidData = {
        search: longSearch
      }

      const result = userQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('search')
    })
  })

  describe('passwordChangeSchema', () => {
    it('should validate correct password change data', () => {
      const validData = {
        current_password: 'CurrentPass123!',
        new_password: 'NewValidPass123!',
        confirm_password: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject mismatched passwords', () => {
      const invalidData = {
        current_password: 'CurrentPass123!',
        new_password: 'NewValidPass123!',
        confirm_password: 'DifferentPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe("Passwords don't match")
      expect(result.error?.issues?.[0]?.path).toContain('confirm_password')
    })

    it('should reject missing current password', () => {
      const invalidData = {
        new_password: 'NewValidPass123!',
        confirm_password: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('current_password')
    })

    it('should reject empty current password', () => {
      const invalidData = {
        current_password: '',
        new_password: 'NewValidPass123!',
        confirm_password: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('current_password')
    })

    it('should reject weak new password', () => {
      const invalidData = {
        current_password: 'CurrentPass123!',
        new_password: 'weak',
        confirm_password: 'weak'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('new_password')
    })

    it('should reject weak current password', () => {
      const invalidData = {
        current_password: '',
        new_password: 'NewValidPass123!',
        confirm_password: 'NewValidPass123!'
      }

      const result = passwordChangeSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('current_password')
    })
  })

  describe('userParamsSchema', () => {
    it('should validate correct UUID parameter', () => {
      const validData = {
        id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = userParamsSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'invalid-uuid'
      }

      const result = userParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid user ID')
    })

    it('should reject non-UUID strings', () => {
      const invalidData = {
        id: 'not-a-uuid-at-all'
      }

      const result = userParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('id')
    })

    it('should reject missing id', () => {
      const invalidData = {}

      const result = userParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('id')
    })

    it('should reject empty id', () => {
      const invalidData = {
        id: ''
      }

      const result = userParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('id')
    })
  })
})
