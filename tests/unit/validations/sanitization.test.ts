import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  sanitizeText,
  createSafeTextSchema,
  safeEmailSchema,
  createNameSchema,
  safeDomainSchema,
  safeUrlSchema,
  createJsonSchema
} from '@/lib/validations/sanitization'

describe('sanitization validation schemas', () => {
  describe('sanitizeText', () => {
    it('should remove HTML tags', () => {
      const htmlInput = '<script>alert("xss")</script>Hello <b>world</b>!'
      const result = sanitizeText(htmlInput)
      expect(result).toBe('alert("xss")Hello world!')
    })

    it('should escape dangerous characters', () => {
      const dangerousInput = 'Hello < > " \' & world'
      const result = sanitizeText(dangerousInput)
      expect(result).toBe('Hello &lt; &gt; &quot; &#x27; &amp; world')
    })

    it('should trim whitespace', () => {
      const whitespaceInput = '  hello world  '
      const result = sanitizeText(whitespaceInput)
      expect(result).toBe('hello world')
    })

    it('should handle empty input', () => {
      const result = sanitizeText('')
      expect(result).toBe('')
    })

    it('should handle input with only HTML tags', () => {
      const htmlOnly = '<div><span>test</span></div>'
      const result = sanitizeText(htmlOnly)
      expect(result).toBe('test')
    })

    it('should handle nested HTML tags', () => {
      const nestedHtml = '<div>Hello <strong>world</strong></div>'
      const result = sanitizeText(nestedHtml)
      expect(result).toBe('Hello world')
    })

    it('should escape all dangerous characters correctly', () => {
      const dangerousChars = '<>"\'&'
      const result = sanitizeText(dangerousChars)
      expect(result).toBe('&lt;&gt;&quot;&#x27;&amp;')
    })
  })

  describe('createSafeTextSchema', () => {
    it('should validate and sanitize text within length limits', () => {
      const schema = createSafeTextSchema(5, 20, 'Test field')
      const validInput = 'Hello world!'

      const result = schema.safeParse(validInput)
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello world!')
    })

    it('should sanitize HTML and dangerous characters', () => {
      const schema = createSafeTextSchema(1, 100, 'Test field')
      const htmlInput = '<script>alert("xss")</script>Hello & world!'

      const result = schema.safeParse(htmlInput)
      expect(result.success).toBe(true)
      expect(result.data).toBe('alert("xss")Hello &amp; world!')
    })

    it('should reject text that is too short', () => {
      const schema = createSafeTextSchema(5, 20, 'Test field')
      const shortInput = 'Hi'

      const result = schema.safeParse(shortInput)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Test field must be at least 5 characters')
    })

    it('should reject text that is too long', () => {
      const schema = createSafeTextSchema(1, 10, 'Test field')
      const longInput = 'This is a very long string that exceeds the limit'

      const result = schema.safeParse(longInput)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Test field must not exceed 10 characters')
    })

    it('should use default parameters when not specified', () => {
      const schema = createSafeTextSchema()
      const validInput = 'Hello'

      const result = schema.safeParse(validInput)
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hello')
    })

    it('should sanitize input before length validation', () => {
      const schema = createSafeTextSchema(1, 10, 'Test field')
      const inputWithHtml = '<b>Hi</b>' // Becomes "Hi" after sanitization

      const result = schema.safeParse(inputWithHtml)
      expect(result.success).toBe(true)
      expect(result.data).toBe('Hi')
    })
  })

  describe('safeEmailSchema', () => {
    it('should validate and sanitize email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.com',
        'TEST@EXAMPLE.COM  '
      ]

      validEmails.forEach(email => {
        const result = safeEmailSchema.safeParse(email)
        expect(result.success).toBe(true)
        expect(typeof result.data).toBe('string')
      })
    })

    it('should convert email to lowercase and trim', () => {
      const messyEmail = '  TEST@EXAMPLE.COM  '

      const result = safeEmailSchema.safeParse(messyEmail)
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    it('should sanitize dangerous characters from email', () => {
      const dangerousEmail = 'test<script>@example.com'

      const result = safeEmailSchema.safeParse(dangerousEmail)
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        'test@',
        '@example.com',
        'test@.com'
      ]

      invalidEmails.forEach(email => {
        const result = safeEmailSchema.safeParse(email)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe('Invalid email address')
      })
    })

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'

      const result = safeEmailSchema.safeParse(longEmail)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Email must not exceed 255 characters')
    })
  })

  describe('createNameSchema', () => {
    it('should validate and sanitize names', () => {
      const schema = createNameSchema('Full name')
      const validNames = [
        'John Doe',
        "Mary O'Connor",
        'Jean-Pierre',
        'Anna-Maria'
      ]

      validNames.forEach(name => {
        const result = schema.safeParse(name)
        expect(result.success).toBe(true)
        expect(typeof result.data).toBe('string')
      })
    })

    it('should sanitize HTML from names', () => {
      const schema = createNameSchema('Name')
      const htmlName = '<script>John</script> Doe'

      const result = schema.safeParse(htmlName)
      expect(result.success).toBe(true)
      expect(result.data).toBe('John Doe')
    })

    it('should reject empty names', () => {
      const schema = createNameSchema('Name')
      const emptyName = ''

      const result = schema.safeParse(emptyName)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Name is required')
    })

    it('should reject names that are too long', () => {
      const schema = createNameSchema('Name')
      const longName = 'a'.repeat(101)

      const result = schema.safeParse(longName)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Name must not exceed 100 characters')
    })

    it('should reject names with invalid characters', () => {
      const schema = createNameSchema('Name')
      const invalidNames = [
        'John123',
        'John@Doe',
        'John.Doe',
        'John_Doe',
        'John/Doe'
      ]

      invalidNames.forEach(name => {
        const result = schema.safeParse(name)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe('Name must contain only letters, spaces, hyphens, and apostrophes')
      })
    })

    it('should use default field name when not specified', () => {
      const schema = createNameSchema()
      const validName = 'John Doe'

      const result = schema.safeParse(validName)
      expect(result.success).toBe(true)
    })
  })

  describe('safeDomainSchema', () => {
    it('should validate correct domain formats', () => {
      const validDomains = [
        'example.com',
        'sub.example.com',
        'my-domain.com',
        'test123.com',
        'a.co'
      ]

      validDomains.forEach(domain => {
        const result = safeDomainSchema.safeParse(domain)
        expect(result.success).toBe(true)
        expect(result.data).toBe(domain.toLowerCase().trim())
      })
    })

    it('should convert domain to lowercase and trim', () => {
      const messyDomain = '  EXAMPLE.COM  '

      const result = safeDomainSchema.safeParse(messyDomain)
      expect(result.success).toBe(true)
      expect(result.data).toBe('example.com')
    })

    it('should reject empty domain', () => {
      const result = safeDomainSchema.safeParse('')
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Domain is required')
    })

    it('should reject overly long domains', () => {
      const longDomain = 'a'.repeat(256)

      const result = safeDomainSchema.safeParse(longDomain)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Domain must not exceed 255 characters')
    })

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'domain with spaces.com',
        '-domain.com', // Starts with hyphen
        'domain-.com', // Ends with hyphen
        'domain..com', // Double dot
        'domain.com-', // Ends with hyphen in subdomain
        'domain.123', // TLD too short
        'domain', // No TLD
        'domain.', // Trailing dot
        '.domain.com', // Leading dot
        'domain.com/extra' // Path included
      ]

      invalidDomains.forEach(domain => {
        const result = safeDomainSchema.safeParse(domain)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe('Invalid domain format')
      })
    })

    it('should accept complex valid domains', () => {
      const complexDomains = [
        'sub.sub.example.co.uk',
        '123domain.com',
        'domain-name-with-multiple-hyphens.com'
      ]

      complexDomains.forEach(domain => {
        const result = safeDomainSchema.safeParse(domain)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('safeUrlSchema', () => {
    it('should validate correct HTTP/HTTPS URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://subdomain.example.com/path',
        'https://example.com:8080/path?query=value#fragment'
      ]

      validUrls.forEach(url => {
        const result = safeUrlSchema.safeParse(url)
        expect(result.success).toBe(true)
        expect(result.data).toBe(url)
      })
    })

    it('should reject non-HTTP/HTTPS protocols', () => {
      const invalidUrls = [
        'ftp://example.com',
        'file:///path',
        'mailto:test@example.com',
        'javascript:alert("xss")',
        'data:text/plain;base64,SGVsbG8='
      ]

      invalidUrls.forEach(url => {
        const result = safeUrlSchema.safeParse(url)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe('Only HTTP and HTTPS URLs are allowed')
      })
    })

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'not-a-url',
        'example.com', // Missing protocol
        'https://', // Incomplete
        '://example.com' // Missing protocol name
      ]

      invalidUrls.forEach(url => {
        const result = safeUrlSchema.safeParse(url)
        expect(result.success).toBe(false)
        expect(result.error?.issues[0].message).toBe('Invalid URL format')
      })
    })

    it('should reject overly long URLs', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(500)

      const result = safeUrlSchema.safeParse(longUrl)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('URL must not exceed 500 characters')
    })
  })

  describe('createJsonSchema', () => {
    const stringArraySchema = createJsonSchema(z.array(z.string()))
    const objectSchema = createJsonSchema(z.object({
      name: z.string(),
      age: z.number()
    }))

    it('should validate and parse correct JSON arrays', () => {
      const validJson = '["item1", "item2", "item3"]'

      const result = stringArraySchema.safeParse(validJson)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(['item1', 'item2', 'item3'])
    })

    it('should validate and parse correct JSON objects', () => {
      const validJson = '{"name": "John", "age": 30}'

      const result = objectSchema.safeParse(validJson)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'John', age: 30 })
    })

    it('should reject invalid JSON format', () => {
      const invalidJson = '{"name": "John", "age": }' // Invalid JSON

      const result = objectSchema.safeParse(invalidJson)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toBe('Invalid JSON format')
    })

    it('should reject JSON that doesn\'t match schema', () => {
      const invalidJson = '{"name": "John", "age": "thirty"}' // Age should be number

      const result = objectSchema.safeParse(invalidJson)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue =>
        issue.message.includes('Invalid JSON structure')
      )).toBe(true)
    })

    it('should reject array when object expected', () => {
      const wrongTypeJson = '["item1", "item2"]'

      const result = objectSchema.safeParse(wrongTypeJson)
      expect(result.success).toBe(false)
      expect(result.error?.issues.some(issue =>
        issue.message.includes('Invalid JSON structure')
      )).toBe(true)
    })

    it('should handle empty arrays', () => {
      const emptyArrayJson = '[]'

      const result = stringArraySchema.safeParse(emptyArrayJson)
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })

    it('should handle empty objects', () => {
      const emptyObjectSchema = createJsonSchema(z.object({}))
      const emptyObjectJson = '{}'

      const result = emptyObjectSchema.safeParse(emptyObjectJson)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({})
    })
  })
})
