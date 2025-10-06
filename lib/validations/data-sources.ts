import { z } from 'zod';
import { createSafeTextSchema } from './sanitization';

// Data source validation schemas
export const dataSourceCreateSchema = z.object({
  data_source_name: createSafeTextSchema(1, 100, 'Data source name'),
  data_source_description: createSafeTextSchema(0, 1000, 'Description').optional(),
  table_name: z
    .string()
    .min(1, 'Table name is required')
    .max(100, 'Table name must not exceed 100 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Table name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim(),
  schema_name: z
    .string()
    .min(1, 'Schema name is required')
    .max(50, 'Schema name must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Schema name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim(),
  database_type: z
    .string()
    .max(50, 'Database type must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Database type must contain only letters, numbers, and underscores'
    )
    .trim()
    .optional()
    .default('postgresql'),
  connection_config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional().default(true),
  requires_auth: z.boolean().optional().default(true),
});

export const dataSourceUpdateSchema = z.object({
  data_source_name: createSafeTextSchema(1, 100, 'Data source name').optional(),
  data_source_description: createSafeTextSchema(0, 1000, 'Description').optional(),
  table_name: z
    .string()
    .min(1, 'Table name is required')
    .max(100, 'Table name must not exceed 100 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Table name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim()
    .optional(),
  schema_name: z
    .string()
    .min(1, 'Schema name is required')
    .max(50, 'Schema name must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Schema name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim()
    .optional(),
  database_type: z
    .string()
    .max(50, 'Database type must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Database type must contain only letters, numbers, and underscores'
    )
    .trim()
    .optional(),
  connection_config: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  requires_auth: z.boolean().optional(),
});

// Parameter validation schemas
export const dataSourceParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a number'),
});

// Query parameter validation schemas
export const dataSourceQuerySchema = z.object({
  search: z.string().max(255, 'Search term too long').trim().optional(),
  is_active: z.coerce.boolean().optional(),
  database_type: z
    .string()
    .max(50, 'Database type too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid database type format')
    .trim()
    .optional(),
  schema_name: z
    .string()
    .max(50, 'Schema name too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid schema name format')
    .trim()
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit cannot exceed 1000')
    .optional(),
  offset: z.coerce.number().int().min(0, 'Offset must be non-negative').optional(),
});

// Refined schemas with additional business logic validation
export const dataSourceCreateRefinedSchema = dataSourceCreateSchema.refine(
  (data) => {
    // Ensure table and schema combination is unique (would need database check in real implementation)
    return data.table_name && data.schema_name;
  },
  {
    message: 'Both table name and schema name are required',
    path: ['table_name'],
  }
);

export const dataSourceUpdateRefinedSchema = dataSourceUpdateSchema.refine(
  (data) => {
    // Ensure at least one field is being updated
    const hasUpdates = Object.values(data).some((value) => value !== undefined);
    return hasUpdates;
  },
  {
    message: 'At least one field must be provided for update',
  }
);

// Export types derived from schemas
// Table columns query validation schema
export const tableColumnsQuerySchema = z.object({
  schema_name: z
    .string()
    .min(1, 'Schema name is required')
    .max(50, 'Schema name must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Schema name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim(),
  table_name: z
    .string()
    .min(1, 'Table name is required')
    .max(100, 'Table name must not exceed 100 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Table name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim(),
  database_type: z
    .string()
    .max(50, 'Database type must not exceed 50 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Database type must contain only letters, numbers, and underscores'
    )
    .trim()
    .optional()
    .default('postgresql'),
});

// Data source column validation schemas
export const dataSourceColumnCreateSchema = z.object({
  data_source_id: z.number().int().positive(),
  column_name: z
    .string()
    .min(1, 'Column name is required')
    .max(100, 'Column name must not exceed 100 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Column name must start with a letter and contain only letters, numbers, and underscores'
    )
    .trim(),
  display_name: createSafeTextSchema(1, 100, 'Display name'),
  column_description: createSafeTextSchema(0, 1000, 'Description').optional(),
  data_type: z
    .string()
    .min(1, 'Data type is required')
    .max(50, 'Data type must not exceed 50 characters')
    .trim(),

  // Chart functionality flags
  is_filterable: z.boolean().optional().default(false),
  is_groupable: z.boolean().optional().default(false),
  is_measure: z.boolean().optional().default(false),
  is_dimension: z.boolean().optional().default(false),
  is_date_field: z.boolean().optional().default(false),
  is_measure_type: z.boolean().optional().default(false),
  is_time_period: z.boolean().optional().default(false),

  // Display and formatting
  format_type: createSafeTextSchema(0, 50, 'Format type').optional(),
  sort_order: z.number().int().default(0),
  default_aggregation: createSafeTextSchema(0, 20, 'Default aggregation').optional(),

  // Icon display options
  display_icon: z.boolean().optional().default(false),
  icon_type: z.enum(['initials', 'first_letter', 'emoji']).optional(),
  icon_color_mode: z.enum(['auto', 'fixed', 'mapped']).optional().default('auto'),
  icon_color: createSafeTextSchema(0, 50, 'Icon color').optional(),
  icon_mapping: z.record(z.string(), z.unknown()).optional(),

  // Security and validation
  is_sensitive: z.boolean().optional().default(false),
  access_level: z
    .string()
    .max(20, 'Access level must not exceed 20 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Access level must contain only letters, numbers, and underscores'
    )
    .trim()
    .optional()
    .default('all'),
  allowed_values: z.record(z.string(), z.unknown()).optional(),
  validation_rules: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  example_value: createSafeTextSchema(0, 500, 'Example value').optional(),
  is_active: z.boolean().optional().default(true),
});

export const dataSourceColumnUpdateSchema = z.object({
  display_name: createSafeTextSchema(1, 100, 'Display name').optional(),
  column_description: createSafeTextSchema(0, 1000, 'Description').optional(),

  // Chart functionality flags
  is_filterable: z.boolean().optional(),
  is_groupable: z.boolean().optional(),
  is_measure: z.boolean().optional(),
  is_dimension: z.boolean().optional(),
  is_date_field: z.boolean().optional(),
  is_measure_type: z.boolean().optional(),
  is_time_period: z.boolean().optional(),

  // Display and formatting
  format_type: createSafeTextSchema(0, 50, 'Format type').optional(),
  sort_order: z.number().int().optional(),
  default_aggregation: createSafeTextSchema(0, 20, 'Default aggregation').optional(),

  // Icon display options
  display_icon: z.boolean().optional(),
  icon_type: z.enum(['initials', 'first_letter', 'emoji']).optional(),
  icon_color_mode: z.enum(['auto', 'fixed', 'mapped']).optional(),
  icon_color: createSafeTextSchema(0, 50, 'Icon color').optional(),
  icon_mapping: z.record(z.string(), z.unknown()).optional(),

  // Security and validation
  is_sensitive: z.boolean().optional(),
  access_level: z
    .string()
    .max(20, 'Access level must not exceed 20 characters')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Access level must contain only letters, numbers, and underscores'
    )
    .trim()
    .optional(),
  allowed_values: z.record(z.string(), z.unknown()).optional(),
  validation_rules: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  example_value: createSafeTextSchema(0, 500, 'Example value').optional(),
  is_active: z.boolean().optional(),
});

export const dataSourceColumnParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a number'),
});

export const dataSourceColumnQuerySchema = z.object({
  data_source_id: z.coerce.number().int().positive('Data source ID is required'),
  is_active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Refined schemas with additional business logic validation
export const dataSourceColumnCreateRefinedSchema = dataSourceColumnCreateSchema.refine(
  (data) => {
    // Ensure exactly one of is_measure or is_dimension is true (but not both)
    const hasMeasure = data.is_measure;
    const hasDimension = data.is_dimension;
    return !(hasMeasure && hasDimension);
  },
  {
    message: 'Column cannot be both a measure and dimension',
    path: ['is_measure'],
  }
);

export const dataSourceColumnUpdateRefinedSchema = dataSourceColumnUpdateSchema.refine(
  (data) => {
    // If both measure and dimension flags are provided, ensure they're not both true
    if (data.is_measure !== undefined && data.is_dimension !== undefined) {
      return !(data.is_measure && data.is_dimension);
    }
    return true;
  },
  {
    message: 'Column cannot be both a measure and dimension',
    path: ['is_measure'],
  }
);

// Export types derived from schemas
export type DataSourceCreateInput = z.infer<typeof dataSourceCreateSchema>;
export type DataSourceUpdateInput = z.infer<typeof dataSourceUpdateSchema>;
export type DataSourceQueryInput = z.infer<typeof dataSourceQuerySchema>;
export type DataSourceParamsInput = z.infer<typeof dataSourceParamsSchema>;
export type TableColumnsQueryInput = z.infer<typeof tableColumnsQuerySchema>;
export type DataSourceColumnCreateInput = z.infer<typeof dataSourceColumnCreateSchema>;
export type DataSourceColumnUpdateInput = z.infer<typeof dataSourceColumnUpdateSchema>;
export type DataSourceColumnQueryInput = z.infer<typeof dataSourceColumnQuerySchema>;
export type DataSourceColumnParamsInput = z.infer<typeof dataSourceColumnParamsSchema>;
