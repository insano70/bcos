import { describe, it, expect } from 'vitest'
import {
  roleQuerySchema,
  roleCreateSchema,
  roleUpdateSchema
} from '@/lib/validations/role'

describe('role validation schemas', () => {
  describe('roleQuerySchema', () => {
    it('should validate complete query parameters', () => {
      const validData = {
        name: 'Admin Role',
        is_active: 'true',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        search: 'admin'
      }

      const result = roleQuerySchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        name: 'Admin Role',
        is_active: true,
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        search: 'admin'
      })
    })

    it('should validate partial query parameters', () => {
      const partialData = {
        name: 'User Role',
        search: 'basic'
      }

      const result = roleQuerySchema.safeParse(partialData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(partialData)
    })

    it('should allow empty query', () => {
      const emptyData = {}

      const result = roleQuerySchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should transform string boolean correctly', () => {
      const stringBoolean = {
        is_active: 'false'
      }

      const result = roleQuerySchema.safeParse(stringBoolean)
      expect(result.success).toBe(true)
      expect(result.data?.is_active).toBe(false)
    })

    it('should reject invalid boolean strings', () => {
      const invalidData = {
        is_active: 'maybe'
      }

      const result = roleQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toContain('is_active')
    })

    it('should reject invalid organization UUID', () => {
      const invalidData = {
        organization_id: 'invalid-uuid'
      }

      const result = roleQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toContain('organization_id')
    })

    it('should reject overly long name', () => {
      const longName = 'a'.repeat(101)
      const invalidData = {
        name: longName
      }

      const result = roleQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toContain('name')
    })

    it('should reject overly long search string', () => {
      const longSearch = 'a'.repeat(256)
      const invalidData = {
        search: longSearch
      }

      const result = roleQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toContain('search')
    })
  })

  describe('roleCreateSchema', () => {
    it('should validate correct role creation data', () => {
      const validData = {
        name: 'Admin Role',
        description: 'Administrator role with full access',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
        is_system_role: true
      }

      const result = roleCreateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate role creation without optional fields', () => {
      const minimalData = {
        name: 'Basic Role',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(minimalData)
      expect(result.success).toBe(true)
      expect(result.data?.is_system_role).toBe(false)
    })

    it('should trim role name', () => {
      const dataWithWhitespace = {
        name: '  Admin Role  ',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(dataWithWhitespace)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Admin Role')
    })

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Role name is required')
    })

    it('should reject overly long name', () => {
      const longName = 'a'.repeat(101)
      const invalidData = {
        name: longName,
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Role name must not exceed 100 characters')
    })

    it('should reject overly long description', () => {
      const longDescription = 'a'.repeat(1001)
      const invalidData = {
        name: 'Admin Role',
        description: longDescription,
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Description must not exceed 1000 characters')
    })

    it('should reject empty permission_ids array', () => {
      const invalidData = {
        name: 'Admin Role',
        permission_ids: []
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('At least one permission is required')
    })

    it('should reject invalid permission UUIDs', () => {
      const invalidData = {
        name: 'Admin Role',
        permission_ids: ['invalid-uuid', '550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toEqual(['permission_ids', 0])
    })

    it('should reject invalid organization UUID', () => {
      const invalidData = {
        name: 'Admin Role',
        organization_id: 'invalid-uuid',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toContain('organization_id')
    })

    it('should accept valid organization_id', () => {
      const validData = {
        name: 'Org Role',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440001']
      }

      const result = roleCreateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.organization_id).toBe('550e8400-e29b-41d4-a716-446655440000')
    })
  })

  describe('roleUpdateSchema', () => {
    it('should validate partial role update data', () => {
      const validData = {
        name: 'Updated Role Name',
        description: 'Updated description'
      }

      const result = roleUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate complete role update data', () => {
      const validData = {
        name: 'Updated Admin Role',
        description: 'Updated administrator role',
        permission_ids: ['550e8400-e29b-41d4-a716-446655440001'],
        is_active: false
      }

      const result = roleUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should allow empty update', () => {
      const emptyData = {}

      const result = roleUpdateSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should trim role name in updates', () => {
      const dataWithWhitespace = {
        name: '  Updated Role Name  '
      }

      const result = roleUpdateSchema.safeParse(dataWithWhitespace)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Updated Role Name')
    })

    it('should reject empty name in updates', () => {
      const invalidData = {
        name: ''
      }

      const result = roleUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Role name is required')
    })

    it('should reject overly long name in updates', () => {
      const longName = 'a'.repeat(101)
      const invalidData = {
        name: longName
      }

      const result = roleUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Role name must not exceed 100 characters')
    })

    it('should reject overly long description in updates', () => {
      const longDescription = 'a'.repeat(1001)
      const invalidData = {
        description: longDescription
      }

      const result = roleUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Description must not exceed 1000 characters')
    })

    it('should reject invalid permission UUIDs in updates', () => {
      const invalidData = {
        permission_ids: ['invalid-uuid', '550e8400-e29b-41d4-a716-446655440000']
      }

      const result = roleUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].path).toEqual(['permission_ids', 0])
    })

    it('should accept valid permission_ids array in updates', () => {
      const validData = {
        permission_ids: ['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001']
      }

      const result = roleUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.permission_ids).toEqual(['550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001'])
    })

    it('should accept boolean is_active in updates', () => {
      const validData = {
        is_active: true
      }

      const result = roleUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.is_active).toBe(true)
    })
  })
})
