import { describe, it, expect } from 'vitest'
import { formatDate } from '@/lib/utils/format-date'

describe('formatDate', () => {
  describe('Valid date inputs', () => {
    it('should format Date object correctly', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const result = formatDate(date)
      expect(result).toBe('Jan 15, 2024')
    })

    it('should format ISO date string correctly', () => {
      const dateString = '2024-01-15T10:30:00Z'
      const result = formatDate(dateString)
      expect(result).toBe('Jan 15, 2024')
    })

    it('should format date-only string correctly', () => {
      const dateString = '2024-01-15'
      const result = formatDate(dateString)
      // Result depends on local timezone, but should be Jan 14 or 15, 2024
      expect(result).toMatch(/^Jan (14|15), 2024$/)
    })

    it('should format different months correctly', () => {
      // Test that different months are formatted correctly (day may shift due to timezone)
      const febResult = formatDate('2024-02-15')
      const marResult = formatDate('2024-03-15')
      const decResult = formatDate('2024-12-15')

      expect(febResult).toMatch(/^Feb \d{1,2}, 2024$/)
      expect(marResult).toMatch(/^Mar \d{1,2}, 2024$/)
      expect(decResult).toMatch(/^Dec \d{1,2}, 2024$/)
    })

    it('should format different years correctly', () => {
      // Test that different years are formatted correctly (day may shift due to timezone)
      const year2023 = formatDate('2023-01-15')
      const year2025 = formatDate('2025-01-15')
      const year1999 = formatDate('1999-01-15')

      expect(year2023).toMatch(/^Jan \d{1,2}, 2023$/)
      expect(year2025).toMatch(/^Jan \d{1,2}, 2025$/)
      expect(year1999).toMatch(/^Jan \d{1,2}, 1999$/)
    })
  })

  describe('Invalid inputs', () => {
    it('should return dash for null input', () => {
      const result = formatDate(null)
      expect(result).toBe('-')
    })

    it('should return dash for undefined input', () => {
      const result = formatDate(undefined as any)
      expect(result).toBe('-')
    })

    it('should return dash for empty string', () => {
      const result = formatDate('')
      expect(result).toBe('-')
    })

    it('should handle invalid date strings gracefully', () => {
      const result = formatDate('invalid-date')
      expect(result).toBe('Invalid Date')
    })

    it('should handle invalid Date objects gracefully', () => {
      const invalidDate = new Date('invalid')
      const result = formatDate(invalidDate)
      expect(result).toBe('Invalid Date')
    })
  })

  describe('Edge cases', () => {
    it('should handle leap year dates correctly', () => {
      const leapDate = '2024-02-29' // Valid leap year date
      const result = formatDate(leapDate)
      // Should format as Feb with some day in 2024
      expect(result).toMatch(/^Feb \d{1,2}, 2024$/)
    })

    it('should handle year boundaries correctly', () => {
      const yearStart = '2024-01-01'
      const yearEnd = '2024-12-31'

      const startResult = formatDate(yearStart)
      const endResult = formatDate(yearEnd)

      // Should be in 2024, with appropriate months
      expect(startResult).toMatch(/2024$/)
      expect(endResult).toMatch(/2024$/)
    })

    it('should handle single digit days correctly', () => {
      const singleDigitDay = '2024-01-05'
      const result = formatDate(singleDigitDay)
      // Should format as Jan with some day in 2024
      expect(result).toMatch(/^Jan \d{1,2}, 2024$/)
    })
  })
})
