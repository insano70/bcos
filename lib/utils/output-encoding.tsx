/**
 * Output Encoding Utilities
 * Provides context-aware encoding for safe content display
 */

import type React from 'react';

/**
 * HTML attribute encoding
 * Use when inserting user data into HTML attributes
 */
export function encodeHtmlAttribute(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * HTML content encoding
 * Use when inserting user data into HTML content
 */
export function encodeHtmlContent(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * JavaScript string encoding
 * Use when inserting user data into JavaScript strings
 */
export function encodeJavaScript(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\//g, '\\/');
}

/**
 * URL parameter encoding
 * Use when inserting user data into URLs
 */
export function encodeUrlParameter(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return encodeURIComponent(value);
}

/**
 * CSS value encoding
 * Use when inserting user data into CSS
 */
export function encodeCssValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[<>"']/g, '')
    .replace(/javascript:/gi, '')
    .replace(/expression\s*\(/gi, '');
}

/**
 * Safe content renderer with automatic encoding
 */
interface SafeContentProps {
  content: string | null | undefined;
  type: 'text' | 'email' | 'phone' | 'url' | 'name';
  className?: string;
  maxLength?: number;
}

export function SafeContent({ content, type, className, maxLength }: SafeContentProps) {
  if (!content) {
    return <span className={className}>-</span>;
  }

  let safeContent: string;

  switch (type) {
    case 'email':
      safeContent = encodeHtmlContent(content.toLowerCase().trim());
      break;
    case 'phone':
      safeContent = content.replace(/[^0-9\s\-()+.]/g, '');
      break;
    case 'url':
      safeContent = encodeHtmlAttribute(content);
      break;
    case 'name':
      safeContent = encodeHtmlContent(content.trim());
      break;
    default:
      safeContent = encodeHtmlContent(content);
  }

  if (maxLength && safeContent.length > maxLength) {
    safeContent = `${safeContent.slice(0, maxLength)}...`;
  }

  return <span className={className}>{safeContent}</span>;
}

/**
 * Safe link component with URL validation
 */
interface SafeLinkProps {
  href: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  target?: string;
}

export function SafeLink({ href, children, className, target }: SafeLinkProps) {
  if (!href || typeof href !== 'string') {
    return <span className={className}>{children}</span>;
  }

  // Validate URL safety
  const safeHref = sanitizeDisplayUrl(href);
  if (!safeHref || safeHref === '#') {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={safeHref}
      className={className}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

function sanitizeDisplayUrl(url: string): string {
  try {
    // Only allow HTTP/HTTPS URLs
    if (!url.match(/^https?:\/\//)) {
      return '#';
    }

    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return '#';
    }

    return url;
  } catch {
    return '#';
  }
}
