import { z } from 'zod';

/**
 * Analytics Validation Schemas
 * Comprehensive validation for analytics endpoints
 */

// Chart configuration schemas
const chartFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'between']),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.tuple([z.union([z.string(), z.number()]), z.union([z.string(), z.number()])]),
  ]),
});

const multipleSeriesConfigSchema = z.object({
  seriesId: z.string(),
  seriesLabel: z.string(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  color: z.string().optional(),
});

const chartConfigSchema = z
  .object({
    // Database structure fields
    x_axis: z
      .object({
        field: z.string(),
        label: z.string(),
        format: z.string(),
      })
      .optional(),
    y_axis: z
      .object({
        field: z.string(),
        label: z.string(),
        format: z.string(),
      })
      .optional(),
    series: z
      .object({
        groupBy: z.string().optional(),
        colorPalette: z.string().optional(),
      })
      .optional(),
    options: z
      .object({
        responsive: z.boolean().optional(),
        showLegend: z.boolean().optional(),
        showTooltips: z.boolean().optional(),
        animation: z.boolean().optional(),
      })
      .optional(),

    // Additional configuration fields
    calculatedField: z.string().optional(),
    dateRangePreset: z.string().optional(),
    seriesConfigs: z.array(multipleSeriesConfigSchema).optional(),
    dataSourceId: z.number().optional(),
    stackingMode: z.enum(['normal', 'percentage']).optional(),
    colorPalette: z.string().optional(),

    // Legacy/internal state fields (for backwards compatibility)
    chartName: z.string().optional(),
    chartType: z.enum(['line', 'bar', 'stacked-bar', 'horizontal-bar', 'doughnut']).optional(),
    measure: z.string().optional(),
    frequency: z.string().optional(),
    practiceUid: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    groupBy: z.string().optional(),
    advancedFilters: z.array(chartFilterSchema).optional(),
    useAdvancedFiltering: z.boolean().optional(),
    useMultipleSeries: z.boolean().optional(),
  })
  .passthrough();

const dataSourceConfigSchema = z
  .object({
    table: z.string().optional(),
    filters: z.array(chartFilterSchema).optional(),
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(['asc', 'desc', 'ASC', 'DESC']), // Support both cases
        })
      )
      .optional(),
    groupBy: z.union([z.string(), z.array(z.string())]).optional(), // Support string or array
    limit: z.number().optional(),
    advancedFilters: z.array(chartFilterSchema).optional(),
  })
  .passthrough();

// Common schemas
const uuidSchema = z.string().uuid('Invalid UUID format');
const integerIdSchema = z.coerce.number().int().positive('ID must be a positive integer');
const nameSchema = z.string().min(1, 'Name is required').max(255, 'Name too long');
const descriptionSchema = z.string().max(1000, 'Description too long').optional();

// Chart Category Schemas
export const chartCategoryCreateSchema = z.object({
  category_name: nameSchema,
  category_description: descriptionSchema,
  parent_category_id: integerIdSchema.optional(),
});

export const chartCategoryUpdateSchema = z.object({
  category_name: nameSchema.optional(),
  category_description: descriptionSchema,
  parent_category_id: integerIdSchema.optional(),
});

export const chartCategoryParamsSchema = z.object({
  categoryId: integerIdSchema,
});

// Chart Definition Schemas
export const chartDefinitionCreateSchema = z.object({
  chart_name: nameSchema,
  chart_description: descriptionSchema,
  chart_type: z.enum([
    'line',
    'bar',
    'stacked-bar',
    'horizontal-bar',
    'pie',
    'doughnut',
    'area',
    'scatter',
    'histogram',
    'heatmap',
  ]),
  chart_category_id: z.union([integerIdSchema, z.null()]).optional(),
  chart_config: chartConfigSchema.optional(), // Properly typed chart configuration
  data_source: z.union([
    z.string().min(1, 'Data source is required').max(500),
    dataSourceConfigSchema,
  ]),
  query_config: dataSourceConfigSchema.optional(), // Properly typed query configuration
  is_active: z.boolean().default(true),
});

export const chartDefinitionUpdateSchema = chartDefinitionCreateSchema.partial();

export const chartDefinitionParamsSchema = z.object({
  chartId: uuidSchema,
});

// Chart position validation schema
const chartPositionSchema = z.object({
  x: z.number().int().min(0, 'X coordinate must be non-negative'),
  y: z.number().int().min(0, 'Y coordinate must be non-negative'),
  w: z.number().int().min(1, 'Width must be at least 1').max(12, 'Width cannot exceed 12'),
  h: z.number().int().min(1, 'Height must be at least 1'),
});

// Dashboard Schemas
export const dashboardCreateSchema = z
  .object({
    dashboard_name: nameSchema,
    dashboard_description: descriptionSchema,
    dashboard_category_id: integerIdSchema.optional(),
    chart_ids: z.array(uuidSchema).max(50, 'Too many charts').optional(),
    chart_positions: z.array(chartPositionSchema).max(50, 'Too many chart positions').optional(),
    layout_config: z.record(z.string(), z.any()).optional(), // JSON layout configuration
    is_active: z.boolean().default(true),
    is_published: z.boolean().default(false),
  })
  .refine(
    (data) => {
      // Data integrity check: if both chart_ids and chart_positions are provided, they must have the same length
      if (data.chart_ids && data.chart_positions) {
        return data.chart_ids.length === data.chart_positions.length;
      }
      return true;
    },
    {
      message: 'chart_ids and chart_positions arrays must have the same length',
      path: ['chart_positions'],
    }
  );

// Dashboard update schema - make all fields optional and remove defaults
// This ensures that only fields explicitly provided are updated
export const dashboardUpdateSchema = dashboardCreateSchema
  .partial()
  .omit({ is_published: true, is_active: true })
  .extend({
    is_published: z.boolean().optional(),
    is_active: z.boolean().optional(),
  });

export const dashboardParamsSchema = z.object({
  dashboardId: uuidSchema,
});

// Favorites Schemas
export const favoriteCreateSchema = z.object({
  chart_definition_id: uuidSchema,
});

export const favoriteDeleteSchema = z.object({
  chart_definition_id: uuidSchema,
});

// Query parameter schemas
export const analyticsQuerySchema = z.object({
  category_id: uuidSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().max(255).optional(),
  sort_by: z.enum(['name', 'created_at', 'updated_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Bulk operations schemas
export const bulkOperationSchema = z.object({
  operation: z.enum(['clone', 'delete', 'update', 'export']),
  chart_ids: z
    .array(uuidSchema)
    .min(1, 'At least one chart ID required')
    .max(100, 'Too many charts'),
  dashboard_ids: z.array(uuidSchema).max(50, 'Too many dashboards').optional(),
  updates: z.record(z.string(), z.any()).optional(), // For bulk update operations
  export_format: z.enum(['json', 'csv', 'xlsx']).optional(),
});

// Data source validation
export const dataSourceSchema = z.object({
  source_name: nameSchema,
  connection_string: z.string().min(1, 'Connection string required'),
  source_type: z.enum(['postgresql', 'mysql', 'mongodb', 'rest_api']),
  credentials: z.record(z.string(), z.string()).optional(),
  is_active: z.boolean().default(true),
});

// Export type definitions for use in API routes
export type ChartCategoryCreate = z.infer<typeof chartCategoryCreateSchema>;
export type ChartCategoryUpdate = z.infer<typeof chartCategoryUpdateSchema>;
export type ChartDefinitionCreate = z.infer<typeof chartDefinitionCreateSchema>;
export type ChartDefinitionUpdate = z.infer<typeof chartDefinitionUpdateSchema>;
export type DashboardCreate = z.infer<typeof dashboardCreateSchema>;
export type DashboardUpdate = z.infer<typeof dashboardUpdateSchema>;
export type FavoriteCreate = z.infer<typeof favoriteCreateSchema>;
export type BulkOperation = z.infer<typeof bulkOperationSchema>;
export type DataSource = z.infer<typeof dataSourceSchema>;
