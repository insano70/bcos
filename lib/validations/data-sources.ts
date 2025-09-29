import { z } from 'zod';

// Data source validation schemas
export const dataSourceCreateSchema = z.object({
  data_source_name: z.string()
    .min(1, 'Data source name is required')
    .max(100, 'Data source name must not exceed 100 characters')
    .trim(),
  data_source_description: z.string()
    .max(1000, 'Description must not exceed 1000 characters')
    .trim()
    .optional(),
  table_name: z.string()
    .min(1, 'Table name is required')
    .max(100, 'Table name must not exceed 100 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Table name must start with a letter and contain only letters, numbers, and underscores')
    .trim(),
  schema_name: z.string()
    .min(1, 'Schema name is required')
    .max(50, 'Schema name must not exceed 50 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Schema name must start with a letter and contain only letters, numbers, and underscores')
    .trim(),
  database_type: z.string()
    .max(50, 'Database type must not exceed 50 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Database type must contain only letters, numbers, and underscores')
    .trim()
    .optional()
    .default('postgresql'),
  connection_config: z.record(z.unknown())
    .optional(),
  is_active: z.boolean()
    .optional()
    .default(true),
  requires_auth: z.boolean()
    .optional()
    .default(true)
});

export const dataSourceUpdateSchema = z.object({
  data_source_name: z.string()
    .min(1, 'Data source name is required')
    .max(100, 'Data source name must not exceed 100 characters')
    .trim()
    .optional(),
  data_source_description: z.string()
    .max(1000, 'Description must not exceed 1000 characters')
    .trim()
    .optional(),
  table_name: z.string()
    .min(1, 'Table name is required')
    .max(100, 'Table name must not exceed 100 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Table name must start with a letter and contain only letters, numbers, and underscores')
    .trim()
    .optional(),
  schema_name: z.string()
    .min(1, 'Schema name is required')
    .max(50, 'Schema name must not exceed 50 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Schema name must start with a letter and contain only letters, numbers, and underscores')
    .trim()
    .optional(),
  database_type: z.string()
    .max(50, 'Database type must not exceed 50 characters')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Database type must contain only letters, numbers, and underscores')
    .trim()
    .optional(),
  connection_config: z.record(z.unknown())
    .optional(),
  is_active: z.boolean()
    .optional(),
  requires_auth: z.boolean()
    .optional()
});

// Parameter validation schemas
export const dataSourceParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be a number'),
});

// Query parameter validation schemas
export const dataSourceQuerySchema = z.object({
  search: z.string()
    .max(255, 'Search term too long')
    .trim()
    .optional(),
  is_active: z.coerce.boolean()
    .optional(),
  database_type: z.string()
    .max(50, 'Database type too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid database type format')
    .trim()
    .optional(),
  schema_name: z.string()
    .max(50, 'Schema name too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid schema name format')
    .trim()
    .optional(),
  limit: z.coerce.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(50),
  offset: z.coerce.number()
    .int()
    .min(0, 'Offset must be non-negative')
    .optional()
    .default(0)
});

// Refined schemas with additional business logic validation
export const dataSourceCreateRefinedSchema = dataSourceCreateSchema
  .refine((data) => {
    // Ensure table and schema combination is unique (would need database check in real implementation)
    return data.table_name && data.schema_name;
  }, {
    message: 'Both table name and schema name are required',
    path: ['table_name']
  });

export const dataSourceUpdateRefinedSchema = dataSourceUpdateSchema
  .refine((data) => {
    // Ensure at least one field is being updated
    const hasUpdates = Object.values(data).some(value => value !== undefined);
    return hasUpdates;
  }, {
    message: 'At least one field must be provided for update',
  });

// Export types derived from schemas
export type DataSourceCreateInput = z.infer<typeof dataSourceCreateSchema>;
export type DataSourceUpdateInput = z.infer<typeof dataSourceUpdateSchema>;
export type DataSourceQueryInput = z.infer<typeof dataSourceQuerySchema>;
export type DataSourceParamsInput = z.infer<typeof dataSourceParamsSchema>;
