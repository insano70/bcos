import { z } from 'zod';

/**
 * Enhanced Input Sanitization for Zod Schemas
 * Provides XSS protection and data normalization
 */

/**
 * Sanitize HTML and dangerous characters from text input
 */
export function sanitizeText(input: string): string {
  return input
    .trim()
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove potentially dangerous characters
    .replace(/[<>'"&]/g, (char) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[char] || char;
    });
}

/**
 * Enhanced text schema with XSS protection
 */
export function createSafeTextSchema(
  minLength: number = 1,
  maxLength: number = 255,
  fieldName: string = 'field'
) {
  return z.string()
    .min(minLength, `${fieldName} must be at least ${minLength} characters`)
    .max(maxLength, `${fieldName} must not exceed ${maxLength} characters`)
    .transform(sanitizeText);
}

/**
 * Enhanced email schema with normalization
 */
export const safeEmailSchema = z.string()
  .email('Invalid email address')
  .max(255, 'Email must not exceed 255 characters')
  .toLowerCase()
  .trim()
  .transform(email => {
    // Additional email sanitization
    return email.replace(/[<>'"&]/g, '');
  });

/**
 * Enhanced name schema for user names
 */
export function createNameSchema(fieldName: string = 'name') {
  return z.string()
    .min(1, `${fieldName} is required`)
    .max(100, `${fieldName} must not exceed 100 characters`)
    .regex(/^[a-zA-Z\s'-]+$/, `${fieldName} must contain only letters, spaces, hyphens, and apostrophes`)
    .transform(sanitizeText);
}

/**
 * Enhanced domain schema with strict validation
 */
export const safeDomainSchema = z.string()
  .min(1, 'Domain is required')
  .max(255, 'Domain must not exceed 255 characters')
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, 'Invalid domain format')
  .transform(val => val.toLowerCase().trim());

/**
 * Enhanced URL schema with security checks
 */
export const safeUrlSchema = z.string()
  .url('Invalid URL format')
  .max(500, 'URL must not exceed 500 characters')
  .refine(url => {
    // Only allow HTTP/HTTPS protocols
    return url.startsWith('http://') || url.startsWith('https://');
  }, 'Only HTTP and HTTPS URLs are allowed');

/**
 * Safe JSON string validation
 */
export function createJsonSchema<T>(innerSchema: z.ZodSchema<T>) {
  return z.string()
    .transform((str, ctx) => {
      try {
        const parsed = JSON.parse(str);
        const result = innerSchema.safeParse(parsed);
        
        if (!result.success) {
          result.error.issues.forEach(issue => {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid JSON structure: ${issue.message}`,
              path: issue.path
            });
          });
          return z.NEVER;
        }
        
        return result.data;
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JSON format'
        });
        return z.NEVER;
      }
    });
}
