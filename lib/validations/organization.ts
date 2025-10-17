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
  parent_organization_id: z
    .union([
      z.string().uuid('Invalid parent organization ID'),
      z.literal(''), // Allow empty string for root organizations
    ])
    .optional()
    .transform((val) => (val === '' || !val ? undefined : val)), // Convert empty to undefined
  is_active: z.boolean().optional().default(true),

  // Analytics security - practice_uid filtering
  // Array of practice_uid values from analytics database for data filtering
  // Empty array = fail-closed security (users see no analytics data)
  practice_uids: z
    .array(z.number().int().positive('Practice UID must be a positive integer'))
    .optional()
    .default([]),
});

// Update schema - all fields optional
export const organizationUpdateSchema = baseOrganizationSchema.partial().extend({
  parent_organization_id: z
    .union([
      z.string().uuid('Invalid parent organization ID'),
      z.literal(''), // Allow empty string
    ])
    .optional()
    .nullable()
    .transform((val) => (val === '' || !val ? null : val)), // Convert empty to null
  is_active: z.boolean().optional(),

  // Analytics security - practice_uid filtering
  // Array of practice_uid values from analytics database for data filtering
  practice_uids: z
    .array(z.number().int().positive('Practice UID must be a positive integer'))
    .optional(),
});

// Query schema for list endpoints
export const organizationQuerySchema = z.object({
  parent_organization_id: z
    .union([
      z.string().uuid('Invalid parent organization ID'),
      z.literal(''), // Allow empty string
    ])
    .optional()
    .transform((val) => (val === '' || !val ? undefined : val)), // Convert empty to undefined
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

// Organization users batch update schema
export const organizationUsersBatchUpdateSchema = z.object({
  add_user_ids: z.array(z.string().uuid('Invalid user ID')).optional().default([]),
  remove_user_ids: z.array(z.string().uuid('Invalid user ID')).optional().default([]),
});

// Export types inferred from schemas
export type OrganizationCreate = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
export type OrganizationParams = z.infer<typeof organizationParamsSchema>;
export type OrganizationUsersBatchUpdate = z.infer<typeof organizationUsersBatchUpdateSchema>;
