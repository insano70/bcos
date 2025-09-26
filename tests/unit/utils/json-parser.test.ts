import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  safeJsonParse,
  parseBusinessHours,
  parseServices,
  parseInsurance,
  parseInsuranceAccepted,
  parseConditions,
  parseConditionsTreated,
  parseSpecialties,
  parseEducation,
  parseGalleryImages
} from '@/lib/utils/json-parser'

// Mock console.warn
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('json-parser utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('safeJsonParse', () => {
    it('should parse valid JSON string', () => {
      const jsonString = '{"name": "John", "age": 30}'
      const fallback = { name: 'Default', age: 0 }

      const result = safeJsonParse(jsonString, fallback)

      expect(result).toEqual({ name: 'John', age: 30 })
    })

    it('should return fallback for null input', () => {
      const fallback = { default: true }

      const result = safeJsonParse(null, fallback)

      expect(result).toEqual(fallback)
    })

    it('should return fallback for undefined input', () => {
      const fallback = { default: true }

      const result = safeJsonParse(undefined, fallback)

      expect(result).toEqual(fallback)
    })

    it('should return non-string input as-is', () => {
      const input = { already: 'parsed' }
      const fallback = { default: true }

      const result = safeJsonParse(input, fallback)

      expect(result).toBe(input)
    })

    it('should return fallback for empty string', () => {
      const fallback = { default: true }

      const result = safeJsonParse('', fallback)

      expect(result).toEqual(fallback)
    })

    it('should return fallback for whitespace-only string', () => {
      const fallback = { default: true }

      const result = safeJsonParse('   ', fallback)

      expect(result).toEqual(fallback)
    })

    it('should return fallback for invalid JSON and log warning', () => {
      const invalidJson = '{"name": "John", "age": }'
      const fallback = { name: 'Default', age: 0 }

      const result = safeJsonParse(invalidJson, fallback)

      expect(result).toEqual(fallback)
      expect(consoleWarnSpy).toHaveBeenCalledWith('Failed to parse JSON:', invalidJson, expect.any(SyntaxError))
    })

    it('should handle complex valid JSON', () => {
      const jsonString = '{"users": [{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}], "total": 2}'
      const fallback = { users: [], total: 0 }

      const result = safeJsonParse(jsonString, fallback)

      expect(result).toEqual({
        users: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ],
        total: 2
      })
    })

    it('should handle primitive values', () => {
      expect(safeJsonParse('42', 0)).toBe(42)
      expect(safeJsonParse('"hello"', '')).toBe('hello')
      expect(safeJsonParse('true', false)).toBe(true)
      expect(safeJsonParse('null', 'default')).toBe(null)
    })

    it('should handle array parsing', () => {
      const jsonString = '[1, 2, 3, "four"]'
      const fallback: any[] = []

      const result = safeJsonParse(jsonString, fallback)

      expect(result).toEqual([1, 2, 3, 'four'])
    })
  })

  describe('parseBusinessHours', () => {
    it('should parse valid business hours JSON', () => {
      const jsonString = '{"monday": {"open": "08:00", "close": "16:00", "closed": false}, "tuesday": {"closed": true}}'

      const result = parseBusinessHours(jsonString)

      expect(result).toEqual({
        monday: { open: '08:00', close: '16:00', closed: false },
        tuesday: { closed: true }
      })
    })

    it('should return default business hours for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseBusinessHours(invalidJson)

      expect(result).toEqual({
        sunday: { closed: true },
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true }
      })
    })

    it('should return default business hours for null input', () => {
      const result = parseBusinessHours(null)

      expect(result).toEqual({
        sunday: { closed: true },
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true }
      })
    })

    it('should handle partial business hours', () => {
      const jsonString = '{"wednesday": {"open": "10:00", "close": "14:00", "closed": false}}'

      const result = parseBusinessHours(jsonString)

      expect(result.wednesday).toEqual({
        open: '10:00',
        close: '14:00',
        closed: false
      })
      // Other days should still have defaults
      expect(result.monday).toEqual({
        open: '09:00',
        close: '17:00',
        closed: false
      })
    })
  })

  describe('parseServices', () => {
    it('should parse valid services array', () => {
      const jsonString = '["Consultation", "Treatment", "Follow-up"]'

      const result = parseServices(jsonString)

      expect(result).toEqual(['Consultation', 'Treatment', 'Follow-up'])
    })

    it('should return empty array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseServices(invalidJson)

      expect(result).toEqual([])
    })

    it('should return empty array for null input', () => {
      const result = parseServices(null)

      expect(result).toEqual([])
    })

    it('should handle empty services array', () => {
      const jsonString = '[]'

      const result = parseServices(jsonString)

      expect(result).toEqual([])
    })
  })

  describe('parseInsurance', () => {
    it('should parse valid insurance array', () => {
      const jsonString = '["Blue Cross", "Aetna", "Cigna"]'

      const result = parseInsurance(jsonString)

      expect(result).toEqual(['Blue Cross', 'Aetna', 'Cigna'])
    })

    it('should return default insurance array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseInsurance(invalidJson)

      expect(result).toEqual([
        'Aetna',
        'Anthem Blue Cross Blue Shield',
        'Cigna',
        'Medicare',
        'UnitedHealthcare'
      ])
    })

    it('should return default insurance array for null input', () => {
      const result = parseInsurance(null)

      expect(result).toEqual([
        'Aetna',
        'Anthem Blue Cross Blue Shield',
        'Cigna',
        'Medicare',
        'UnitedHealthcare'
      ])
    })

    it('should handle empty insurance array', () => {
      const jsonString = '[]'

      const result = parseInsurance(jsonString)

      expect(result).toEqual([])
    })
  })

  describe('parseInsuranceAccepted', () => {
    it('should be alias for parseInsurance', () => {
      const jsonString = '["Test Insurance"]'

      const result = parseInsuranceAccepted(jsonString)

      expect(result).toEqual(['Test Insurance'])
    })

    it('should return same defaults as parseInsurance', () => {
      const result = parseInsuranceAccepted(null)

      expect(result).toEqual([
        'Aetna',
        'Anthem Blue Cross Blue Shield',
        'Cigna',
        'Medicare',
        'UnitedHealthcare'
      ])
    })
  })

  describe('parseConditions', () => {
    it('should parse valid conditions array', () => {
      const jsonString = '["Arthritis", "Back Pain", "Migraine"]'

      const result = parseConditions(jsonString)

      expect(result).toEqual(['Arthritis', 'Back Pain', 'Migraine'])
    })

    it('should return empty array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseConditions(invalidJson)

      expect(result).toEqual([])
    })

    it('should return empty array for null input', () => {
      const result = parseConditions(null)

      expect(result).toEqual([])
    })
  })

  describe('parseConditionsTreated', () => {
    it('should be alias for parseConditions', () => {
      const jsonString = '["Condition A", "Condition B"]'

      const result = parseConditionsTreated(jsonString)

      expect(result).toEqual(['Condition A', 'Condition B'])
    })

    it('should return same defaults as parseConditions', () => {
      const result = parseConditionsTreated(null)

      expect(result).toEqual([])
    })
  })

  describe('parseSpecialties', () => {
    it('should parse valid specialties array', () => {
      const jsonString = '["Rheumatology", "Internal Medicine", "Sports Medicine"]'

      const result = parseSpecialties(jsonString)

      expect(result).toEqual(['Rheumatology', 'Internal Medicine', 'Sports Medicine'])
    })

    it('should return empty array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseSpecialties(invalidJson)

      expect(result).toEqual([])
    })

    it('should return empty array for null input', () => {
      const result = parseSpecialties(null)

      expect(result).toEqual([])
    })
  })

  describe('parseEducation', () => {
    it('should parse valid education array', () => {
      const jsonString = '[{"institution": "University A", "year": "2020"}, {"institution": "University B", "year": "2022"}]'

      const result = parseEducation(jsonString)

      expect(result).toEqual([
        { institution: 'University A', year: '2020' },
        { institution: 'University B', year: '2022' }
      ])
    })

    it('should return empty array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseEducation(invalidJson)

      expect(result).toEqual([])
    })

    it('should return empty array for null input', () => {
      const result = parseEducation(null)

      expect(result).toEqual([])
    })
  })

  describe('parseGalleryImages', () => {
    it('should parse valid gallery images array', () => {
      const jsonString = '["/images/1.jpg", "/images/2.jpg", "https://example.com/3.jpg"]'

      const result = parseGalleryImages(jsonString)

      expect(result).toEqual([
        '/images/1.jpg',
        '/images/2.jpg',
        'https://example.com/3.jpg'
      ])
    })

    it('should return empty array for invalid JSON', () => {
      const invalidJson = 'invalid json'

      const result = parseGalleryImages(invalidJson)

      expect(result).toEqual([])
    })

    it('should return empty array for null input', () => {
      const result = parseGalleryImages(null)

      expect(result).toEqual([])
    })

    it('should handle complex image objects', () => {
      const jsonString = '[{"url": "/img1.jpg", "alt": "Image 1"}, {"url": "/img2.jpg", "alt": "Image 2"}]'

      const result = parseGalleryImages(jsonString)

      expect(result).toEqual([
        { url: '/img1.jpg', alt: 'Image 1' },
        { url: '/img2.jpg', alt: 'Image 2' }
      ])
    })
  })
})
