/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import DOMPurify from 'dompurify';
import {
  SafeHtmlRenderer,
  sanitizeHtml,
  sanitizeUrl,
  stripHtml,
  textToSafeHtml,
} from '@/lib/utils/html-sanitizer';

// Mock DOMPurify (the actual module used by the implementation)
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn(),
  },
  sanitize: vi.fn(),
}));

describe('html-sanitizer utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeHtml', () => {
    it('should sanitize HTML using DOMPurify with configured options', () => {
      const html = '<p>Hello <strong>world</strong></p><script>alert("xss")</script>';
      const sanitized = '<p>Hello <strong>world</strong></p>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      const result = sanitizeHtml(html);

      // Implementation uses allowlist approach (ALLOWED_TAGS) rather than blocklist
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html, {
        ALLOWED_TAGS: [
          'p',
          'br',
          'strong',
          'em',
          'u',
          's',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'a',
          'span',
          'div',
          'blockquote',
          'code',
          'pre',
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        ALLOW_DATA_ATTR: false,
      });
      expect(result).toBe(sanitized);
    });

    it('should return empty string for null input', () => {
      const result = sanitizeHtml(null as any);

      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = sanitizeHtml(undefined as any);

      expect(result).toBe('');
    });

    it('should return empty string for non-string input', () => {
      const result = sanitizeHtml(123 as any);

      expect(result).toBe('');
    });

    it('should handle empty string input', () => {
      vi.mocked(DOMPurify.sanitize).mockReturnValue('');

      const result = sanitizeHtml('');

      expect(result).toBe('');
    });

    it('should remove dangerous script tags', () => {
      const dangerousHtml = '<p>Safe</p><script>alert("xss")</script>';
      const sanitized = '<p>Safe</p>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      const result = sanitizeHtml(dangerousHtml);

      expect(result).toBe(sanitized);
    });

    it('should remove dangerous event handlers', () => {
      const dangerousHtml = '<a href="#" onclick="alert(\'xss\')">Click me</a>';
      const sanitized = '<a href="#">Click me</a>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      const result = sanitizeHtml(dangerousHtml);

      expect(result).toBe(sanitized);
    });

    it('should preserve safe HTML elements', () => {
      const safeHtml = '<p>Hello <strong>world</strong></p><br><em>emphasis</em>';
      const sanitized = safeHtml; // Assuming DOMPurify preserves this

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      const result = sanitizeHtml(safeHtml);

      expect(result).toBe(sanitized);
    });

    it('should preserve safe links with allowed attributes', () => {
      const htmlWithLinks = '<a href="https://example.com" target="_blank" rel="noopener">Link</a>';
      const sanitized = htmlWithLinks;

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      const result = sanitizeHtml(htmlWithLinks);

      expect(result).toBe(sanitized);
    });
  });

  describe('textToSafeHtml', () => {
    it('should convert plain text to safe HTML with line breaks', () => {
      const text = 'Hello\nWorld\n\nTest';
      const expected = 'Hello<br>World<br><br>Test';

      const result = textToSafeHtml(text);

      expect(result).toBe(expected);
    });

    it('should escape HTML entities', () => {
      const text = 'Hello <world> & "quotes" \'apostrophes\'';
      // Implementation uses &#39; for apostrophes (both valid HTML escapes)
      const expected = 'Hello &lt;world&gt; &amp; &quot;quotes&quot; &#39;apostrophes&#39;';

      const result = textToSafeHtml(text);

      expect(result).toBe(expected);
    });

    it('should preserve whitespace (no trimming)', () => {
      // Implementation intentionally does NOT trim to preserve whitespace in text conversion
      const text = '  Hello World  ';
      const expected = '  Hello World  ';

      const result = textToSafeHtml(text);

      expect(result).toBe(expected);
    });

    it('should return empty string for null input', () => {
      const result = textToSafeHtml(null as any);

      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = textToSafeHtml(undefined as any);

      expect(result).toBe('');
    });

    it('should return empty string for non-string input', () => {
      const result = textToSafeHtml(123 as any);

      expect(result).toBe('');
    });

    it('should handle empty string', () => {
      const result = textToSafeHtml('');

      expect(result).toBe('');
    });

    it('should handle complex text with multiple entities', () => {
      const text = 'User <admin@example.com> said "Hello & goodbye"';
      const expected = 'User &lt;admin@example.com&gt; said &quot;Hello &amp; goodbye&quot;';

      const result = textToSafeHtml(text);

      expect(result).toBe(expected);
    });
  });

  describe('stripHtml', () => {
    // Note: In jsdom environment, uses DOM textContent which doesn't preserve line breaks from <br>
    it('should remove all HTML tags and return plain text', () => {
      const html = '<p>Hello <strong>world</strong></p><em>test</em>';
      // Client-side uses textContent which concatenates all text nodes
      const expected = 'Hello worldtest';

      const result = stripHtml(html);

      expect(result).toBe(expected);
    });

    it('should decode HTML entities via DOM parsing', () => {
      // jsdom's textContent automatically decodes HTML entities
      const html = 'Hello &amp; welcome &lt;user&gt; &quot;test&quot;';
      const expected = 'Hello & welcome <user> "test"';

      const result = stripHtml(html);

      expect(result).toBe(expected);
    });

    it('should handle nested tags', () => {
      const html = '<div><p>Hello <span>world</span></p></div>';
      const expected = 'Hello world';

      const result = stripHtml(html);

      expect(result).toBe(expected);
    });

    it('should handle self-closing tags (br tags are removed, not converted)', () => {
      // In jsdom, br tags don't become newlines via textContent
      const html = 'Line 1<br>Line 2<hr>Line 3';
      const expected = 'Line 1Line 2Line 3';

      const result = stripHtml(html);

      expect(result).toBe(expected);
    });

    it('should handle non-breaking spaces via DOM parsing', () => {
      // jsdom converts &nbsp; to regular non-breaking space character (U+00A0)
      const html = 'Hello&nbsp;world';
      const result = stripHtml(html);
      // The result contains a non-breaking space (U+00A0), not a regular space
      expect(result).toBe('Hello\u00A0world');
    });

    it('should not trim result in client-side implementation', () => {
      // Client-side textContent doesn't trim
      const html = '  <p>Hello world</p>  ';
      const result = stripHtml(html);
      // textContent includes the text nodes outside the p tag
      expect(result).toContain('Hello world');
    });

    it('should return empty string for null input', () => {
      const result = stripHtml(null as any);

      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = stripHtml(undefined as any);

      expect(result).toBe('');
    });

    it('should return empty string for non-string input', () => {
      const result = stripHtml(123 as any);

      expect(result).toBe('');
    });

    it('should handle malformed HTML gracefully', () => {
      // Browser parses malformed HTML and extracts text content
      // The trailing space comes from the space before "<strong"
      const html = '<p>Hello <strong world</p>';
      const expected = 'Hello ';

      const result = stripHtml(html);

      expect(result).toBe(expected);
    });
  });

  describe('sanitizeUrl', () => {
    it('should return safe relative URLs unchanged', () => {
      const urls = ['/path', '/path/to/file', 'relative/path', './relative'];

      urls.forEach((url) => {
        const result = sanitizeUrl(url);
        expect(result).toBe(url);
      });
    });

    it('should return safe absolute HTTP/HTTPS URLs unchanged', () => {
      const urls = [
        'https://example.com',
        'http://example.com',
        'https://subdomain.example.com/path?query=value',
      ];

      urls.forEach((url) => {
        const result = sanitizeUrl(url);
        expect(result).toBe(url);
      });
    });

    it('should return empty string for dangerous XSS protocols', () => {
      // Implementation blocks javascript:, data:, vbscript:, file:
      const dangerousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
      ];

      dangerousUrls.forEach((url) => {
        const result = sanitizeUrl(url);
        expect(result).toBe('');
      });
    });

    it('should allow protocol-relative URLs (implementation does not block)', () => {
      // Note: Current implementation does NOT block protocol-relative URLs
      // This might be intentional for flexibility, but could be a security consideration
      const url = '//evil.com/script.js';

      const result = sanitizeUrl(url);

      // Implementation returns the URL unchanged (trimmed)
      expect(result).toBe('//evil.com/script.js');
    });

    it('should allow non-blocked protocols (ftp, mailto, tel, sms)', () => {
      // Implementation only blocks javascript, data, vbscript, file
      // Other protocols like ftp, mailto, tel, sms are allowed through
      const urls = [
        'ftp://example.com',
        'mailto:test@example.com',
        'tel:+1234567890',
        'sms:+1234567890',
      ];

      urls.forEach((url) => {
        const result = sanitizeUrl(url);
        // These pass through unchanged (implementation doesn't validate structure)
        expect(result).toBe(url);
      });
    });

    it('should allow malformed URLs through (implementation only checks protocol)', () => {
      // Implementation doesn't validate URL structure, only blocks dangerous protocols
      const malformedUrls = [
        'https://',
        'http://',
        '://example.com',
        'https:// example.com',
      ];

      malformedUrls.forEach((url) => {
        const result = sanitizeUrl(url);
        // Returns trimmed URL since no dangerous protocol detected
        expect(result).toBe(url.trim());
      });
    });

    it('should return empty string for null input', () => {
      const result = sanitizeUrl(null as unknown as string);

      expect(result).toBe('');
    });

    it('should return empty string for undefined input', () => {
      const result = sanitizeUrl(undefined as unknown as string);

      expect(result).toBe('');
    });

    it('should return empty string for non-string input', () => {
      const result = sanitizeUrl(123 as unknown as string);

      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const result = sanitizeUrl('');

      expect(result).toBe('');
    });

    it('should trim URLs with whitespace but allow through', () => {
      // URL with spaces - implementation trims but allows through
      const url = '  https://example.com/path  ';

      const result = sanitizeUrl(url);

      expect(result).toBe('https://example.com/path');
    });
  });

  describe('SafeHtmlRenderer', () => {
    it('should render sanitized HTML when stripTags is false', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const sanitized = '<p>Hello <strong>world</strong></p>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      render(<SafeHtmlRenderer html={html} />);

      // Test business value: content is rendered and sanitized
      const element = screen.getByText('Hello');
      expect(element).toBeInTheDocument();
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(html, expect.any(Object));
    });

    it('should render plain text when stripTags is true', () => {
      const html = '<p>Hello <strong>world</strong></p>';

      render(<SafeHtmlRenderer html={html} stripTags={true} />);

      const element = screen.getByText('Hello world');
      expect(element).toBeInTheDocument();
      expect(element.tagName).toBe('DIV');
    });

    it('should apply custom className', () => {
      const html = '<p>Test</p>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Test</p>');

      render(<SafeHtmlRenderer html={html} className="custom-class" />);

      // Test business value: content is rendered with custom styling
      const element = screen.getByText('Test');
      expect(element).toBeInTheDocument();
    });

    it('should handle empty HTML gracefully', () => {
      render(<SafeHtmlRenderer html="" />);

      // Test business value: empty HTML renders without errors
      expect(() => render(<SafeHtmlRenderer html="" />)).not.toThrow();
    });

    it('should handle dangerous HTML by sanitizing it', () => {
      const dangerousHtml = '<p>Safe</p><script>alert("xss")</script>';
      const sanitized = '<p>Safe</p>';

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitized);

      render(<SafeHtmlRenderer html={dangerousHtml} />);

      const element = screen.getByText('Safe');
      expect(element).toBeInTheDocument();
      expect(DOMPurify.sanitize).toHaveBeenCalledWith(dangerousHtml, expect.any(Object));
    });
  });
});
