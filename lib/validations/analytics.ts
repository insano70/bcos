import { z } from 'zod'

/**
 * Analytics Validation Schemas
 * Comprehensive validation for analytics endpoints
 */

// Common schemas
const uuidSchema = z.string().uuid('Invalid UUID format')
const integerIdSchema = z.coerce.number().int().positive('ID must be a positive integer')
const nameSchema = z.string().min(1, 'Name is required').max(255, 'Name too long')
const descriptionSchema = z.string().max(1000, 'Description too long').optional()

// Chart Category Schemas
export const chartCategoryCreateSchema = z.object({
  category_name: nameSchema,
  category_description: descriptionSchema,
  parent_category_id: integerIdSchema.optional()
})

export const chartCategoryUpdateSchema = z.object({
  category_name: nameSchema.optional(),
  category_description: descriptionSchema,
  parent_category_id: integerIdSchema.optional()
})

export const chartCategoryParamsSchema = z.object({
  categoryId: integerIdSchema
})

// Chart Definition Schemas
export const chartDefinitionCreateSchema = z.object({
  chart_name: nameSchema,
  chart_description: descriptionSchema,
  chart_type: z.enum(['line', 'bar', 'pie', 'area', 'scatter', 'histogram', 'heatmap']),
  chart_category_id: integerIdSchema.optional(),
  chart_config: z.record(z.string(), z.any()).optional(), // JSON configuration
  data_source: z.string().min(1, 'Data source is required').max(500),
  query_config: z.record(z.string(), z.any()).optional(), // JSON query configuration
  is_active: z.boolean().default(true)
})

export const chartDefinitionUpdateSchema = chartDefinitionCreateSchema.partial()

export const chartDefinitionParamsSchema = z.object({
  chartId: uuidSchema
})

// Dashboard Schemas
export const dashboardCreateSchema = z.object({
  dashboard_name: nameSchema,
  dashboard_description: descriptionSchema,
  dashboard_category_id: integerIdSchema.optional(),
  chart_ids: z.array(uuidSchema).max(50, 'Too many charts').optional(),
  layout_config: z.record(z.string(), z.any()).optional(), // JSON layout configuration
  is_active: z.boolean().default(true)
})

export const dashboardUpdateSchema = dashboardCreateSchema.partial()

export const dashboardParamsSchema = z.object({
  dashboardId: uuidSchema
})

// Favorites Schemas
export const favoriteCreateSchema = z.object({
  chart_definition_id: uuidSchema
})

export const favoriteDeleteSchema = z.object({
  chart_definition_id: uuidSchema
})

// Query parameter schemas
export const analyticsQuerySchema = z.object({
  category_id: uuidSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().max(255).optional(),
  sort_by: z.enum(['name', 'created_at', 'updated_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
})

// Bulk operations schemas
export const bulkOperationSchema = z.object({
  operation: z.enum(['clone', 'delete', 'update', 'export']),
  chart_ids: z.array(uuidSchema).min(1, 'At least one chart ID required').max(100, 'Too many charts'),
  dashboard_ids: z.array(uuidSchema).max(50, 'Too many dashboards').optional(),
  updates: z.record(z.string(), z.any()).optional(), // For bulk update operations
  export_format: z.enum(['json', 'csv', 'xlsx']).optional()
})

// Data source validation
export const dataSourceSchema = z.object({
  source_name: nameSchema,
  connection_string: z.string().min(1, 'Connection string required'),
  source_type: z.enum(['postgresql', 'mysql', 'mongodb', 'rest_api']),
  credentials: z.record(z.string(), z.string()).optional(),
  is_active: z.boolean().default(true)
})

// Export type definitions for use in API routes
export type ChartCategoryCreate = z.infer<typeof chartCategoryCreateSchema>
export type ChartCategoryUpdate = z.infer<typeof chartCategoryUpdateSchema>
export type ChartDefinitionCreate = z.infer<typeof chartDefinitionCreateSchema>
export type ChartDefinitionUpdate = z.infer<typeof chartDefinitionUpdateSchema>
export type DashboardCreate = z.infer<typeof dashboardCreateSchema>
export type DashboardUpdate = z.infer<typeof dashboardUpdateSchema>
export type FavoriteCreate = z.infer<typeof favoriteCreateSchema>
export type BulkOperation = z.infer<typeof bulkOperationSchema>
export type DataSource = z.infer<typeof dataSourceSchema>
