import { z } from 'zod';

/**
 * Unified validation schema for practice configuration form
 * Used by both client (react-hook-form) and server (API route)
 *
 * Single source of truth for all practice configuration validation rules
 */
export const practiceConfigSchema = z.object({
  // ========================================
  // Practice Core Fields
  // ========================================
  name: z
    .string()
    .min(1, 'Practice name is required')
    .max(255, 'Practice name must not exceed 255 characters')
    .trim(),

  template_id: z.string().min(1, 'Please select a template'),

  // ========================================
  // Contact Information
  // ========================================
  phone: z
    .string()
    .max(20, 'Phone number must not exceed 20 characters')
    .regex(
      /^$|^\+?[\d\s\-().]+$/,
      'Phone number can only contain digits, spaces, and +()-. characters'
    )
    .optional()
    .or(z.literal('')),

  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .optional()
    .or(z.literal('')),

  address_line1: z
    .string()
    .max(255, 'Address line 1 must not exceed 255 characters')
    .optional()
    .or(z.literal('')),

  address_line2: z
    .string()
    .max(255, 'Address line 2 must not exceed 255 characters')
    .optional()
    .or(z.literal('')),

  city: z
    .string()
    .max(100, 'City must not exceed 100 characters')
    .optional()
    .or(z.literal('')),

  state: z
    .string()
    .max(50, 'State must not exceed 50 characters')
    .optional()
    .or(z.literal('')),

  zip_code: z
    .string()
    .max(20, 'ZIP code must not exceed 20 characters')
    .regex(/^$|^\d{5}(-\d{4})?$/, 'ZIP code must be in format: 12345 or 12345-6789')
    .optional()
    .or(z.literal('')),

  // ========================================
  // Content
  // ========================================
  about_text: z
    .string()
    .max(5000, 'About text must not exceed 5000 characters')
    .optional()
    .or(z.literal('')),

  mission_statement: z
    .string()
    .max(1000, 'Mission statement must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),

  welcome_message: z
    .string()
    .max(500, 'Welcome message must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  // ========================================
  // Services & Conditions (Arrays)
  // ========================================
  services: z
    .array(z.string().max(255, 'Service name must not exceed 255 characters'))
    .default([]),

  conditions_treated: z
    .array(z.string().max(255, 'Condition name must not exceed 255 characters'))
    .default([]),

  // ========================================
  // Business Hours (Complex Nested Object)
  // ========================================
  business_hours: z
    .object({
      sunday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      monday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      tuesday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      wednesday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      thursday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      friday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
      saturday: z.object({
        open: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 09:00)')
          .optional()
          .or(z.literal('')),
        close: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (e.g., 17:00)')
          .optional()
          .or(z.literal('')),
        closed: z.boolean(),
      }),
    })
    .optional(),

  // ========================================
  // Media (Images)
  // ========================================
  logo_url: z
    .string()
    .max(500, 'Logo URL must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  hero_image_url: z
    .string()
    .max(500, 'Hero image URL must not exceed 500 characters')
    .optional()
    .or(z.literal('')),

  hero_overlay_opacity: z
    .number()
    .min(0, 'Opacity must be at least 0')
    .max(1, 'Opacity must not exceed 1')
    .optional()
    .default(0.1),

  gallery_images: z.array(z.string()).default([]),

  // ========================================
  // SEO
  // ========================================
  meta_title: z
    .string()
    .max(60, 'Meta title should not exceed 60 characters for optimal SEO')
    .optional()
    .or(z.literal('')),

  meta_description: z
    .string()
    .max(160, 'Meta description must not exceed 160 characters')
    .optional()
    .or(z.literal('')),

  // ========================================
  // Brand Colors
  // ========================================
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format (use #RRGGBB)')
    .default('#00AEEF'),

  secondary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format (use #RRGGBB)')
    .default('#FFFFFF'),

  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format (use #RRGGBB)')
    .default('#44C0AE'),
});

/**
 * Infer TypeScript type from schema
 * Use this type for form data throughout the application
 */
export type PracticeConfigFormData = z.infer<typeof practiceConfigSchema>;

/**
 * Schema for practice attributes only (excludes name and template_id)
 * Used by the API route for updating practice attributes
 */
export const practiceAttributesFormSchema = practiceConfigSchema.omit({
  name: true,
  template_id: true,
});

export type PracticeAttributesFormData = z.infer<typeof practiceAttributesFormSchema>;
