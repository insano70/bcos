/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import DOMPurify from 'isomorphic-dompurify'
import {
  sanitizeHtml,
  textToSafeHtml,
  stripHtml,
  sanitizeUrl,
  SafeHtmlRenderer
} from '@/lib/utils/html-sanitizer'

// Mock DOMPurify
vi.mock('isomorphic-dompurify', () => ({
  default: {
    sanitize: vi.fn()
  },
  sanitize: vi.fn()
}))

describe('html-sanitizer utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sanitizeHtml', () => {
    it('should sanitize HTML using DOMPurify with configured options', () => {
      const html = '<p>Hello <strong>world</strong></p><script>alert("xss")</script>'
      const sanitized = '<p>Hello <strong>world</strong></p>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      const result = sanitizeHtml(html)

      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
          'a', 'span', 'div'
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input', 'textarea', 'button', 'select'],
        FORBID_ATTR: ['onclick', 'onload', 'onerror', 'style']
      })
      expect(result).toBe(sanitized)
    })

    it('should return empty string for null input', () => {
      const result = sanitizeHtml(null as any)

      expect(result).toBe('')
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
    })

    it('should return empty string for undefined input', () => {
      const result = sanitizeHtml(undefined as any)

      expect(result).toBe('')
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
    })

    it('should return empty string for non-string input', () => {
      const result = sanitizeHtml(123 as any)

      expect(result).toBe('')
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
    })

    it('should handle empty string input', () => {
      const result = sanitizeHtml('')

      expect(result).toBe('')
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
    })

    it('should remove dangerous script tags', () => {
      const dangerousHtml = '<p>Safe</p><script>alert("xss")</script>'
      const sanitized = '<p>Safe</p>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      const result = sanitizeHtml(dangerousHtml)

      expect(result).toBe(sanitized)
    })

    it('should remove dangerous event handlers', () => {
      const dangerousHtml = '<a href="#" onclick="alert(\'xss\')">Click me</a>'
      const sanitized = '<a href="#">Click me</a>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      const result = sanitizeHtml(dangerousHtml)

      expect(result).toBe(sanitized)
    })

    it('should preserve safe HTML elements', () => {
      const safeHtml = '<p>Hello <strong>world</strong></p><br><em>emphasis</em>'
      const sanitized = safeHtml // Assuming DOMPurify preserves this

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      const result = sanitizeHtml(safeHtml)

      expect(result).toBe(sanitized)
    })

    it('should preserve safe links with allowed attributes', () => {
      const htmlWithLinks = '<a href="https://example.com" target="_blank" rel="noopener">Link</a>'
      const sanitized = htmlWithLinks

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      const result = sanitizeHtml(htmlWithLinks)

      expect(result).toBe(sanitized)
    })
  })

  describe('textToSafeHtml', () => {
    it('should convert plain text to safe HTML with line breaks', () => {
      const text = 'Hello\nWorld\n\nTest'
      const expected = 'Hello<br>World<br><br>Test'

      const result = textToSafeHtml(text)

      expect(result).toBe(expected)
    })

    it('should escape HTML entities', () => {
      const text = 'Hello <world> & "quotes" \'apostrophes\''
      const expected = 'Hello &lt;world&gt; &amp; &quot;quotes&quot; &#x27;apostrophes&#x27;'

      const result = textToSafeHtml(text)

      expect(result).toBe(expected)
    })

    it('should trim whitespace', () => {
      const text = '  Hello World  '
      const expected = 'Hello World'

      const result = textToSafeHtml(text)

      expect(result).toBe(expected)
    })

    it('should return empty string for null input', () => {
      const result = textToSafeHtml(null as any)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = textToSafeHtml(undefined as any)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = textToSafeHtml(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = textToSafeHtml('')

      expect(result).toBe('')
    })

    it('should handle complex text with multiple entities', () => {
      const text = 'User <admin@example.com> said "Hello & goodbye"'
      const expected = 'User &lt;admin@example.com&gt; said &quot;Hello &amp; goodbye&quot;'

      const result = textToSafeHtml(text)

      expect(result).toBe(expected)
    })
  })

  describe('stripHtml', () => {
    it('should remove all HTML tags and return plain text', () => {
      const html = '<p>Hello <strong>world</strong></p><br><em>test</em>'
      const expected = 'Hello world\ntest'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should decode HTML entities', () => {
      const html = 'Hello &amp; welcome &lt;user&gt; &quot;test&quot; &#x27;quote&#x27;'
      const expected = 'Hello & welcome <user> "test" \'quote\''

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should handle nested tags', () => {
      const html = '<div><p>Hello <span>world</span></p></div>'
      const expected = 'Hello world'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should handle self-closing tags', () => {
      const html = 'Line 1<br>Line 2<hr>Line 3'
      const expected = 'Line 1\nLine 2\nLine 3'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should handle non-breaking spaces', () => {
      const html = 'Hello&nbsp;world'
      const expected = 'Hello world'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should trim result', () => {
      const html = '  <p>Hello world</p>  '
      const expected = 'Hello world'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })

    it('should return empty string for null input', () => {
      const result = stripHtml(null as any)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = stripHtml(undefined as any)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = stripHtml(123 as any)

      expect(result).toBe('')
    })

    it('should handle malformed HTML gracefully', () => {
      const html = '<p>Hello <strong world</p>'
      const expected = 'Hello'

      const result = stripHtml(html)

      expect(result).toBe(expected)
    })
  })

  describe('sanitizeUrl', () => {
    it('should return safe relative URLs unchanged', () => {
      const urls = ['/path', '/path/to/file', 'relative/path', './relative']

      urls.forEach(url => {
        const result = sanitizeUrl(url)
        expect(result).toBe(url)
      })
    })

    it('should return safe absolute HTTP/HTTPS URLs unchanged', () => {
      const urls = [
        'https://example.com',
        'http://example.com',
        'https://subdomain.example.com/path?query=value'
      ]

      urls.forEach(url => {
        const result = sanitizeUrl(url)
        expect(result).toBe(url)
      })
    })

    it('should return # for dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd'
      ]

      dangerousUrls.forEach(url => {
        const result = sanitizeUrl(url)
        expect(result).toBe('#')
      })
    })

    it('should return # for protocol-relative URLs starting with //', () => {
      const url = '//evil.com/script.js'

      const result = sanitizeUrl(url)

      expect(result).toBe('#')
    })

    it('should return # for URLs with non-HTTP/HTTPS protocols', () => {
      const urls = [
        'ftp://example.com',
        'mailto:test@example.com',
        'tel:+1234567890',
        'sms:+1234567890'
      ]

      urls.forEach(url => {
        const result = sanitizeUrl(url)
        expect(result).toBe('#')
      })
    })

    it('should return # for malformed URLs', () => {
      const malformedUrls = [
        'https://',
        'http://',
        '://example.com',
        'https:// example.com' // space in URL
      ]

      malformedUrls.forEach(url => {
        const result = sanitizeUrl(url)
        expect(result).toBe('#')
      })
    })

    it('should return # for null input', () => {
      const result = sanitizeUrl(null as any)

      expect(result).toBe('#')
    })

    it('should return # for undefined input', () => {
      const result = sanitizeUrl(undefined as any)

      expect(result).toBe('#')
    })

    it('should return # for non-string input', () => {
      const result = sanitizeUrl(123 as any)

      expect(result).toBe('#')
    })

    it('should return # for empty string', () => {
      const result = sanitizeUrl('')

      expect(result).toBe('#')
    })

    it('should handle URLs with special characters in path', () => {
      const url = 'https://example.com/path with spaces/file.html'

      const result = sanitizeUrl(url)

      expect(result).toBe('#') // Malformed due to space
    })
  })

  describe('SafeHtmlRenderer', () => {
    it('should render sanitized HTML when stripTags is false', () => {
      const html = '<p>Hello <strong>world</strong></p>'
      const sanitized = '<p>Hello <strong>world</strong></p>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      render(<SafeHtmlRenderer html={html} />)

      const element = screen.getByText('Hello')
      expect(element).toBeInTheDocument()
      expect(element.tagName).toBe('DIV')
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html, expect.any(Object))
    })

    it('should render plain text when stripTags is true', () => {
      const html = '<p>Hello <strong>world</strong></p>'

      render(<SafeHtmlRenderer html={html} stripTags={true} />)

      const element = screen.getByText('Hello world')
      expect(element).toBeInTheDocument()
      expect(element.tagName).toBe('DIV')
      expect(DOMPurify.sanitize).not.toHaveBeenCalled()
    })

    it('should apply custom className', () => {
      const html = '<p>Test</p>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Test</p>')

      render(<SafeHtmlRenderer html={html} className="custom-class" />)

      const element = screen.getByText('Test')
      expect(element).toHaveClass('custom-class')
    })

    it('should handle empty HTML gracefully', () => {
      render(<SafeHtmlRenderer html="" />)

      // Should render an empty div
      const element = screen.getByRole('generic')
      expect(element).toBeInTheDocument()
    })

    it('should handle dangerous HTML by sanitizing it', () => {
      const dangerousHtml = '<p>Safe</p><script>alert("xss")</script>'
      const sanitized = '<p>Safe</p>'

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized)

      render(<SafeHtmlRenderer html={dangerousHtml} />)

      const element = screen.getByText('Safe')
      expect(element).toBeInTheDocument()
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(dangerousHtml, expect.any(Object))
    })
  })
})
