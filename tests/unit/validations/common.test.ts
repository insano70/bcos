import { describe, it, expect } from 'vitest'
import {
  uuidSchema,
  paginationSchema,
  sortSchema,
  searchSchema,
  fileUploadSchema,
  colorSchema,
  domainSchema,
  emailSchema,
  phoneSchema,
  urlSchema
} from '@/lib/validations/common'

describe('common validation schemas', () => {
  describe('uuidSchema', () => {
    it('should validate correct UUID format', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000'

      const result = uuidSchema.safeParse(validUuid)
      expect(result.success).toBe(true)
      expect(result.data).toBe(validUuid)
    })

    it('should reject invalid UUID format', () => {
      const invalidUuids = [
        'invalid-uuid',
        '550e8400-e29b-41d4-a716', // Too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
        '550e8400e29b41d4a716446655440000', // No dashes
        'gggggggg-gggg-gggg-gggg-gggggggggggg' // Invalid characters
      ]

      invalidUuids.forEach(uuid => {
        const result = uuidSchema.safeParse(uuid)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format')
      })
    })

    it('should reject empty string', () => {
      const result = uuidSchema.safeParse('')
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid UUID format')
    })
  })

  describe('paginationSchema', () => {
    it('should validate correct pagination parameters', () => {
      const validData = {
        page: '2',
        limit: '25'
      }

      const result = paginationSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        page: 2,
        limit: 25
      })
    })

    it('should apply default values when parameters are missing', () => {
      const emptyData = {}

      const result = paginationSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        page: 1,
        limit: 10
      })
    })

    it('should transform string numbers to numbers', () => {
      const stringData = {
        page: '5',
        limit: '50'
      }

      const result = paginationSchema.safeParse(stringData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        page: 5,
        limit: 50
      })
    })

    it('should enforce minimum page value', () => {
      const invalidData = {
        page: '0'
      }

      const result = paginationSchema.safeParse(invalidData)
      expect(result.success).toBe(true)
      expect(result.data?.page).toBe(1) // Transformed to minimum value
    })

    it('should enforce maximum limit value', () => {
      const invalidData = {
        limit: '200'
      }

      const result = paginationSchema.safeParse(invalidData)
      expect(result.success).toBe(true)
      expect(result.data?.limit).toBe(100) // Transformed to maximum value
    })

    it('should transform invalid limit values to defaults', () => {
      const invalidData = {
        limit: '0'
      }

      const result = paginationSchema.safeParse(invalidData)
      expect(result.success).toBe(true)
      expect(result.data?.limit).toBe(10) // Transformed to default value
    })

    it('should handle invalid string numbers gracefully', () => {
      const invalidData = {
        page: 'invalid',
        limit: 'not-a-number'
      }

      const result = paginationSchema.safeParse(invalidData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        page: 1, // Default due to invalid input
        limit: 10 // Default due to invalid input
      })
    })
  })

  describe('sortSchema', () => {
    it('should validate correct sort parameters', () => {
      const validData = {
        sort: 'created_at',
        order: 'desc'
      }

      const result = sortSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should apply default order when not specified', () => {
      const dataWithoutOrder = {
        sort: 'name'
      }

      const result = sortSchema.safeParse(dataWithoutOrder)
      expect(result.success).toBe(true)
      expect(result.data?.order).toBe('desc')
    })

    it('should allow empty sort parameters', () => {
      const emptyData = {}

      const result = sortSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        order: 'desc'
      })
    })

    it('should reject invalid sort order', () => {
      const invalidData = {
        order: 'sideways'
      }

      const result = sortSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.path).toContain('order')
    })

    it('should accept valid sort orders', () => {
      const validOrders = ['asc', 'desc']

      validOrders.forEach(order => {
        const result = sortSchema.safeParse({ order })
        expect(result.success).toBe(true)
        expect(result.data?.order).toBe(order)
      })
    })
  })

  describe('searchSchema', () => {
    it('should validate correct search term', () => {
      const validData = {
        search: 'patient records'
      }

      const result = searchSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data?.search).toBe('patient records')
    })

    it('should allow empty search (optional)', () => {
      const emptyData = {}

      const result = searchSchema.safeParse(emptyData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(emptyData)
    })

    it('should sanitize dangerous characters', () => {
      const dangerousInput = {
        search: 'patient<script>alert("xss")</script>records'
      }

      const result = searchSchema.safeParse(dangerousInput)
      expect(result.success).toBe(true)
      expect(result.data?.search).toBe('patientscriptalert("xss")/scriptrecords')
    })

    it('should sanitize SQL wildcards', () => {
      const sqlInjectionAttempt = {
        search: 'patient%_\\records'
      }

      const result = searchSchema.safeParse(sqlInjectionAttempt)
      expect(result.success).toBe(true)
      expect(result.data?.search).toBe('patientrecords')
    })

    it('should trim whitespace', () => {
      const whitespaceInput = {
        search: '  patient records  '
      }

      const result = searchSchema.safeParse(whitespaceInput)
      expect(result.success).toBe(true)
      expect(result.data?.search).toBe('patient records')
    })

    it('should reject overly long search terms', () => {
      const longSearch = 'a'.repeat(256)
      const invalidData = {
        search: longSearch
      }

      const result = searchSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Search term must not exceed 255 characters')
    })

    it('should handle empty search term after sanitization', () => {
      const onlyDangerousChars = {
        search: '<>"\'%_\\'
      }

      const result = searchSchema.safeParse(onlyDangerousChars)
      expect(result.success).toBe(true)
      expect(result.data?.search).toBe('')
    })
  })

  describe('fileUploadSchema', () => {
    it('should validate correct file upload data', () => {
      const validData = {
        filename: 'profile.jpg',
        contentType: 'image/jpeg',
        size: 1024000 // 1MB
      }

      const result = fileUploadSchema.safeParse(validData)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(validData)
    })

    it('should accept all allowed image types', () => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']

      validTypes.forEach(contentType => {
        const result = fileUploadSchema.safeParse({
          filename: 'test.jpg',
          contentType,
          size: 100000
        })
        expect(result.success).toBe(true)
      })
    })

    it('should reject empty filename', () => {
      const invalidData = {
        filename: '',
        contentType: 'image/jpeg',
        size: 100000
      }

      const result = fileUploadSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Filename is required')
    })

    it('should reject invalid content types', () => {
      const invalidTypes = ['text/plain', 'application/pdf', 'image/svg+xml', 'image/bmp']

      invalidTypes.forEach(contentType => {
        const result = fileUploadSchema.safeParse({
          filename: 'test.jpg',
          contentType,
          size: 100000
        })
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Only image files are allowed')
      })
    })

    it('should reject files that are too large', () => {
      const invalidData = {
        filename: 'large.jpg',
        contentType: 'image/jpeg',
        size: 6 * 1024 * 1024 // 6MB
      }

      const result = fileUploadSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('File size must not exceed 5MB')
    })

    it('should accept files at maximum size', () => {
      const validData = {
        filename: 'max.jpg',
        contentType: 'image/jpeg',
        size: 5 * 1024 * 1024 // 5MB exactly
      }

      const result = fileUploadSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('colorSchema', () => {
    it('should validate correct hex color format', () => {
      const validColors = ['#FF0000', '#00FF00', '#0000FF', '#123456', '#abcdef']

      validColors.forEach(color => {
        const result = colorSchema.safeParse(color)
        expect(result.success).toBe(true)
        expect(result.data).toBe(color)
      })
    })

    it('should reject invalid hex color formats', () => {
      const invalidColors = [
        '#GGG', // Invalid characters
        '#12', // Too short
        '#12345', // Too short
        '#1234567', // Too long
        'FF0000', // Missing #
        '#ff000', // Too short
        '#ff00000', // Too long
        'red', // Not hex
        '#123456789' // Way too long
      ]

      invalidColors.forEach(color => {
        const result = colorSchema.safeParse(color)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Invalid hex color format')
      })
    })

    it('should accept uppercase hex colors', () => {
      const upperColor = '#FF0000'

      const result = colorSchema.safeParse(upperColor)
      expect(result.success).toBe(true)
      expect(result.data).toBe(upperColor)
    })

    it('should accept lowercase hex colors', () => {
      const lowerColor = '#ff0000'

      const result = colorSchema.safeParse(lowerColor)
      expect(result.success).toBe(true)
      expect(result.data).toBe(lowerColor)
    })
  })

  describe('domainSchema', () => {
    it('should validate correct domain format', () => {
      const validDomains = ['example.com', 'sub.example.com', 'my-domain.com', 'test123.com']

      validDomains.forEach(domain => {
        const result = domainSchema.safeParse(domain)
        expect(result.success).toBe(true)
        expect(result.data).toBe(domain.toLowerCase())
      })
    })

    it('should transform domain to lowercase', () => {
      const upperDomain = 'EXAMPLE.COM'

      const result = domainSchema.safeParse(upperDomain)
      expect(result.success).toBe(true)
      expect(result.data).toBe('example.com')
    })

    it('should reject empty domain', () => {
      const result = domainSchema.safeParse('')
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Domain is required')
    })

    it('should reject overly long domain', () => {
      const longDomain = 'a'.repeat(256)
      const result = domainSchema.safeParse(longDomain)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Domain must not exceed 255 characters')
    })

    it('should reject invalid domain characters', () => {
      const invalidDomains = [
        'domain with spaces.com',
        'domain@.com',
        'domain!.com',
        'domain#.com',
        'domain$.com'
      ]

      invalidDomains.forEach(domain => {
        const result = domainSchema.safeParse(domain)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Domain must contain only letters, numbers, dots, and hyphens')
      })
    })
  })

  describe('emailSchema', () => {
    it('should validate correct email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.com',
        'test+tag@gmail.com',
        'user@subdomain.example.com'
      ]

      validEmails.forEach(email => {
        const result = emailSchema.safeParse(email)
        expect(result.success).toBe(true)
        expect(result.data).toBe(email.toLowerCase().trim())
      })
    })

    it('should transform email to lowercase and trim', () => {
      const messyEmail = '  test@example.com  '

      const result = emailSchema.safeParse(messyEmail)
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test.example.com',
        'test@.com',
        'test..test@example.com'
      ]

      invalidEmails.forEach(email => {
        const result = emailSchema.safeParse(email)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Invalid email address')
      })
    })

    it('should reject overly long emails', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'
      const result = emailSchema.safeParse(longEmail)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Email must not exceed 255 characters')
    })
  })

  describe('phoneSchema', () => {
    it('should validate correct phone number formats', () => {
      const validPhones = [
        '+1234567890',
        '1234567890',
        '+919876543210',
        '9876543210'
      ]

      validPhones.forEach(phone => {
        const result = phoneSchema.safeParse(phone)
        expect(result.success).toBe(true)
        expect(result.data).toBe(phone)
      })
    })

    it('should reject invalid phone number formats', () => {
      const invalidPhones = [
        '123', // Too short
        'abcdefghij', // Non-numeric
        '+', // Just plus
        '+0234567890' // Starts with 0 after +
      ]

      invalidPhones.forEach(phone => {
        const result = phoneSchema.safeParse(phone)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Invalid phone number format')
      })
    })

    it('should reject overly long phone numbers', () => {
      const longPhone = '+123456789012345678901' // 21 characters
      const result = phoneSchema.safeParse(longPhone)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('Invalid phone number format')
    })
  })

  describe('urlSchema', () => {
    it('should validate correct URL formats', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://subdomain.example.com/path',
        'https://example.com:8080/path?query=value'
      ]

      validUrls.forEach(url => {
        const result = urlSchema.safeParse(url)
        expect(result.success).toBe(true)
        expect(result.data).toBe(url)
      })
    })

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com', // Wrong protocol
        'https://', // Incomplete
        '://example.com' // Missing protocol name
      ]

      invalidUrls.forEach(url => {
        const result = urlSchema.safeParse(url)
        expect(result.success).toBe(false)
        expect(result.error?.issues?.[0]?.message).toBe('Invalid URL format')
      })
    })

    it('should reject overly long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(500)
      const result = urlSchema.safeParse(longUrl)
      expect(result.success).toBe(false)
      expect(result.error?.issues?.[0]?.message).toBe('URL must not exceed 500 characters')
    })
  })
})
