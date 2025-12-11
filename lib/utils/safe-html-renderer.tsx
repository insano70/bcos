'use client';

import { sanitizeHtml, stripHtml } from './html-sanitizer';

/**
 * Safe HTML Renderer Component
 * Renders sanitized HTML content safely in React
 */
export interface SafeHtmlRendererProps {
  html: string;
  className?: string;
  stripTags?: boolean;
  /**
   * Set to true if the HTML has already been sanitized (e.g., from renderMarkdown).
   * Skips redundant sanitization for better performance.
   */
  preSanitized?: boolean;
}

export function SafeHtmlRenderer({
  html,
  className,
  stripTags = false,
  preSanitized = false,
}: SafeHtmlRendererProps) {
  if (stripTags) {
    const plainText = stripHtml(html);
    return <div className={className}>{plainText}</div>;
  }

  // Skip sanitization if caller confirms the HTML is already sanitized
  const sanitized = preSanitized ? html : sanitizeHtml(html);

  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized via DOMPurify before rendering
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
