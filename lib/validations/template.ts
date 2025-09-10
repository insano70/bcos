import { z } from 'zod'

// Template validation schemas
export const templateCreateSchema = z.object({
  name: z.string()
    .min(1, 'Template name is required')
    .max(255, 'Template name must not exceed 255 characters')
    .trim(),
  slug: z.string()
    .min(1, 'Template slug is required')
    .max(100, 'Template slug must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .trim(),
  description: z.string()
    .max(1000, 'Description must not exceed 1000 characters')
    .optional(),
  preview_image_url: z.string()
    .url('Invalid preview image URL')
    .max(500, 'Preview image URL must not exceed 500 characters')
    .optional(),
  is_active: z.boolean().optional().default(true)
})

export const templateUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Template name is required')
    .max(255, 'Template name must not exceed 255 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description must not exceed 1000 characters')
    .optional(),
  preview_image_url: z.string()
    .url('Invalid preview image URL')
    .max(500, 'Preview image URL must not exceed 500 characters')
    .optional(),
  is_active: z.boolean().optional()
})

export const templateQuerySchema = z.object({
  is_active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  search: z.string().max(255).optional()
})

// Route parameter schemas
export const templateParamsSchema = z.object({
  id: z.string().uuid('Invalid template ID')
})
