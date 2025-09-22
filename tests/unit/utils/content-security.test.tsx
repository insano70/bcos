/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  sanitizeUserName,
  sanitizeEmail,
  sanitizePracticeName,
  sanitizeBioContent,
  sanitizePhoneNumber,
  sanitizeDisplayUrl,
  SafeUserName,
  SafePracticeContent
} from '@/lib/utils/content-security'

describe('content-security utilities', () => {
  describe('sanitizeUserName', () => {
    it('should sanitize user names by removing dangerous characters', () => {
      const dangerousName = 'John<script>alert("xss")</script>Doe'
      const expected = 'Johnalert("xss")Doe'

      const result = sanitizeUserName(dangerousName)

      expect(result).toBe(expected)
    })

    it('should remove angle brackets and quotes', () => {
      const dangerousName = 'John<Doe> "Test" \'Quote\''
      const expected = 'JohnDoe Test Quote'

      const result = sanitizeUserName(dangerousName)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const nameWithWhitespace = '  John Doe  '
      const expected = 'John Doe'

      const result = sanitizeUserName(nameWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 100 characters', () => {
      const longName = 'a'.repeat(150)
      const expected = 'a'.repeat(100)

      const result = sanitizeUserName(longName)

      expect(result).toBe(expected)
      expect(result.length).toBe(100)
    })

    it('should return empty string for null input', () => {
      const result = sanitizeUserName(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizeUserName(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizeUserName(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizeUserName('')

      expect(result).toBe('')
    })

    it('should allow international characters', () => {
      const internationalName = 'José María'
      const expected = 'José María'

      const result = sanitizeUserName(internationalName)

      expect(result).toBe(expected)
    })

    it('should preserve safe punctuation', () => {
      const nameWithPunctuation = 'John-Paul O\'Connor'
      const expected = 'John-Paul O\'Connor'

      const result = sanitizeUserName(nameWithPunctuation)

      expect(result).toBe(expected)
    })
  })

  describe('sanitizeEmail', () => {
    it('should sanitize email by removing dangerous characters', () => {
      const dangerousEmail = 'test<script>@example.com'
      const expected = 'test@example.com'

      const result = sanitizeEmail(dangerousEmail)

      expect(result).toBe(expected)
    })

    it('should convert email to lowercase', () => {
      const upperEmail = 'TEST@EXAMPLE.COM'
      const expected = 'test@example.com'

      const result = sanitizeEmail(upperEmail)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const emailWithWhitespace = '  test@example.com  '
      const expected = 'test@example.com'

      const result = sanitizeEmail(emailWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@example.com'
      const expected = 'a'.repeat(250) + '@example.co' // Limited to 255 chars

      const result = sanitizeEmail(longEmail)

      expect(result.length).toBeLessThanOrEqual(255)
    })

    it('should return empty string for null input', () => {
      const result = sanitizeEmail(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizeEmail(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizeEmail(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizeEmail('')

      expect(result).toBe('')
    })

    it('should remove angle brackets and quotes', () => {
      const dangerousEmail = 'test<>"\'@example.com'
      const expected = 'test@example.com'

      const result = sanitizeEmail(dangerousEmail)

      expect(result).toBe(expected)
    })
  })

  describe('sanitizePracticeName', () => {
    it('should sanitize practice names by removing dangerous characters', () => {
      const dangerousName = 'Medical<script>alert("xss")</script>Center'
      const expected = 'Medicalalert("xss")Center'

      const result = sanitizePracticeName(dangerousName)

      expect(result).toBe(expected)
    })

    it('should remove angle brackets and quotes', () => {
      const dangerousName = 'Medical<Center> "Test" \'Practice\''
      const expected = 'MedicalCenter Test Practice'

      const result = sanitizePracticeName(dangerousName)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const nameWithWhitespace = '  Medical Center  '
      const expected = 'Medical Center'

      const result = sanitizePracticeName(nameWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 255 characters', () => {
      const longName = 'a'.repeat(300)
      const expected = 'a'.repeat(255)

      const result = sanitizePracticeName(longName)

      expect(result).toBe(expected)
      expect(result.length).toBe(255)
    })

    it('should return empty string for null input', () => {
      const result = sanitizePracticeName(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizePracticeName(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizePracticeName(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizePracticeName('')

      expect(result).toBe('')
    })

    it('should allow business-appropriate characters', () => {
      const businessName = 'Medical Center & Associates, LLC'
      const expected = 'Medical Center & Associates, LLC'

      const result = sanitizePracticeName(businessName)

      expect(result).toBe(expected)
    })
  })

  describe('sanitizeBioContent', () => {
    it('should remove script tags completely', () => {
      const bioWithScript = 'About us<script>alert("xss")</script> content'
      const expected = 'About us content'

      const result = sanitizeBioContent(bioWithScript)

      expect(result).toBe(expected)
    })

    it('should remove all HTML tags', () => {
      const bioWithHtml = '<p>About <strong>us</strong></p><br>More content'
      const expected = 'About usMore content'

      const result = sanitizeBioContent(bioWithHtml)

      expect(result).toBe(expected)
    })

    it('should remove dangerous characters', () => {
      const bioWithDangerousChars = 'About us <>"\' content'
      const expected = 'About us  content'

      const result = sanitizeBioContent(bioWithDangerousChars)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const bioWithWhitespace = '  About us content  '
      const expected = 'About us content'

      const result = sanitizeBioContent(bioWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 2000 characters', () => {
      const longBio = 'a'.repeat(2500)
      const expected = 'a'.repeat(2000)

      const result = sanitizeBioContent(longBio)

      expect(result).toBe(expected)
      expect(result.length).toBe(2000)
    })

    it('should return empty string for null input', () => {
      const result = sanitizeBioContent(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizeBioContent(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizeBioContent(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizeBioContent('')

      expect(result).toBe('')
    })

    it('should handle complex script removal', () => {
      const complexScript = 'Content <script type="text/javascript">alert("xss")</script> more content'
      const expected = 'Content  more content'

      const result = sanitizeBioContent(complexScript)

      expect(result).toBe(expected)
    })

    it('should handle nested tags and scripts', () => {
      const nestedContent = '<div>Content <script><b>alert("xss")</b></script> end</div>'
      const expected = 'Content  end'

      const result = sanitizeBioContent(nestedContent)

      expect(result).toBe(expected)
    })
  })

  describe('sanitizePhoneNumber', () => {
    it('should allow valid phone number characters', () => {
      const validPhones = [
        '+1 (555) 123-4567',
        '+44 20 7123 4567',
        '555-123-4567',
        '555.123.4567',
        '(555) 123-4567'
      ]

      validPhones.forEach(phone => {
        const result = sanitizePhoneNumber(phone)
        expect(result).toMatch(/^[0-9\s\-()+.]+$/)
      })
    })

    it('should remove invalid characters', () => {
      const phoneWithInvalidChars = '+1 (555) 123-4567<script>'
      const expected = '+1 (555) 123-4567'

      const result = sanitizePhoneNumber(phoneWithInvalidChars)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const phoneWithWhitespace = '  +1 555-123-4567  '
      const expected = '+1 555-123-4567'

      const result = sanitizePhoneNumber(phoneWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 20 characters', () => {
      const longPhone = '+1 555-123-4567 extension 12345'
      const expected = '+1 555-123-4567 exte' // Limited to 20 chars

      const result = sanitizePhoneNumber(longPhone)

      expect(result.length).toBeLessThanOrEqual(20)
    })

    it('should return empty string for null input', () => {
      const result = sanitizePhoneNumber(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizePhoneNumber(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizePhoneNumber(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = sanitizePhoneNumber('')

      expect(result).toBe('')
    })

    it('should preserve valid phone number formats', () => {
      const validFormats = [
        '+1234567890',
        '123-456-7890',
        '(123) 456-7890',
        '123.456.7890'
      ]

      validFormats.forEach(phone => {
        const result = sanitizePhoneNumber(phone)
        expect(result).toBe(phone)
      })
    })
  })

  describe('sanitizeDisplayUrl', () => {
    it('should return safe relative URLs unchanged', () => {
      const urls = ['/path', '/path/to/file', 'relative/path']

      urls.forEach(url => {
        const result = sanitizeDisplayUrl(url)
        expect(result).toBe(url)
      })
    })

    it('should return safe absolute URLs unchanged', () => {
      const urls = [
        'https://example.com',
        'http://example.com',
        'https://subdomain.example.com/path'
      ]

      urls.forEach(url => {
        const result = sanitizeDisplayUrl(url)
        expect(result).toBe(url)
      })
    })

    it('should return empty string for dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd'
      ]

      dangerousUrls.forEach(url => {
        const result = sanitizeDisplayUrl(url)
        expect(result).toBe('')
      })
    })

    it('should trim whitespace', () => {
      const urlWithWhitespace = '  https://example.com  '
      const expected = 'https://example.com'

      const result = sanitizeDisplayUrl(urlWithWhitespace)

      expect(result).toBe(expected)
    })

    it('should limit length to 500 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(500)
      const result = sanitizeDisplayUrl(longUrl)

      expect(result.length).toBeLessThanOrEqual(500)
    })

    it('should return empty string for null input', () => {
      const result = sanitizeDisplayUrl(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizeDisplayUrl(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizeDisplayUrl(123 as any)

      expect(result).toBe('')
    })

    it('should return empty string for empty string', () => {
      const result = sanitizeDisplayUrl('')

      expect(result).toBe('')
    })

    it('should handle protocol-relative URLs', () => {
      const protocolRelative = '//example.com/path'

      const result = sanitizeDisplayUrl(protocolRelative)

      expect(result).toBe('//example.com/path') // Not considered dangerous
    })
  })

  describe('SafeUserName', () => {
    it('should render sanitized full name', () => {
      render(<SafeUserName firstName="John<script>" lastName="Doe" />)

      const element = screen.getByText('John Doe')
      expect(element).toBeInTheDocument()
      expect(element.tagName).toBe('SPAN')
    })

    it('should handle missing first name', () => {
      render(<SafeUserName lastName="Doe" />)

      const element = screen.getByText('Doe')
      expect(element).toBeInTheDocument()
    })

    it('should handle missing last name', () => {
      render(<SafeUserName firstName="John" />)

      const element = screen.getByText('John')
      expect(element).toBeInTheDocument()
    })

    it('should show "Unknown User" when both names are empty', () => {
      render(<SafeUserName firstName="" lastName="" />)

      const element = screen.getByText('Unknown User')
      expect(element).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<SafeUserName firstName="John" lastName="Doe" className="user-name" />)

      const element = screen.getByText('John Doe')
      expect(element).toHaveClass('user-name')
    })

    it('should sanitize dangerous content in names', () => {
      render(<SafeUserName firstName="John<script>" lastName="Doe<>" />)

      const element = screen.getByText('John Doe')
      expect(element).toBeInTheDocument()
    })

    it('should handle null/undefined names', () => {
      render(<SafeUserName firstName={null} lastName={undefined} />)

      const element = screen.getByText('Unknown User')
      expect(element).toBeInTheDocument()
    })
  })

  describe('SafePracticeContent', () => {
    it('should render sanitized content', () => {
      const content = 'About us content<script>alert("xss")</script>'

      render(<SafePracticeContent content={content} />)

      const element = screen.getByText('About us content')
      expect(element).toBeInTheDocument()
      expect(element.tagName).toBe('DIV')
    })

    it('should truncate content when it exceeds maxLength', () => {
      const longContent = 'a'.repeat(1500)

      render(<SafePracticeContent content={longContent} maxLength={100} />)

      const element = screen.getByText('a'.repeat(100) + '...')
      expect(element).toBeInTheDocument()
    })

    it('should not truncate when content is within maxLength', () => {
      const content = 'Short content'

      render(<SafePracticeContent content={content} maxLength={100} />)

      const element = screen.getByText('Short content')
      expect(element).toBeInTheDocument()
    })

    it('should show default message for empty content', () => {
      render(<SafePracticeContent content="" />)

      const element = screen.getByText('No content available')
      expect(element).toBeInTheDocument()
    })

    it('should show default message for null content', () => {
      render(<SafePracticeContent content={null} />)

      const element = screen.getByText('No content available')
      expect(element).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<SafePracticeContent content="Test content" className="practice-content" />)

      const element = screen.getByText('Test content')
      expect(element).toHaveClass('practice-content')
    })

    it('should sanitize HTML and scripts from content', () => {
      const dangerousContent = '<p>Content</p><script>alert("xss")</script>'

      render(<SafePracticeContent content={dangerousContent} />)

      const element = screen.getByText('Content')
      expect(element).toBeInTheDocument()
    })

    it('should use default maxLength of 1000', () => {
      const content999 = 'a'.repeat(999)
      const content1001 = 'a'.repeat(1001)

      render(<SafePracticeContent content={content999} />)
      const element999 = screen.getByText('a'.repeat(999))
      expect(element999).toBeInTheDocument()

      render(<SafePracticeContent content={content1001} />)
      const element1001 = screen.getByText('a'.repeat(1000) + '...')
      expect(element1001).toBeInTheDocument()
    })
  })
})
