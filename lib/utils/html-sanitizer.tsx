/**
 * HTML Sanitization Utilities
 * Provides safe HTML rendering and XSS protection using DOMPurify
 */

import React from 'react';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content for safe rendering
 * Uses DOMPurify to remove dangerous tags and attributes while preserving safe HTML
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Configure DOMPurify with safe defaults for email content
  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
      'a', 'span', 'div' // Additional safe tags for formatted content
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'], // Only allow safe attributes
    ALLOW_DATA_ATTR: false, // Disable data attributes
    FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input', 'textarea', 'button', 'select'],
    FORBID_ATTR: ['onclick', 'onload', 'onerror', 'style'] // Forbid event handlers and styles
  };

  return DOMPurify.sanitize(html, config);
}

/**
 * Convert plain text to safe HTML with basic formatting
 * Preserves line breaks and basic structure
 */
export function textToSafeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\n/g, '<br>')
    .trim();
}

/**
 * Strip all HTML tags and return plain text
 */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return html
    .replace(/<br\s*\/?>/gi, '\n')  // Convert <br> tags to newlines
    .replace(/<\/p>/gi, '\n')       // Convert closing </p> tags to newlines
    .replace(/<[^>]*>/g, '')        // Remove all other HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n\s*\n/g, '\n')      // Clean up multiple newlines
    .trim();
}

/**
 * Validate and sanitize URLs for safe usage
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '#';
  }

  // Remove dangerous protocols
  if (url.match(/^(javascript|data|vbscript|file):/i)) {
    return '#';
  }

  // Check if URL has a protocol
  if (url.includes(':')) {
    try {
      const urlObj = new URL(url);
      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return '#';
      }
      return url;
    } catch {
      return '#';
    }
  }

  // Allow relative URLs (no protocol)
  if (url.startsWith('/') || url.startsWith('#')) {
    return url;
  }

  // For other relative URLs without protocol, allow them
  if (!url.includes('://')) {
    return url;
  }

  // Reject everything else
  return '#';
}

/**
 * Safe React component for rendering user HTML content
 */
interface SafeHtmlProps {
  html: string;
  className?: string;
  allowedTags?: string[];
  stripTags?: boolean;
}

export function SafeHtmlRenderer({ html, className, stripTags = false }: SafeHtmlProps) {
  if (stripTags) {
    return <div className={className}>{stripHtml(html)}</div>;
  }

  const safeHtml = sanitizeHtml(html);
  
  return (
    <div
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized with DOMPurify
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
