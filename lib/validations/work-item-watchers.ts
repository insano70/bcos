import { z } from 'zod';

/**
 * Work Item Watchers Validation Schemas
 * Phase 7: Advanced Workflows & Automation
 */

// Watch type enum
export const watchTypeSchema = z.enum([
  'manual',
  'auto_creator',
  'auto_assignee',
  'auto_commenter',
]);

export type WatchType = z.infer<typeof watchTypeSchema>;

// Base watcher schema (common fields)
const baseWatcherSchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID'),
  user_id: z.string().uuid('Invalid user ID'),
  watch_type: watchTypeSchema.default('manual'),
});

// Create watcher schema
export const watcherCreateSchema = baseWatcherSchema.extend({
  notify_status_changes: z.boolean().default(true),
  notify_comments: z.boolean().default(true),
  notify_assignments: z.boolean().default(true),
  notify_due_date: z.boolean().default(true),
});

export type WatcherCreate = z.infer<typeof watcherCreateSchema>;

// Update watcher schema (notification preferences only)
export const watcherUpdateSchema = z.object({
  notify_status_changes: z.boolean().optional(),
  notify_comments: z.boolean().optional(),
  notify_assignments: z.boolean().optional(),
  notify_due_date: z.boolean().optional(),
});

export type WatcherUpdate = z.infer<typeof watcherUpdateSchema>;

// Query watcher schema
export const watcherQuerySchema = z.object({
  work_item_id: z.string().uuid('Invalid work item ID').optional(),
  user_id: z.string().uuid('Invalid user ID').optional(),
  watch_type: watchTypeSchema.optional(),
});

export type WatcherQuery = z.infer<typeof watcherQuerySchema>;

// Watcher params schema (for route params)
export const watcherParamsSchema = z.object({
  id: z.string().uuid('Invalid watcher ID'),
});

export type WatcherParams = z.infer<typeof watcherParamsSchema>;

// Work item ID params (for watch/unwatch routes)
export const workItemWatchParamsSchema = z.object({
  id: z.string().uuid('Invalid work item ID'),
});

export type WorkItemWatchParams = z.infer<typeof workItemWatchParamsSchema>;
