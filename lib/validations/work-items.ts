import { z } from 'zod';
import { createSafeTextSchema } from './sanitization';

/**
 * Work Items Validation Schemas
 * Provides comprehensive validation with XSS protection for work item operations
 */

// Priority enum
const prioritySchema = z.enum(['critical', 'high', 'medium', 'low'], {
  message: 'Priority must be one of: critical, high, medium, low',
});

// Status category enum (for filtering and status creation)
const statusCategorySchema = z.enum(['backlog', 'in_progress', 'completed', 'cancelled'], {
  message: 'Status category must be one of: backlog, in_progress, completed, cancelled',
});

/**
 * Work Item Type Schemas
 */
export const workItemTypeCreateSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  name: createSafeTextSchema(1, 100, 'Name'),
  description: createSafeTextSchema(0, 1000, 'Description').optional(),
  icon: z.string().max(100, 'Icon must not exceed 100 characters').optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g., #FF5733)')
    .optional(),
  is_active: z.boolean().default(true),
});

export const workItemTypeUpdateSchema = z.object({
  name: createSafeTextSchema(1, 100, 'Name').optional(),
  description: createSafeTextSchema(0, 1000, 'Description').optional().nullable(),
  icon: z.string().max(100, 'Icon must not exceed 100 characters').optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g., #FF5733)')
    .optional()
    .nullable(),
  is_active: z.boolean().optional(),
});

export const workItemTypeQuerySchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID').optional(),
  is_active: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

export const workItemTypeParamsSchema = z.object({
  id: z.string().uuid('Invalid work item type ID'),
});

/**
 * Work Item Status Schemas
 */
export const workItemStatusCreateSchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID'),
  status_name: createSafeTextSchema(1, 100, 'Status name'),
  status_category: statusCategorySchema,
  is_initial: z.boolean().default(false),
  is_final: z.boolean().default(false),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g., #FF5733)')
    .optional(),
  display_order: z.number().int().min(0).default(0),
});

export const workItemStatusUpdateSchema = z.object({
  status_name: createSafeTextSchema(1, 100, 'Status name').optional(),
  status_category: statusCategorySchema.optional(),
  is_initial: z.boolean().optional(),
  is_final: z.boolean().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code (e.g., #FF5733)')
    .optional()
    .nullable(),
  display_order: z.number().int().min(0).optional(),
});

/**
 * Work Item Schemas
 * Phase 2: Added parent_work_item_id for hierarchy support
 * Phase 3: Added custom_fields for custom field values
 */
export const workItemCreateSchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID'),
  organization_id: z.string().uuid('Invalid organization ID').optional(),
  subject: createSafeTextSchema(1, 500, 'Subject'),
  description: createSafeTextSchema(0, 10000, 'Description').optional().nullable(),
  priority: prioritySchema.default('medium'),
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable(),
  due_date: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional()
    .nullable(),
  // Phase 2: Hierarchy support
  parent_work_item_id: z.string().uuid('Invalid parent work item ID').optional().nullable(),
  // Phase 3: Custom fields support
  custom_fields: z.record(z.string().uuid(), z.unknown()).optional(),
});

export const workItemUpdateSchema = z.object({
  subject: createSafeTextSchema(1, 500, 'Subject').optional(),
  description: createSafeTextSchema(0, 10000, 'Description').optional().nullable(),
  status_id: z.string().uuid('Invalid status ID').optional(),
  priority: prioritySchema.optional(),
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable(),
  due_date: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional()
    .nullable(),
  started_at: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional()
    .nullable(),
  completed_at: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional()
    .nullable(),
  // Phase 3: Custom fields support
  custom_fields: z.record(z.string().uuid(), z.unknown()).optional(),
});

export const workItemQuerySchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID').optional(),
  organization_id: z.string().uuid('Invalid organization ID').optional(),
  status_id: z.string().uuid('Invalid status ID').optional(),
  status_category: statusCategorySchema.optional(),
  priority: prioritySchema.optional(),
  assigned_to: z.string().uuid('Invalid user ID').optional(),
  created_by: z.string().uuid('Invalid user ID').optional(),
  search: createSafeTextSchema(0, 500, 'Search').optional(),
  // Date range filters for created_at
  created_after: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional(),
  created_before: z
    .string()
    .datetime('Invalid date format')
    .transform((val) => new Date(val))
    .optional(),
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
  sortBy: z
    .enum(['subject', 'priority', 'due_date', 'created_at', 'updated_at'])
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  show_hierarchy: z.enum(['root_only', 'all']).default('root_only'),
});

export const workItemParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
});

/**
 * Type exports for use in handlers and services
 */
export type WorkItemTypeCreate = z.infer<typeof workItemTypeCreateSchema>;
export type WorkItemTypeUpdate = z.infer<typeof workItemTypeUpdateSchema>;
export type WorkItemTypeQuery = z.infer<typeof workItemTypeQuerySchema>;
export type WorkItemTypeParams = z.infer<typeof workItemTypeParamsSchema>;

export type WorkItemStatusCreate = z.infer<typeof workItemStatusCreateSchema>;
export type WorkItemStatusUpdate = z.infer<typeof workItemStatusUpdateSchema>;

export type WorkItemCreate = z.infer<typeof workItemCreateSchema>;
export type WorkItemUpdate = z.infer<typeof workItemUpdateSchema>;
export type WorkItemQuery = z.infer<typeof workItemQuerySchema>;
export type WorkItemParams = z.infer<typeof workItemParamsSchema>;

/**
 * Phase 2: Hierarchy Operation Schemas
 */
export const workItemMoveSchema = z.object({
  parent_work_item_id: z.string().uuid('Invalid parent work item ID').nullable(),
});

export type WorkItemMove = z.infer<typeof workItemMoveSchema>;

/**
 * Phase 2: Work Item Comments Schemas
 */
export const workItemCommentCreateSchema = z.object({
  parent_comment_id: z.string().uuid('Invalid parent comment ID').optional().nullable(),
  comment_text: createSafeTextSchema(1, 5000, 'Comment text'),
});

export const workItemCommentUpdateSchema = z.object({
  comment_text: createSafeTextSchema(1, 5000, 'Comment text'),
});

export const workItemCommentQuerySchema = z.object({
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

export const workItemCommentParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
  commentId: z.string().uuid('Invalid comment ID'),
});

export type WorkItemCommentCreate = z.infer<typeof workItemCommentCreateSchema>;
export type WorkItemCommentUpdate = z.infer<typeof workItemCommentUpdateSchema>;
export type WorkItemCommentQuery = z.infer<typeof workItemCommentQuerySchema>;
export type WorkItemCommentParams = z.infer<typeof workItemCommentParamsSchema>;

/**
 * Phase 2: Work Item Attachments Schemas
 */
export const workItemAttachmentCreateSchema = z.object({
  file_name: createSafeTextSchema(1, 255, 'File name'),
  file_size: z.number().int().min(1).max(524288000), // Max 500MB
  file_type: z.string().min(1).max(100),
  // Note: work_item_id comes from route params, not body
  // Note: s3_key and s3_bucket are generated by the service, not provided by client
});

export const workItemAttachmentQuerySchema = z.object({
  // Note: work_item_id comes from route params, not query params
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

export const workItemAttachmentParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
  attachmentId: z.string().uuid('Invalid attachment ID'),
});

export type WorkItemAttachmentCreate = z.infer<typeof workItemAttachmentCreateSchema>;
export type WorkItemAttachmentQuery = z.infer<typeof workItemAttachmentQuerySchema>;
export type WorkItemAttachmentParams = z.infer<typeof workItemAttachmentParamsSchema>;

/**
 * Phase 2: Work Item Activity Schemas (for internal use)
 */
export const workItemActivityCreateSchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID'),
  activity_type: z.string().min(1).max(100),
  field_name: z.string().max(100).optional().nullable(),
  old_value: z.string().optional().nullable(),
  new_value: z.string().optional().nullable(),
  description: createSafeTextSchema(0, 1000, 'Description').optional().nullable(),
});

export const workItemActivityQuerySchema = z.object({
  activity_type: z.string().optional(),
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

export type WorkItemActivityCreate = z.infer<typeof workItemActivityCreateSchema>;
export type WorkItemActivityQuery = z.infer<typeof workItemActivityQuerySchema>;

/**
 * Phase 4: Work Item Status Params Schema
 */
export const workItemStatusParamsSchema = z.object({
  id: z.string().uuid('Invalid work item status ID'),
});

export type WorkItemStatusParams = z.infer<typeof workItemStatusParamsSchema>;

/**
 * Phase 4: Work Item Status Transitions Schemas
 * Phase 7: Enhanced with validation_config and action_config
 */

// Validation config schema for status transitions
const customRuleSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
  value: z.string(),
  message: z.string().optional(),
});

export const validationConfigSchema = z
  .object({
    required_fields: z.array(z.string()).optional(),
    custom_rules: z.array(customRuleSchema).optional(),
  })
  .optional();

export type ValidationConfig = z.infer<typeof validationConfigSchema>;
export type CustomRule = z.infer<typeof customRuleSchema>;

// Action config schema for status transitions
const notificationActionSchema = z.object({
  type: z.literal('email'),
  recipients: z.array(z.string()), // 'assigned_to', 'creator', 'watchers', or user IDs
  template: z.string(),
  subject: z.string().optional(),
});

const fieldUpdateActionSchema = z.object({
  field: z.string(),
  value: z.string(),
  condition: z.string().optional(),
});

const assignmentActionSchema = z.object({
  action: z.literal('assign_to'),
  user_id: z.string(),
  condition: z.string().optional(),
});

export const actionConfigSchema = z
  .object({
    notifications: z.array(notificationActionSchema).optional(),
    field_updates: z.array(fieldUpdateActionSchema).optional(),
    assignments: z.array(assignmentActionSchema).optional(),
  })
  .optional();

export type ActionConfig = z.infer<typeof actionConfigSchema>;
export type NotificationAction = z.infer<typeof notificationActionSchema>;
export type FieldUpdateAction = z.infer<typeof fieldUpdateActionSchema>;
export type AssignmentAction = z.infer<typeof assignmentActionSchema>;

export const workItemStatusTransitionCreateSchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID'),
  from_status_id: z.string().uuid('Invalid from status ID'),
  to_status_id: z.string().uuid('Invalid to status ID'),
  is_allowed: z.boolean().default(true),
  validation_config: validationConfigSchema,
  action_config: actionConfigSchema,
});

export const workItemStatusTransitionUpdateSchema = z.object({
  is_allowed: z.boolean().optional(),
  validation_config: validationConfigSchema,
  action_config: actionConfigSchema,
});

export const workItemStatusTransitionQuerySchema = z.object({
  work_item_type_id: z.string().uuid('Invalid work item type ID').optional(),
  from_status_id: z.string().uuid('Invalid from status ID').optional(),
  to_status_id: z.string().uuid('Invalid to status ID').optional(),
  limit: z
    .string()
    .default('1000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(1000)),
  offset: z
    .string()
    .default('0')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0)),
});

export const workItemStatusTransitionParamsSchema = z.object({
  id: z.string().uuid('Invalid work item status transition ID'),
});

export type WorkItemStatusTransitionCreate = z.infer<typeof workItemStatusTransitionCreateSchema>;
export type WorkItemStatusTransitionUpdate = z.infer<typeof workItemStatusTransitionUpdateSchema>;
export type WorkItemStatusTransitionQuery = z.infer<typeof workItemStatusTransitionQuerySchema>;
export type WorkItemStatusTransitionParams = z.infer<typeof workItemStatusTransitionParamsSchema>;
