import { z } from 'zod';

/**
 * Enhanced Input Sanitization for Zod Schemas
 * Provides XSS protection and data normalization
 */

/**
 * Sanitize HTML and dangerous characters from text input
 * SECURITY: Removes HTML tags and dangerous characters for safe text storage
 * NOTE: Produces clean, readable text suitable for database storage and display
 */
export function sanitizeText(input: string): string {
  return (
    input
      .trim()
      // Remove dangerous script content entirely (including content inside script tags)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove other HTML tags to extract text content
      .replace(/<[^>]*>/g, '')
      // Remove dangerous protocol handlers
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      // Remove SQL injection patterns and comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments first
      .replace(/--.*$/gm, '') // Remove line comments
      .replace(
        /[';]\s*(drop|delete|update|insert|create|alter|truncate|exec|execute|union|select)\b.*$/gi,
        ''
      ) // Remove SQL injection after ; or '
      .replace(
        /\b(drop|delete|update|insert|create|alter|truncate|exec|execute|union|select)\s+table\b/gi,
        ''
      ) // Remove dangerous SQL keywords
      // Handle dangerous characters appropriately
      .replace(/[<>]/g, '') // Remove < > (dangerous for HTML)
      .replace(/&/g, '&amp;') // Escape & (preserve but make HTML-safe)
      // Clean up extra whitespace left by character removal
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Enhanced text schema with XSS protection
 */
export function createSafeTextSchema(
  minLength: number = 1,
  maxLength: number = 255,
  fieldName: string = 'field'
) {
  return z
    .string()
    .min(minLength, `${fieldName} must be at least ${minLength} characters`)
    .max(maxLength, `${fieldName} must not exceed ${maxLength} characters`)
    .transform(sanitizeText);
}

/**
 * Enhanced email schema with normalization and XSS protection
 */
export const safeEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(255, 'Email must not exceed 255 characters')
  .transform((email) => {
    // Additional email sanitization - remove dangerous characters
    return email.replace(/[<>'"&]/g, '');
  });

/**
 * Enhanced name schema for user names
 */
export function createNameSchema(fieldName: string = 'name') {
  return z
    .string()
    .min(1, `${fieldName} is required`)
    .max(100, `${fieldName} must not exceed 100 characters`)
    .transform(sanitizeText)
    .refine((name) => /^[a-zA-Z\s'-]+$/.test(name), {
      message: `${fieldName} must contain only letters, spaces, hyphens, and apostrophes`,
    });
}

/**
 * Enhanced domain schema with strict validation
 */
export const safeDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Domain is required')
  .max(255, 'Domain must not exceed 255 characters')
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
    'Invalid domain format'
  );

/**
 * Enhanced URL schema with security checks
 */
export const safeUrlSchema = z
  .string()
  .url('Invalid URL format')
  .max(500, 'URL must not exceed 500 characters')
  .refine((url) => {
    // Only allow HTTP/HTTPS protocols
    return url.startsWith('http://') || url.startsWith('https://');
  }, 'Only HTTP and HTTPS URLs are allowed');

/**
 * Safe JSON string validation
 */
export function createJsonSchema<T>(innerSchema: z.ZodSchema<T>) {
  return z.string().transform((str, ctx) => {
    try {
      const parsed = JSON.parse(str);
      const result = innerSchema.safeParse(parsed);

      if (!result.success) {
        result.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid JSON structure: ${issue.message}`,
            path: issue.path,
          });
        });
        return z.NEVER;
      }

      return result.data;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON format',
      });
      return z.NEVER;
    }
  });
}
