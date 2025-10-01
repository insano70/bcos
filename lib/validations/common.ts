import { z } from 'zod';

// Common validation schemas used across the application

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Pagination schema
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10) || 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(100, Math.max(1, parseInt(val || '10', 10) || 10))),
});

// Sorting schema
export const sortSchema = z.object({
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Search schema with enhanced sanitization
export const searchSchema = z.object({
  search: z
    .string()
    .max(255, 'Search term must not exceed 255 characters')
    .transform(
      (term) =>
        term
          .trim()
          .replace(/[<>"']/g, '') // Remove dangerous characters
          .replace(/[%_\\]/g, '') // Remove SQL wildcards for safety
    )
    .optional(),
});

// File upload schema
export const fileUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().regex(/^image\/(jpeg|jpg|png|gif|webp)$/, 'Only image files are allowed'),
  size: z.number().max(5 * 1024 * 1024, 'File size must not exceed 5MB'),
});

// Color validation
export const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format');

// Domain validation
export const domainSchema = z
  .string()
  .min(1, 'Domain is required')
  .max(255, 'Domain must not exceed 255 characters')
  .regex(/^[a-zA-Z0-9.-]+$/, 'Domain must contain only letters, numbers, dots, and hyphens')
  .transform((val) => val.toLowerCase());

// Email validation with proper transformation order
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(255, 'Email must not exceed 255 characters');

// Phone validation - requires minimum 7 digits for real phone numbers
export const phoneSchema = z
  .string()
  .regex(/^[+]?[1-9][\d]{6,15}$/, 'Invalid phone number format')
  .max(20, 'Phone number must not exceed 20 characters');

// URL validation - only allow HTTP/HTTPS for security
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .max(500, 'URL must not exceed 500 characters')
  .refine((url) => {
    // Only allow HTTP/HTTPS protocols for security
    return url.startsWith('http://') || url.startsWith('https://');
  }, 'Only HTTP and HTTPS URLs are allowed');
