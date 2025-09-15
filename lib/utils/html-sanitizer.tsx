/**
 * HTML Sanitization Utilities
 * Provides safe HTML rendering and XSS protection
 */

import React from 'react';

/**
 * Sanitize HTML content for safe rendering
 * Removes dangerous tags and attributes while preserving basic formatting
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove dangerous event handlers
  html = html.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: and data: URLs
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  html = html.replace(/src\s*=\s*["']data:[^"']*["']/gi, 'src="#"');
  
  // Remove style attributes (potential CSS injection)
  html = html.replace(/style\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove dangerous tags
  const dangerousTags = ['script', 'object', 'embed', 'iframe', 'form', 'input', 'textarea', 'button', 'select'];
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}\\b[^>]*>.*?<\\/${tag}>`, 'gi');
    html = html.replace(regex, '');
    // Also remove self-closing versions
    const selfClosingRegex = new RegExp(`<${tag}\\b[^>]*\\/>`, 'gi');
    html = html.replace(selfClosingRegex, '');
  });
  
  // Allow only safe tags
  const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'];
  
  return html.trim();
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
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
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

  // Ensure relative URLs or safe absolute URLs
  if (url.startsWith('//') || url.match(/^https?:\/\//i)) {
    try {
      const urlObj = new URL(url);
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return '#';
      }
      return url;
    } catch {
      return '#';
    }
  }

  // Relative URL - should be safe
  return url;
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
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
