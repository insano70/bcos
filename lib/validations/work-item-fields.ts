import { z } from 'zod';

/**
 * Work Item Fields Validation Schemas
 * Provides type-safe validation with XSS protection and business rules
 */

// Field type enum
export const fieldTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'datetime',
  'dropdown',
  'checkbox',
  'user_picker',
]);

// Field option schema
export const fieldOptionSchema = z.object({
  value: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
});

// Validation rules schema
export const validationRulesSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().max(500).optional(),
    minLength: z.number().min(0).optional(),
    maxLength: z.number().min(1).max(10000).optional(),
    required: z.boolean().optional(),
  })
  .optional();

// Create work item field schema
export const workItemFieldCreateSchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID'),
  field_name: z
    .string()
    .min(1, 'Field name is required')
    .max(100, 'Field name must be 100 characters or less')
    .regex(/^[a-z][a-z0-9_]*$/, 'Field name must start with lowercase letter and contain only lowercase letters, numbers, and underscores'),
  field_label: z.string().min(1, 'Field label is required').max(255, 'Field label must not exceed 255 characters'),
  field_type: fieldTypeSchema,
  field_description: z.string().max(1000).optional(),
  field_options: z.array(fieldOptionSchema).optional(),
  is_required: z.boolean().optional().default(false),
  validation_rules: validationRulesSchema,
  default_value: z.string().max(1000).optional(),
  display_order: z.number().int().min(0).optional().default(0),
  is_visible: z.boolean().optional().default(true),
});

// Update work item field schema
export const workItemFieldUpdateSchema = z.object({
  field_label: z.string().min(1, 'Field label is required').max(255, 'Field label must not exceed 255 characters').optional(),
  field_description: z.string().max(1000).optional(),
  field_options: z.array(fieldOptionSchema).optional(),
  is_required: z.boolean().optional(),
  validation_rules: validationRulesSchema,
  default_value: z.string().max(1000).optional(),
  display_order: z.number().int().min(0).optional(),
  is_visible: z.boolean().optional(),
});

// Route parameter schema
export const workItemFieldParamsSchema = z.object({
  id: z.string().uuid('Invalid field ID'),
});

// Work item type fields params schema
export const workItemTypeFieldsParamsSchema = z.object({
  id: z.string().uuid('Invalid work item type ID'),
});

// Query schema for listing fields
export const workItemFieldsQuerySchema = z.object({
  work_item_type_id: z.string().uuid().optional(),
  is_visible: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .optional(),
});

// Export types inferred from schemas
export type WorkItemFieldCreate = z.infer<typeof workItemFieldCreateSchema>;
export type WorkItemFieldUpdate = z.infer<typeof workItemFieldUpdateSchema>;
export type WorkItemFieldParams = z.infer<typeof workItemFieldParamsSchema>;
export type WorkItemTypeFieldsParams = z.infer<typeof workItemTypeFieldsParamsSchema>;
export type WorkItemFieldsQuery = z.infer<typeof workItemFieldsQuerySchema>;
