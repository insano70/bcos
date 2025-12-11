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

/**
 * Convert markdown text to plain text (strips all formatting)
 * Useful for previews and search indexing
 *
 * @param markdown - Raw markdown text
 * @returns Plain text string
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  // First render to HTML, then strip tags
  const html = marked.parse(markdown, { async: false }) as string;

  // Remove HTML tags and decode entities
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

/**
 * Get approximate character count from markdown
 * (excludes markdown syntax)
 *
 * @param markdown - Raw markdown text
 * @returns Character count
 */
export function getMarkdownLength(markdown: string): number {
  return markdownToPlainText(markdown).length;
}
