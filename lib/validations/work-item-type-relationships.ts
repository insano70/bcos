import { z } from 'zod';

/**
 * Work Item Type Relationships Validation Schemas
 * Phase 6: Type relationships with auto-creation and field inheritance
 */

// Auto-create configuration schema
export const autoCreateConfigSchema = z.object({
  subject_template: z
    .string()
    .max(500, 'Subject template must be 500 characters or less')
    .optional(),
  field_values: z.record(z.string(), z.string().max(1000)).optional(),
  inherit_fields: z
    .array(z.string().max(100))
    .max(50, 'Cannot inherit more than 50 fields')
    .optional(),
});

// Create work item type relationship schema
export const workItemTypeRelationshipCreateSchema = z
  .object({
    parent_type_id: z.string().uuid('Invalid parent type ID'),
    child_type_id: z.string().uuid('Invalid child type ID'),
    relationship_name: z
      .string()
      .min(1, 'Relationship name is required')
      .max(100, 'Relationship name must be 100 characters or less'),
    is_required: z.boolean().optional().default(false),
    min_count: z.number().int().min(0, 'Minimum count must be 0 or greater').optional(),
    max_count: z.number().int().min(1, 'Maximum count must be 1 or greater').optional(),
    auto_create: z.boolean().optional().default(false),
    auto_create_config: autoCreateConfigSchema.optional(),
    display_order: z.number().int().min(0).optional().default(0),
  })
  .refine(
    (data) => {
      // If min_count and max_count are both provided, min must be <= max
      if (data.min_count !== undefined && data.max_count !== undefined) {
        return data.min_count <= data.max_count;
      }
      return true;
    },
    {
      message: 'Minimum count must be less than or equal to maximum count',
      path: ['min_count'],
    }
  )
  .refine(
    (data) => {
      // Parent and child types cannot be the same
      return data.parent_type_id !== data.child_type_id;
    },
    {
      message: 'Parent and child types must be different',
      path: ['child_type_id'],
    }
  )
  .refine(
    (data) => {
      // If auto_create is true, auto_create_config should be provided
      if (data.auto_create && !data.auto_create_config) {
        return false;
      }
      return true;
    },
    {
      message: 'Auto-create configuration is required when auto-create is enabled',
      path: ['auto_create_config'],
    }
  );

// Update work item type relationship schema
export const workItemTypeRelationshipUpdateSchema = z
  .object({
    relationship_name: z
      .string()
      .min(1, 'Relationship name is required')
      .max(100, 'Relationship name must be 100 characters or less')
      .optional(),
    is_required: z.boolean().optional(),
    min_count: z.number().int().min(0, 'Minimum count must be 0 or greater').optional(),
    max_count: z.number().int().min(1, 'Maximum count must be 1 or greater').optional(),
    auto_create: z.boolean().optional(),
    auto_create_config: autoCreateConfigSchema.optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine(
    (data) => {
      // If min_count and max_count are both provided, min must be <= max
      if (data.min_count !== undefined && data.max_count !== undefined) {
        return data.min_count <= data.max_count;
      }
      return true;
    },
    {
      message: 'Minimum count must be less than or equal to maximum count',
      path: ['min_count'],
    }
  );

// Route parameter schemas
export const workItemTypeRelationshipParamsSchema = z.object({
  id: z.string().uuid('Invalid relationship ID'),
});

export const workItemTypeRelationshipsParamsSchema = z.object({
  id: z.string().uuid('Invalid work item type ID'),
});

// Query schema for listing relationships
export const workItemTypeRelationshipsQuerySchema = z.object({
  parent_type_id: z.string().uuid('Invalid parent type ID').optional(),
  child_type_id: z.string().uuid('Invalid child type ID').optional(),
  is_required: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  auto_create: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// Export types inferred from schemas
export type AutoCreateConfig = z.infer<typeof autoCreateConfigSchema>;
export type WorkItemTypeRelationshipCreate = z.infer<typeof workItemTypeRelationshipCreateSchema>;
export type WorkItemTypeRelationshipUpdate = z.infer<typeof workItemTypeRelationshipUpdateSchema>;
export type WorkItemTypeRelationshipParams = z.infer<typeof workItemTypeRelationshipParamsSchema>;
export type WorkItemTypeRelationshipsParams = z.infer<typeof workItemTypeRelationshipsParamsSchema>;
export type WorkItemTypeRelationshipsQuery = z.infer<typeof workItemTypeRelationshipsQuerySchema>;
