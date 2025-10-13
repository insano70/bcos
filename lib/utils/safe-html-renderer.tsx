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
}

export function SafeHtmlRenderer({ html, className, stripTags = false }: SafeHtmlRendererProps) {
  if (stripTags) {
    const plainText = stripHtml(html);
    return <div className={className}>{plainText}</div>;
  }

  const sanitized = sanitizeHtml(html);

  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized via DOMPurify before rendering
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
