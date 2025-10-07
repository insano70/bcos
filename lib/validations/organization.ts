import { z } from 'zod';
import { createSafeTextSchema } from './sanitization';

/**
 * Organization Validation Schemas
 * Provides type-safe validation with XSS protection and business rules
 */

// Base organization schema for shared fields
const baseOrganizationSchema = z.object({
  name: createSafeTextSchema(1, 255, 'Organization name'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .transform((val) => val.toLowerCase()),
});

// Create schema - all required fields
export const organizationCreateSchema = baseOrganizationSchema.extend({
  parent_organization_id: z.string().uuid('Invalid parent organization ID').optional(),
  is_active: z.boolean().optional().default(true),
});

// Update schema - all fields optional
export const organizationUpdateSchema = baseOrganizationSchema.partial().extend({
  parent_organization_id: z.string().uuid('Invalid parent organization ID').optional().nullable(),
  is_active: z.boolean().optional(),
});

// Query schema for list endpoints
export const organizationQuerySchema = z.object({
  parent_organization_id: z.string().uuid('Invalid parent organization ID').optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().max(255).optional(),
});

// Route parameter schema
export const organizationParamsSchema = z.object({
  id: z.string().uuid('Invalid organization ID'),
});

// Export types inferred from schemas
export type OrganizationCreate = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
