import DOMPurify from 'dompurify';

/**
 * HTML Sanitization Utility
 * Provides XSS protection for rich text content
 */

/**
 * Sanitize HTML content
 * Removes potentially dangerous HTML tags and attributes while preserving safe formatting
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: use JSDOM
    const { JSDOM } = require('jsdom');
    const domWindow = new JSDOM('').window;
    const purify = DOMPurify(domWindow);

    return purify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'a', 'span', 'div', 'blockquote', 'code', 'pre'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
      ALLOW_DATA_ATTR: false,
    });
  }

  // Client-side: use browser DOMPurify
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'span', 'div', 'blockquote', 'code', 'pre'
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Strip all HTML tags from content
 * Returns plain text only
 */
export function stripHtml(html: string): string {
  if (typeof window === 'undefined') {
    // Server-side: simple regex approach
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Client-side: use browser's text content extraction
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * Validate that HTML content is safe
 * Returns true if content passes sanitization without modification
 */
export function isHtmlSafe(html: string): boolean {
  const sanitized = sanitizeHtml(html);
  return sanitized === html;
}

/**
 * Get HTML content length (text only, excluding tags)
 */
export function getHtmlTextLength(html: string): number {
  return stripHtml(html).length;
}
