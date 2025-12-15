import { marked } from 'marked';

import { sanitizeHtml } from './html-sanitizer';

/**
 * Markdown Renderer Utility
 * Converts markdown to sanitized HTML safe for rendering
 * Uses marked for parsing and DOMPurify for XSS protection
 */

// Configure marked options for security and consistency
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Convert markdown text to sanitized HTML
 * Safe for use with dangerouslySetInnerHTML or SafeHtmlRenderer
 *
 * @param markdown - Raw markdown text
 * @returns Sanitized HTML string
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  // Parse markdown to HTML
  const html = marked.parse(markdown, { async: false }) as string;

  // Sanitize to prevent XSS
  return sanitizeHtml(html);
}
