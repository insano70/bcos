import { z } from 'zod';

export const roleQuerySchema = z.object({
  name: z.string().max(100).optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  organization_id: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
});

export const roleCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Role name is required')
    .max(100, 'Role name must not exceed 100 characters')
    .trim(),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').optional(),
  organization_id: z.string().uuid().optional(),
  permission_ids: z.array(z.string().uuid()).min(1, 'At least one permission is required'),
  is_system_role: z.boolean().optional().default(false),
});

export const roleUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Role name is required')
    .max(100, 'Role name must not exceed 100 characters')
    .trim()
    .optional(),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').optional(),
  permission_ids: z.array(z.string().uuid()).optional(),
  is_active: z.boolean().optional(),
});
