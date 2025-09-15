import { z } from 'zod'

// Staff member validation schemas
export const staffCreateSchema = z.object({
  practice_id: z.string().uuid('Invalid practice ID'),
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must not exceed 255 characters')
    .trim(),
  title: z.string()
    .max(255, 'Title must not exceed 255 characters')
    .trim()
    .optional(),
  credentials: z.string()
    .max(255, 'Credentials must not exceed 255 characters')
    .trim()
    .optional(),
  bio: z.string()
    .max(2000, 'Bio must not exceed 2000 characters')
    .optional(),
  photo_url: z.string()
    .max(500, 'Photo URL must not exceed 500 characters')
    .optional()
    .refine((val) => {
      if (!val || val === '') return true; // Allow empty/undefined
      // Allow relative URLs (starting with /) or absolute URLs
      return val.startsWith('/') || z.string().url().safeParse(val).success;
    }, {
      message: 'Invalid photo URL'
    }),
  specialties: z.array(z.string().max(255)).optional(),
  education: z.array(z.object({
    degree: z.string().max(255),
    school: z.string().max(255),
    year: z.string().max(4)
  })).optional(),
  display_order: z.number().int().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true)
})

export const staffUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(255, 'Name must not exceed 255 characters')
    .trim()
    .optional(),
  title: z.string()
    .max(255, 'Title must not exceed 255 characters')
    .trim()
    .optional(),
  credentials: z.string()
    .max(255, 'Credentials must not exceed 255 characters')
    .trim()
    .optional(),
  bio: z.string()
    .max(2000, 'Bio must not exceed 2000 characters')
    .optional(),
  photo_url: z.string()
    .max(500, 'Photo URL must not exceed 500 characters')
    .optional()
    .refine((val) => {
      if (!val || val === '') return true; // Allow empty/undefined
      // Allow relative URLs (starting with /) or absolute URLs
      return val.startsWith('/') || z.string().url().safeParse(val).success;
    }, {
      message: 'Invalid photo URL'
    }),
  specialties: z.array(z.string().max(255)).optional(),
  education: z.array(z.object({
    degree: z.string().max(255),
    school: z.string().max(255),
    year: z.string().max(4)
  })).optional(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional()
})

export const staffQuerySchema = z.object({
  practice_id: z.string().uuid().optional(),
  is_active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  search: z.string().max(255).optional()
})

// Route parameter schemas
export const staffParamsSchema = z.object({
  id: z.string().uuid('Invalid staff ID'),
  practiceId: z.string().uuid('Invalid practice ID').optional()
})
