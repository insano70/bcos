import { describe, it, expect } from 'vitest'
import {
  practiceCreateSchema,
  practiceUpdateSchema,
  practiceQuerySchema,
  practiceAttributesUpdateSchema,
  practiceParamsSchema
} from '@/lib/validations/practice'

describe('practice validation schemas', () => {
  describe('practiceCreateSchema', () => {
    it('should validate correct practice creation data', () => {
      const validData = {
        name: 'Test Medical Practice',
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_user_id: '550e8400-e29b-41d4-a716-446655440001'
      }

      const result = practiceCreateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.domain).toBe('testpractice') // Should be lowercased
    })

    it('should validate without owner_user_id', () => {
      const validData = {
        name: 'Test Medical Practice',
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.owner_user_id).toBeUndefined()
    })

    it('should transform domain to lowercase', () => {
      const dataWithUppercaseDomain = {
        name: 'Test Medical Practice',
        domain: 'TestPractice.COM',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(dataWithUppercaseDomain)
      expect(result.success).toBe(true)
      expect(result.data?.domain).toBe('testpractice.com')
    })

    it('should trim practice name', () => {
      const dataWithWhitespace = {
        name: '  Test Medical Practice  ',
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(dataWithWhitespace)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Test Medical Practice')
    })

    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Practice name is required')
    })

    it('should reject overly long name', () => {
      const longName = 'a'.repeat(256)
      const invalidData = {
        name: longName,
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Practice name must not exceed 255 characters')
    })

    it('should reject empty domain', () => {
      const invalidData = {
        name: 'Test Medical Practice',
        domain: '',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Domain is required')
    })

    it('should reject invalid domain characters', () => {
      const invalidData = {
        name: 'Test Medical Practice',
        domain: 'test@practice!',
        template_id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Domain must contain only letters, numbers, dots, and hyphens')
    })

    it('should reject invalid template UUID', () => {
      const invalidData = {
        name: 'Test Medical Practice',
        domain: 'testpractice',
        template_id: 'invalid-uuid'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid template ID')
    })

    it('should reject invalid owner user UUID', () => {
      const invalidData = {
        name: 'Test Medical Practice',
        domain: 'testpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440000',
        owner_user_id: 'invalid-uuid'
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid user ID')
    })

    it('should reject missing required fields', () => {
      const invalidData = {
        name: 'Test Medical Practice',
        domain: 'testpractice'
        // Missing template_id
      }

      const result = practiceCreateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('template_id')
    })
  })

  describe('practiceUpdateSchema', () => {
    it('should validate partial practice update data', () => {
      const validData = {
        name: 'Updated Practice Name'
      }

      const result = practiceUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Updated Practice Name')
    })

    it('should validate complete practice update data', () => {
      const validData = {
        name: 'Updated Practice Name',
        domain: 'updatedpractice',
        template_id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'active'
      }

      const result = practiceUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.domain).toBe('updatedpractice')
      expect(result.data?.status).toBe('active')
    })

    it('should allow empty update', () => {
      const emptyData = {}

      const result = practiceUpdateSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should transform domain to lowercase in updates', () => {
      const dataWithUppercaseDomain = {
        domain: 'UpdatedPractice.COM'
      }

      const result = practiceUpdateSchema.safeParse(dataWithUppercaseDomain)
      expect(result.success).toBe(true)
      expect(result.data?.domain).toBe('updatedpractice.com')
    })

    it('should trim practice name in updates', () => {
      const dataWithWhitespace = {
        name: '  Updated Practice Name  '
      }

      const result = practiceUpdateSchema.safeParse(dataWithWhitespace)
      expect(result.success).toBe(true)
      expect(result.data?.name).toBe('Updated Practice Name')
    })

    it('should reject invalid domain characters in updates', () => {
      const invalidData = {
        domain: 'invalid@domain!'
      }

      const result = practiceUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Domain must contain only letters, numbers, dots, and hyphens')
    })

    it('should reject invalid status values', () => {
      const invalidData = {
        status: 'invalid_status'
      }

      const result = practiceUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('status')
    })

    it('should accept valid status values', () => {
      const validStatuses = ['active', 'inactive', 'pending']

      validStatuses.forEach(status => {
        const result = practiceUpdateSchema.safeParse({ status })
        expect(result.success).toBe(true)
        expect(result.data?.status).toBe(status)
      })
    })
  })

  describe('practiceQuerySchema', () => {
    it('should validate complete query parameters', () => {
      const validData = {
        status: 'active',
        template_id: '550e8400-e29b-41d4-a716-446655440000',
        search: 'medical practice'
      }

      const result = practiceQuerySchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate partial query parameters', () => {
      const partialData = {
        status: 'pending',
        search: 'clinic'
      }

      const result = practiceQuerySchema.safeParse(partialData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(partialData)
    })

    it('should allow empty query', () => {
      const emptyData = {}

      const result = practiceQuerySchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should reject invalid status values', () => {
      const invalidData = {
        status: 'invalid_status'
      }

      const result = practiceQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('status')
    })

    it('should reject invalid template UUID', () => {
      const invalidData = {
        template_id: 'invalid-uuid'
      }

      const result = practiceQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('template_id')
    })

    it('should reject overly long search strings', () => {
      const longSearch = 'a'.repeat(256)
      const invalidData = {
        search: longSearch
      }

      const result = practiceQuerySchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('search')
    })
  })

  describe('practiceAttributesUpdateSchema', () => {
    it('should validate complete practice attributes', () => {
      const validData = {
        phone: '+1-555-123-4567',
        email: 'contact@practice.com',
        address_line1: '123 Main St',
        address_line2: 'Suite 100',
        city: 'Anytown',
        state: 'CA',
        zip_code: '12345',
        business_hours: {
          monday: { open: '09:00', close: '17:00', closed: false },
          tuesday: { open: '09:00', close: '17:00', closed: false }
        },
        services: ['Consultation', 'Treatment'],
        insurance_accepted: ['Blue Cross', 'Aetna'],
        conditions_treated: ['Arthritis', 'Back Pain'],
        about_text: 'We provide excellent medical care',
        mission_statement: 'To improve patient health',
        welcome_message: 'Welcome to our practice',
        logo_url: '/images/logo.png',
        hero_image_url: 'https://example.com/hero.jpg',
        gallery_images: ['/images/1.jpg', 'https://example.com/2.jpg'],
        meta_title: 'Medical Practice',
        meta_description: 'Professional medical services',
        primary_color: '#2174EA',
        secondary_color: '#F8FAFC',
        accent_color: '#5696FF'
      }

      const result = practiceAttributesUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate partial attributes', () => {
      const partialData = {
        phone: '+1-555-123-4567',
        email: 'contact@practice.com'
      }

      const result = practiceAttributesUpdateSchema.safeParse(partialData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(partialData)
    })

    it('should allow empty attributes update', () => {
      const emptyData = {}

      const result = practiceAttributesUpdateSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should validate email format', () => {
      const invalidData = {
        email: 'invalid-email'
      }

      const result = practiceAttributesUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('email')
    })

    it('should validate URL formats', () => {
      const invalidData = {
        logo_url: 'not-a-url'
      }

      const result = practiceAttributesUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid logo URL')
    })

    it('should allow relative URLs', () => {
      const validData = {
        logo_url: '/images/logo.png',
        hero_image_url: '/images/hero.jpg',
        gallery_images: ['/gallery/1.jpg', '/gallery/2.jpg']
      }

      const result = practiceAttributesUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate hex color formats', () => {
      const invalidData = {
        primary_color: 'invalid-color'
      }

      const result = practiceAttributesUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid hex color format')
    })

    it('should accept valid hex colors', () => {
      const validData = {
        primary_color: '#FF0000',
        secondary_color: '#00FF00',
        accent_color: '#0000FF'
      }

      const result = practiceAttributesUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should validate field lengths', () => {
      const longText = 'a'.repeat(5001) // Exceeds about_text limit
      const invalidData = {
        about_text: longText
      }

      const result = practiceAttributesUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('about_text')
    })

    it('should validate business hours structure', () => {
      const validHours = {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { closed: true, open: '', close: '' }
      }

      const result = practiceAttributesUpdateSchema.safeParse({ business_hours: validHours })
      expect(result.success).toBe(true)
    })

    it('should validate array fields', () => {
      const validData = {
        services: ['Service 1', 'Service 2'],
        insurance_accepted: ['Insurance 1', 'Insurance 2'],
        conditions_treated: ['Condition 1', 'Condition 2']
      }

      const result = practiceAttributesUpdateSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject invalid gallery image URLs', () => {
      const invalidData = {
        gallery_images: ['valid.jpg', 'invalid url with spaces']
      }

      const result = practiceAttributesUpdateSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid gallery image URL')
    })
  })

  describe('practiceParamsSchema', () => {
    it('should validate correct UUID parameter', () => {
      const validData = {
        id: '550e8400-e29b-41d4-a716-446655440000'
      }

      const result = practiceParamsSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should reject invalid UUID', () => {
      const invalidData = {
        id: 'invalid-uuid'
      }

      const result = practiceParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid practice ID')
    })

    it('should reject missing id', () => {
      const invalidData = {}

      const result = practiceParamsSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('id')
    })
  })
})
