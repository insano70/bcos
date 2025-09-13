import { z } from 'zod'

// User validation schemas
export const userCreateSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase()
    .trim(),
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .trim(),
  last_name: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters')
    .trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain special character'),
  role_ids: z.array(z.string().uuid('Invalid role ID')).min(1, 'At least one role is required'),
  email_verified: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true)
})

export const userUpdateSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must not exceed 255 characters')
    .toLowerCase()
    .trim()
    .optional(),
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters')
    .trim()
    .optional(),
  last_name: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters')
    .trim()
    .optional(),
  email_verified: z.boolean().optional(),
  is_active: z.boolean().optional()
})

export const userQuerySchema = z.object({
  email: z.string().email().optional(),
  is_active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  email_verified: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  search: z.string().max(255).optional()
})

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Must contain lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Must contain uppercase letter')
    .regex(/^(?=.*\d)/, 'Must contain number')
    .regex(/^(?=.*[@$!%*?&])/, 'Must contain special character'),
  confirm_password: z.string()
}).refine(data => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"]
})

// Route parameter schemas
export const userParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID')
})
