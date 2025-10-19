/**
 * Email Security Utilities
 * Provides sanitization and validation functions to prevent injection attacks
 */

import { log } from '@/lib/logger';

/**
 * Escapes HTML special characters to prevent XSS attacks
 * CRITICAL: Must be used for ALL user-generated content in email templates
 *
 * @param unsafe - Raw user input that may contain malicious HTML/JavaScript
 * @returns Safely escaped string suitable for HTML output
 *
 * @example
 * ```typescript
 * const userName = "<script>alert('XSS')</script>";
 * const safe = escapeHtml(userName);
 * // Returns: "&lt;script&gt;alert('XSS')&lt;/script&gt;"
 * ```
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';

  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;'); // Forward slash for extra safety
}

/**
 * Sanitizes email header values to prevent header injection attacks
 * Removes CR/LF characters that could inject additional headers
 *
 * @param value - Header value (subject, from name, etc.)
 * @returns Sanitized header value safe for email transport
 *
 * @example
 * ```typescript
 * const malicious = "Subject\r\nBcc: attacker@evil.com";
 * const safe = sanitizeEmailHeader(malicious);
 * // Returns: "SubjectBcc: attacker@evil.com" (newlines removed)
 * ```
 */
export function sanitizeEmailHeader(value: string): string {
  if (!value) return '';

  // Remove any CR/LF characters that could inject headers
  return String(value)
    .replace(/[\r\n]/g, '')
    .trim();
}

/**
 * Validates and sanitizes email addresses
 * Basic validation to prevent malformed addresses and header injection
 *
 * @param email - Email address to validate
 * @returns Validated email or empty string if invalid
 */
export function validateEmail(email: string): string {
  if (!email) return '';

  const trimmed = email.trim();

  // Basic email regex - intentionally simple for security
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Check for header injection attempts
  if (/[\r\n]/.test(trimmed)) {
    log.warn('Email validation failed - header injection attempt', {
      operation: 'validateEmail',
      reason: 'Contains CR/LF characters',
    });
    return '';
  }

  // Validate format
  if (!emailRegex.test(trimmed)) {
    log.warn('Email validation failed - invalid format', {
      operation: 'validateEmail',
      email: trimmed.substring(0, 20), // Only log prefix for privacy
    });
    return '';
  }

  return trimmed;
}

/**
 * Validates and parses comma-separated email list
 * Used for admin notification emails and batch sending
 *
 * @param emailList - Comma-separated email addresses
 * @returns Array of validated email addresses
 */
export function parseEmailList(emailList: string): string[] {
  if (!emailList) return [];

  return emailList
    .split(',')
    .map((email) => validateEmail(email))
    .filter((email) => email.length > 0);
}

/**
 * Truncates text to prevent extremely long inputs
 * Protects against resource exhaustion and email client issues
 *
 * @param text - Input text to truncate
 * @param maxLength - Maximum allowed length (default: 5000)
 * @returns Truncated text with indicator if shortened
 */
export function truncateText(text: string | null | undefined, maxLength: number = 5000): string {
  if (!text) return '';

  const str = String(text);

  if (str.length <= maxLength) {
    return str;
  }

  log.warn('Text truncated in email template', {
    operation: 'truncateText',
    originalLength: str.length,
    truncatedTo: maxLength,
  });

  return `${str.substring(0, maxLength)}\n\n[Content truncated for length]`;
}

/**
 * Validates URL to prevent open redirect and phishing attacks
 * Ensures URL is properly formatted and uses allowed protocols
 *
 * @param url - URL to validate
 * @param allowedProtocols - Allowed URL protocols (default: http, https)
 * @returns Validated URL
 * @throws {Error} If URL is invalid or uses disallowed protocol
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['http', 'https']): string {
  if (!url) {
    throw new Error('URL cannot be empty');
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    const protocol = parsed.protocol.replace(':', '');
    if (!allowedProtocols.includes(protocol)) {
      throw new Error(`Protocol ${protocol} not allowed`);
    }

    return url;
  } catch (error) {
    log.error('URL validation failed', error, {
      operation: 'validateUrl',
      urlPrefix: url.substring(0, 30),
    });
    throw new Error('Invalid URL format');
  }
}

/**
 * Gets validated base URL from environment
 * Throws error if APP_URL is not configured or invalid
 *
 * @returns Validated base URL for the application
 * @throws {Error} If APP_URL is not configured or invalid
 */
export function getValidatedBaseUrl(): string {
  const url = process.env.APP_URL;

  if (!url) {
    throw new Error('APP_URL environment variable not configured');
  }

  return validateUrl(url);
}

/**
 * Sanitizes sensitive data from objects before logging or emailing
 * Redacts fields that may contain passwords, tokens, or secrets
 *
 * @param data - Object that may contain sensitive data
 * @returns Sanitized object with sensitive fields redacted
 */
export function sanitizeSensitiveData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...data };

  // List of field names that should be redacted
  const sensitiveKeys = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'key',
    'apikey',
    'api_key',
    'credential',
    'auth',
    'authorization',
    'cookie',
    'session',
    'jwt',
    'bearer',
  ];

  // Recursively sanitize object
  for (const [key, value] of Object.entries(sanitized)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive terms
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeSensitiveData(value as Record<string, unknown>);
    }
  }

  return sanitized;
}

/**
 * Safely converts newlines to HTML line breaks
 * Escapes HTML first, then converts newlines to prevent XSS
 *
 * @param text - Text with newlines
 * @returns HTML-safe text with <br> tags
 */
export function nl2br(text: string | null | undefined): string {
  if (!text) return '';

  // First escape HTML, then convert newlines
  return escapeHtml(text).replace(/\n/g, '<br>');
}
