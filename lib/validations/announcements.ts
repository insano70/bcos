import { z } from 'zod';

import { createSafeTextSchema } from './sanitization';

/**
 * Announcement Validation Schemas
 * Provides type-safe validation with XSS protection and business rules
 */

// Enum schemas for type safety
export const announcementTargetTypeSchema = z.enum(['all', 'specific']);
export const announcementPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

// Maximum body length (10,000 characters)
const MAX_BODY_LENGTH = 10000;

// Create announcement schema with all fields
export const createAnnouncementSchema = z
  .object({
    subject: createSafeTextSchema(1, 255, 'Subject'),
    body: z
      .string()
      .min(1, 'Body is required')
      .max(MAX_BODY_LENGTH, `Body must be ${MAX_BODY_LENGTH.toLocaleString()} characters or less`),
    target_type: announcementTargetTypeSchema,
    recipient_user_ids: z.array(z.string().uuid('Invalid user ID')).optional(),
    publish_at: z
      .union([z.string().datetime(), z.date(), z.null()])
      .optional()
      .nullable()
      .transform((val) => {
        if (!val) return null;
        return typeof val === 'string' ? new Date(val) : val;
      }),
    expires_at: z
      .union([z.string().datetime(), z.date(), z.null()])
      .optional()
      .nullable()
      .transform((val) => {
        if (!val) return null;
        return typeof val === 'string' ? new Date(val) : val;
      }),
    priority: announcementPrioritySchema.default('normal'),
  })
  .refine(
    (data) => {
      if (data.target_type === 'specific') {
        return data.recipient_user_ids && data.recipient_user_ids.length > 0;
      }
      return true;
    },
    {
      message: 'Recipients are required when targeting specific users',
      path: ['recipient_user_ids'],
    }
  )
  .refine(
    (data) => {
      // Only validate if both dates are set
      if (data.publish_at && data.expires_at) {
        return data.publish_at < data.expires_at;
      }
      return true;
    },
    {
      message: 'Expiration date must be after publish date',
      path: ['expires_at'],
    }
  );

// Update announcement schema - all fields optional
export const updateAnnouncementSchema = z
  .object({
    subject: createSafeTextSchema(1, 255, 'Subject').optional(),
    body: z
      .string()
      .min(1, 'Body is required')
      .max(MAX_BODY_LENGTH, `Body must be ${MAX_BODY_LENGTH.toLocaleString()} characters or less`)
      .optional(),
    target_type: announcementTargetTypeSchema.optional(),
    recipient_user_ids: z.array(z.string().uuid('Invalid user ID')).optional(),
    publish_at: z
      .union([z.string().datetime(), z.date(), z.null()])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined) return undefined;
        if (!val) return null;
        return typeof val === 'string' ? new Date(val) : val;
      }),
    expires_at: z
      .union([z.string().datetime(), z.date(), z.null()])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined) return undefined;
        if (!val) return null;
        return typeof val === 'string' ? new Date(val) : val;
      }),
    priority: announcementPrioritySchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Only validate recipients if target_type is being set to 'specific'
      if (data.target_type === 'specific') {
        return data.recipient_user_ids && data.recipient_user_ids.length > 0;
      }
      return true;
    },
    {
      message: 'Recipients are required when targeting specific users',
      path: ['recipient_user_ids'],
    }
  )
  .refine(
    (data) => {
      // Only validate if both dates are set
      if (data.publish_at && data.expires_at) {
        return data.publish_at < data.expires_at;
      }
      return true;
    },
    {
      message: 'Expiration date must be after publish date',
      path: ['expires_at'],
    }
  );

// Route parameter schema for announcement ID
export const announcementIdParamsSchema = z.object({
  id: z.string().uuid('Invalid announcement ID'),
});

// Query schema for list endpoints
export const announcementQuerySchema = z.object({
  target_type: announcementTargetTypeSchema.optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  include_expired: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().max(255).optional(),
});

// Export types inferred from schemas
export type CreateAnnouncement = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncement = z.infer<typeof updateAnnouncementSchema>;
export type AnnouncementIdParams = z.infer<typeof announcementIdParamsSchema>;
export type AnnouncementQuery = z.infer<typeof announcementQuerySchema>;
