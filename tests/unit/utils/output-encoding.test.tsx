/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  encodeHtmlAttribute,
  encodeHtmlContent,
  encodeJavaScript,
  encodeUrlParameter,
  encodeCssValue,
  SafeContent,
  SafeLink
} from '@/lib/utils/output-encoding'

describe('output-encoding utilities', () => {
  describe('encodeHtmlAttribute', () => {
    it('should encode dangerous characters for HTML attributes', () => {
      const dangerousValue = 'value with "quotes" & <tags>'
      const expected = 'value with &quot;quotes&quot; &amp; &lt;tags&gt;'

      const result = encodeHtmlAttribute(dangerousValue)

      expect(result).toBe(expected)
    })

    it('should encode all required characters', () => {
      const testCases = [
        { input: '&', expected: '&amp;' },
        { input: '"', expected: '&quot;' },
        { input: "'", expected: '&#x27;' },
        { input: '<', expected: '&lt;' },
        { input: '>', expected: '&gt;' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = encodeHtmlAttribute(input)
        expect(result).toBe(expected)
      })
    })

    it('should handle complex attribute values', () => {
      const complexValue = 'John\'s "special" value <>&'
      const expected = 'John&#x27;s &quot;special&quot; value &lt;&gt;&amp;'

      const result = encodeHtmlAttribute(complexValue)

      expect(result).toBe(expected)
    })

    it('should return empty string for null input', () => {
      const result = encodeHtmlAttribute(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = encodeHtmlAttribute(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = encodeHtmlAttribute(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = encodeHtmlAttribute('')

      expect(result).toBe('')
    })

    it('should preserve safe characters', () => {
      const safeValue = 'John-Doe_123@email.com'
      const result = encodeHtmlAttribute(safeValue)

      expect(result).toBe(safeValue)
    })
  })

  describe('encodeHtmlContent', () => {
    it('should encode dangerous characters for HTML content', () => {
      const dangerousValue = 'Content with "quotes" & <tags> \'apostrophes\''
      const expected = 'Content with &quot;quotes&quot; &amp; &lt;tags&gt; &#x27;apostrophes&#x27;'

      const result = encodeHtmlContent(dangerousValue)

      expect(result).toBe(expected)
    })

    it('should encode all required characters', () => {
      const testCases = [
        { input: '&', expected: '&amp;' },
        { input: '<', expected: '&lt;' },
        { input: '>', expected: '&gt;' },
        { input: '"', expected: '&quot;' },
        { input: "'", expected: '&#x27;' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = encodeHtmlContent(input)
        expect(result).toBe(expected)
      })
    })

    it('should return empty string for null input', () => {
      const result = encodeHtmlContent(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = encodeHtmlContent(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = encodeHtmlContent(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = encodeHtmlContent('')

      expect(result).toBe('')
    })

    it('should preserve alphanumeric characters and safe symbols', () => {
      const safeContent = 'John Doe (123) - test@example.com'
      const result = encodeHtmlContent(safeContent)

      expect(result).toBe(safeContent)
    })
  })

  describe('encodeJavaScript', () => {
    it('should escape JavaScript string delimiters', () => {
      const jsString = 'alert("Hello"); var x = \'test\';'
      const expected = 'alert(\\"Hello\\"); var x = \\\'test\\\';'

      const result = encodeJavaScript(jsString)

      expect(result).toBe(expected)
    })

    it('should escape special characters', () => {
      const testCases = [
        { input: '\\', expected: '\\\\' },
        { input: "'", expected: "\\'" },
        { input: '"', expected: '\\"' },
        { input: '\n', expected: '\\n' },
        { input: '\r', expected: '\\r' },
        { input: '\t', expected: '\\t' },
        { input: '/', expected: '\\/' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = encodeJavaScript(input)
        expect(result).toBe(expected)
      })
    })

    it('should handle complex JavaScript strings', () => {
      const complexJs = 'function() { return "It\'s working!"; }'
      const expected = 'function() { return \\"It\\\'s working!\\"; }'

      const result = encodeJavaScript(complexJs)

      expect(result).toBe(expected)
    })

    it('should return empty string for null input', () => {
      const result = encodeJavaScript(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = encodeJavaScript(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = encodeJavaScript(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = encodeJavaScript('')

      expect(result).toBe('')
    })

    it('should escape forward slashes to prevent </script> attacks', () => {
      const dangerousJs = '</script><script>alert("xss")</script>'
      const expected = '<\\/script><script>alert(\\"xss\\")<\\/script>'

      const result = encodeJavaScript(dangerousJs)

      expect(result).toBe(expected)
    })
  })

  describe('encodeUrlParameter', () => {
    it('should encode URL parameters using encodeURIComponent', () => {
      const parameter = 'hello world & special=chars?'
      const expected = 'hello%20world%20%26%20special%3Dchars%3F'

      const result = encodeUrlParameter(parameter)

      expect(result).toBe(expected)
    })

    it('should handle special characters', () => {
      const testCases = [
        { input: ' ', expected: '%20' },
        { input: '&', expected: '%26' },
        { input: '=', expected: '%3D' },
        { input: '?', expected: '%3F' },
        { input: '#', expected: '%23' },
        { input: '%', expected: '%25' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = encodeUrlParameter(input)
        expect(result).toBe(expected)
      })
    })

    it('should return empty string for null input', () => {
      const result = encodeUrlParameter(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = encodeUrlParameter(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = encodeUrlParameter(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = encodeUrlParameter('')

      expect(result).toBe('')
    })

    it('should handle already encoded parameters', () => {
      const alreadyEncoded = 'hello%20world'
      const result = encodeUrlParameter(alreadyEncoded)

      expect(result).toBe('hello%2520world') // % becomes %25
    })
  })

  describe('encodeCssValue', () => {
    it('should remove dangerous characters from CSS values', () => {
      const dangerousCss = 'expression(alert("xss"))'
      const expected = 'alert(xss))' // Function removes quotes and expression()

      const result = encodeCssValue(dangerousCss)

      expect(result).toBe(expected)
    })

    it('should remove HTML tags and quotes', () => {
      const cssWithTags = 'color: <style>background: "red"</style>'
      const expected = 'color: stylebackground: red/style' // Removes < > " characters

      const result = encodeCssValue(cssWithTags)

      expect(result).toBe(expected)
    })

    it('should remove javascript: protocols', () => {
      const jsProtocol = 'javascript:alert("xss")'
      const expected = 'alert(xss)' // Removes javascript: protocol and quotes

      const result = encodeCssValue(jsProtocol)

      expect(result).toBe(expected)
    })

    it('should handle case-insensitive javascript removal', () => {
      const mixedCaseJs = 'JavaScript:alert("xss")'
      const expected = 'alert(xss)' // Removes JavaScript: protocol and quotes (case insensitive)

      const result = encodeCssValue(mixedCaseJs)

      expect(result).toBe(expected)
    })

    it('should remove expression() functions', () => {
      const expressionCss = 'width: expression(alert("xss"))'
      const expected = 'width: alert(xss))' // Removes expression( and quotes

      const result = encodeCssValue(expressionCss)

      expect(result).toBe(expected)
    })

    it('should return empty string for null input', () => {
      const result = encodeCssValue(null)

      expect(result).toBe('')
    })

    it('should return empty string for undefined input', () => {
      const result = encodeCssValue(undefined)

      expect(result).toBe('')
    })

    it('should return empty string for non-string input', () => {
      const result = encodeCssValue(123 as any)

      expect(result).toBe('')
    })

    it('should handle empty string', () => {
      const result = encodeCssValue('')

      expect(result).toBe('')
    })

    it('should preserve safe CSS values', () => {
      const safeCss = 'color: #ff0000; font-size: 14px;'
      const result = encodeCssValue(safeCss)

      expect(result).toBe(safeCss)
    })
  })

  describe('SafeContent', () => {
    it('should render encoded email content', () => {
      const email = 'TEST@EXAMPLE.COM<script>'

      render(<SafeContent content={email} type="email" />)

      const element = screen.getByText('test@example.com&lt;script&gt;') // HTML entities are encoded
      expect(element).toBeInTheDocument()
      expect(element.tagName).toBe('SPAN')
    })

    it('should render sanitized phone content', () => {
      const phone = '+1 (555) 123-4567<script>'

      render(<SafeContent content={phone} type="phone" />)

      const element = screen.getByText('+1 (555) 123-4567')
      expect(element).toBeInTheDocument()
    })

    it('should render encoded URL content', () => {
      const url = 'https://example.com?param="value"&test'

      render(<SafeContent content={url} type="url" />)

      const element = screen.getByText('https://example.com?param=&quot;value&quot;&amp;test')
      expect(element).toBeInTheDocument()
    })

    it('should render encoded name content', () => {
      const name = 'John <script>Doe</script>'

      render(<SafeContent content={name} type="name" />)

      const element = screen.getByText('John &lt;script&gt;Doe&lt;/script&gt;')
      expect(element).toBeInTheDocument()
    })

    it('should render encoded text content by default', () => {
      const text = 'Hello & welcome <tag>'

      render(<SafeContent content={text} type="text" />)

      const element = screen.getByText('Hello &amp; welcome &lt;tag&gt;')
      expect(element).toBeInTheDocument()
    })

    it('should truncate content when maxLength is specified', () => {
      const longContent = 'This is a very long piece of content that should be truncated'

      render(<SafeContent content={longContent} type="text" maxLength={20} />)

      const element = screen.getByText('This is a very long ...')
      expect(element).toBeInTheDocument()
    })

    it('should not truncate when content is within maxLength', () => {
      const shortContent = 'Short content'

      render(<SafeContent content={shortContent} type="text" maxLength={50} />)

      const element = screen.getByText('Short content')
      expect(element).toBeInTheDocument()
    })

    it('should render dash for null content', () => {
      render(<SafeContent content={null} type="text" />)

      const element = screen.getByText('-')
      expect(element).toBeInTheDocument()
    })

    it('should render dash for undefined content', () => {
      render(<SafeContent content={undefined} type="text" />)

      const element = screen.getByText('-')
      expect(element).toBeInTheDocument()
    })

    it('should render dash for empty string content', () => {
      render(<SafeContent content="" type="text" />)

      const element = screen.getByText('-')
      expect(element).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<SafeContent content="Test" type="text" className="safe-content" />)

      const element = screen.getByText('Test')
      expect(element).toHaveClass('safe-content')
    })

    it('should handle truncation of already encoded content', () => {
      const contentWithEntities = 'Content &amp; more content that is long'

      render(<SafeContent content={contentWithEntities} type="text" maxLength={15} />)

      const element = screen.getByText('Content &amp;am...') // Truncates to 15 chars after encoding
      expect(element).toBeInTheDocument()
    })
  })

  describe('SafeLink', () => {
    it('should render safe HTTP/HTTPS links', () => {
      render(
        <SafeLink href="https://example.com">
          Example Link
        </SafeLink>
      )

      const link = screen.getByRole('link', { name: 'Example Link' })
      expect(link).toHaveAttribute('href', 'https://example.com')
      // No rel attribute when target is not '_blank'
    })

    it('should render safe links with target="_blank" and rel attribute', () => {
      render(
        <SafeLink href="https://example.com" target="_blank">
          External Link
        </SafeLink>
      )

      const link = screen.getByRole('link', { name: 'External Link' })
      expect(link).toHaveAttribute('href', 'https://example.com')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should render as span for dangerous URLs', () => {
      render(
        <SafeLink href="javascript:alert('xss')">
          Dangerous Link
        </SafeLink>
      )

      const span = screen.getByText('Dangerous Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should render as span for null href', () => {
      render(
        <SafeLink href={null}>
          Null Link
        </SafeLink>
      )

      const span = screen.getByText('Null Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should render as span for undefined href', () => {
      render(
        <SafeLink href={undefined}>
          Undefined Link
        </SafeLink>
      )

      const span = screen.getByText('Undefined Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should render as span for empty href', () => {
      render(
        <SafeLink href="">
          Empty Link
        </SafeLink>
      )

      const span = screen.getByText('Empty Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should render as span for non-string href', () => {
      render(
        <SafeLink href={123 as any}>
          Number Link
        </SafeLink>
      )

      const span = screen.getByText('Number Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should apply custom className to safe links', () => {
      render(
        <SafeLink href="https://example.com" className="external-link">
          Safe Link
        </SafeLink>
      )

      const link = screen.getByRole('link', { name: 'Safe Link' })
      expect(link).toHaveClass('external-link')
    })

    it('should apply custom className to unsafe links (rendered as spans)', () => {
      render(
        <SafeLink href="javascript:alert('xss')" className="dangerous-link">
          Unsafe Link
        </SafeLink>
      )

      const span = screen.getByText('Unsafe Link')
      expect(span).toHaveClass('dangerous-link')
    })

    it('should handle FTP URLs as unsafe', () => {
      render(
        <SafeLink href="ftp://example.com">
          FTP Link
        </SafeLink>
      )

      const span = screen.getByText('FTP Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })

    it('should handle malformed URLs as unsafe', () => {
      render(
        <SafeLink href="https:// example.com">
          Malformed Link
        </SafeLink>
      )

      const span = screen.getByText('Malformed Link')
      expect(span.tagName).toBe('SPAN')
      expect(span).not.toHaveAttribute('href')
    })
  })
})
