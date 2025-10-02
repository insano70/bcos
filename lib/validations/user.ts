import { z } from 'zod';
import { loginPasswordSchema, passwordSchema } from '@/lib/config/password-policy';
import { createNameSchema, safeEmailSchema } from './sanitization';

// User validation schemas with enhanced security
export const userCreateSchema = z.object({
  email: safeEmailSchema, // ✅ ENHANCED: XSS-safe email validation
  first_name: createNameSchema('First name'), // ✅ ENHANCED: XSS-safe name validation
  last_name: createNameSchema('Last name'), // ✅ ENHANCED: XSS-safe name validation
  password: passwordSchema, // ✅ CENTRALIZED: Uses 12-char policy from single source
  role_ids: z.array(z.string().uuid('Invalid role ID')).min(1, 'At least one role is required'),
  email_verified: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

export const userUpdateSchema = z.object({
  email: safeEmailSchema.optional(), // ✅ ENHANCED: XSS-safe email validation
  first_name: createNameSchema('First name').optional(), // ✅ ENHANCED: XSS-safe name validation
  last_name: createNameSchema('Last name').optional(), // ✅ ENHANCED: XSS-safe name validation
  password: passwordSchema.optional(), // ✅ CENTRALIZED: Optional password for reset
  role_ids: z.array(z.string().uuid('Invalid role ID')).optional(),
  email_verified: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const userQuerySchema = z.object({
  email: safeEmailSchema.optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  email_verified: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().max(255).optional(),
});

export const passwordChangeSchema = z
  .object({
    current_password: loginPasswordSchema, // ✅ CORRECT: Current password only needs presence validation
    new_password: passwordSchema, // ✅ CENTRALIZED: New password uses 12-char policy from single source
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

// Route parameter schemas
export const userParamsSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});
