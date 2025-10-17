/**
 * Workflow Transition Validation Schemas
 *
 * Zod schemas for validating transition configurations from the database.
 * These ensure type safety when parsing JSONB columns.
 */

import { z } from 'zod';

/**
 * Validation rule operator types
 */
const validationRuleOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
]);

/**
 * Individual validation rule schema
 */
const validationRuleSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: validationRuleOperatorSchema,
  value: z.string(),
  message: z.string().min(1, 'Message is required'),
});

/**
 * Complete validation configuration schema
 */
export const validationConfigSchema = z.object({
  required_fields: z.array(z.string()).default([]),
  custom_rules: z.array(validationRuleSchema).default([]),
});

/**
 * Notification action schema
 */
const notificationActionSchema = z.object({
  type: z.literal('notification'),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required'),
  template: z.string().optional(),
  subject: z.string().optional(),
});

/**
 * Field update action schema
 */
const fieldUpdateActionSchema = z.object({
  type: z.literal('field_update'),
  field_id: z.string().min(1, 'Field ID is required'),
  value: z.string(), // Supports template tokens like {creator}
  condition: z.string().optional(),
});

/**
 * Assignment action schema
 */
const assignmentActionSchema = z.object({
  type: z.literal('assignment'),
  assign_to: z.string().min(1, 'Assignee is required'), // User ID or template token
  condition: z.string().optional(),
});

/**
 * Complete action configuration schema
 */
export const actionConfigSchema = z.object({
  notifications: z.array(notificationActionSchema).default([]),
  field_updates: z.array(fieldUpdateActionSchema).default([]),
  assignments: z.array(assignmentActionSchema).default([]),
});

/**
 * Type exports derived from schemas
 */
export type ValidationConfig = z.infer<typeof validationConfigSchema>;
export type ActionConfig = z.infer<typeof actionConfigSchema>;
export type ValidationRule = z.infer<typeof validationRuleSchema>;
export type NotificationAction = z.infer<typeof notificationActionSchema>;
export type FieldUpdateAction = z.infer<typeof fieldUpdateActionSchema>;
export type AssignmentAction = z.infer<typeof assignmentActionSchema>;

/**
 * Parse validation config from unknown data (e.g., database JSONB)
 *
 * @param data - Unknown data to parse
 * @returns Validated ValidationConfig or null if invalid
 *
 * @example
 * const config = parseValidationConfig(transition.validation_config);
 * if (config) {
 *   // config is strongly typed as ValidationConfig
 *   console.log(config.required_fields);
 * }
 */
export function parseValidationConfig(data: unknown): ValidationConfig | null {
  try {
    return validationConfigSchema.parse(data);
  } catch (error) {
    console.error('Failed to parse validation config:', error);
    return null;
  }
}

/**
 * Parse action config from unknown data (e.g., database JSONB)
 *
 * @param data - Unknown data to parse
 * @returns Validated ActionConfig or null if invalid
 *
 * @example
 * const config = parseActionConfig(transition.action_config);
 * if (config) {
 *   // config is strongly typed as ActionConfig
 *   console.log(config.notifications.length);
 * }
 */
export function parseActionConfig(data: unknown): ActionConfig | null {
  try {
    return actionConfigSchema.parse(data);
  } catch (error) {
    console.error('Failed to parse action config:', error);
    return null;
  }
}

/**
 * Safely parse validation config with default fallback
 *
 * @param data - Unknown data to parse
 * @returns Valid ValidationConfig (defaults if parsing fails)
 */
export function parseValidationConfigSafe(data: unknown): ValidationConfig {
  return parseValidationConfig(data) ?? { required_fields: [], custom_rules: [] };
}

/**
 * Safely parse action config with default fallback
 *
 * @param data - Unknown data to parse
 * @returns Valid ActionConfig (defaults if parsing fails)
 */
export function parseActionConfigSafe(data: unknown): ActionConfig {
  return parseActionConfig(data) ?? { notifications: [], field_updates: [], assignments: [] };
}
