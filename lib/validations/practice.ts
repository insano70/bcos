import { z } from 'zod';

// Practice validation schemas
export const practiceCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Practice name is required')
    .max(255, 'Practice name must not exceed 255 characters')
    .trim(),
  domain: z
    .string()
    .min(1, 'Domain is required')
    .max(255, 'Domain must not exceed 255 characters')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Domain must contain only letters, numbers, dots, and hyphens')
    .transform((val) => val.toLowerCase()),
  template_id: z.string().uuid('Invalid template ID'),
  owner_user_id: z.string().uuid('Invalid user ID').optional(),
});

export const practiceUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Practice name is required')
    .max(255, 'Practice name must not exceed 255 characters')
    .trim()
    .optional(),
  domain: z
    .string()
    .min(1, 'Domain is required')
    .max(255, 'Domain must not exceed 255 characters')
    .regex(/^[a-zA-Z0-9.-]+$/, 'Domain must contain only letters, numbers, dots, and hyphens')
    .transform((val) => val.toLowerCase())
    .optional(),
  template_id: z.string().uuid('Invalid template ID').optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
});

export const practiceQuerySchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  template_id: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
});

// Practice attributes validation schemas
export const practiceAttributesUpdateSchema = z.object({
  // Contact Information
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email address').max(255).optional(),
  address_line1: z.string().max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip_code: z.string().max(20).optional(),

  // Business Details
  business_hours: z
    .record(
      z.string(),
      z.object({
        open: z.string().optional(),
        close: z.string().optional(),
        closed: z.boolean(),
      })
    )
    .optional(),
  services: z.array(z.string().max(255)).optional(),
  insurance_accepted: z.array(z.string().max(255)).optional(),
  conditions_treated: z.array(z.string().max(255)).optional(),

  // Content
  about_text: z.string().max(5000).optional(),
  mission_statement: z.string().max(1000).optional(),
  welcome_message: z.string().max(500).optional(),

  // Media
  logo_url: z
    .string()
    .max(500, 'Logo URL must not exceed 500 characters')
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true; // Allow empty/undefined
        // Allow relative URLs (starting with /) or absolute URLs
        return val.startsWith('/') || z.string().url().safeParse(val).success;
      },
      {
        message: 'Invalid logo URL',
      }
    ),
  hero_image_url: z
    .string()
    .max(500, 'Hero image URL must not exceed 500 characters')
    .optional()
    .refine(
      (val) => {
        if (!val || val === '') return true; // Allow empty/undefined
        // Allow relative URLs (starting with /) or absolute URLs
        return val.startsWith('/') || z.string().url().safeParse(val).success;
      },
      {
        message: 'Invalid hero image URL',
      }
    ),
  gallery_images: z
    .array(
      z.string().refine(
        (val) => {
          if (!val || val === '') return true; // Allow empty/undefined
          // Allow relative URLs (starting with /) or absolute URLs
          return val.startsWith('/') || z.string().url().safeParse(val).success;
        },
        {
          message: 'Invalid gallery image URL',
        }
      )
    )
    .optional(),

  // SEO
  meta_title: z.string().max(255).optional(),
  meta_description: z.string().max(500).optional(),

  // Brand Colors
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format')
    .optional(),
  secondary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format')
    .optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format')
    .optional(),
});

// Route parameter schemas
export const practiceParamsSchema = z.object({
  id: z.string().uuid('Invalid practice ID'),
});
