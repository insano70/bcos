import { z } from 'zod';
import { createSafeTextSchema } from './sanitization';

/**
 * Report Card Validation Schemas
 *
 * Zod schemas for validating report card API inputs.
 * Uses createSafeTextSchema for XSS protection on text fields.
 */

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Query parameters for fetching a report card
 */
export const reportCardQuerySchema = z.object({
  practiceUid: z.coerce.number().int().positive('Practice UID must be a positive integer'),
  trendPeriod: z.enum(['3_month', '6_month', '9_month']).optional(),
});

/**
 * URL parameters for report card routes
 */
export const reportCardParamsSchema = z.object({
  practiceUid: z.string().regex(/^\d+$/, 'Practice UID must be a number'),
});

/**
 * Query parameters for peer comparison
 */
export const peerComparisonQuerySchema = z.object({
  bucket: z.enum(['small', 'medium', 'large', 'xlarge', 'xxlarge']).optional(),
});

// =============================================================================
// Filter Criteria Schema
// =============================================================================

/**
 * Schema for filter criteria (WHERE clause conditions)
 * Validates that keys and values are safe strings
 */
export const filterCriteriaSchema = z.record(
  z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid column name'),
  z.string().max(255)
).default({});

// =============================================================================
// Measure CRUD Schemas
// =============================================================================

/**
 * Schema for creating a new measure configuration
 */
export const measureCreateSchema = z.object({
  measure_name: createSafeTextSchema(1, 100, 'Measure name'),
  display_name: createSafeTextSchema(1, 100, 'Display name'),
  weight: z.coerce
    .number()
    .min(1, 'Weight must be at least 1')
    .max(10, 'Weight cannot exceed 10')
    .default(5),
  higher_is_better: z.boolean().default(true),
  format_type: z.enum(['number', 'currency', 'percentage']).default('number'),
  // Data source and filtering configuration
  data_source_id: z.coerce.number().int().positive().nullable().optional(),
  value_column: createSafeTextSchema(1, 100, 'Value column').default('numeric_value'),
  filter_criteria: filterCriteriaSchema,
});

/**
 * Schema for updating an existing measure configuration
 */
export const measureUpdateSchema = z.object({
  measure_name: createSafeTextSchema(1, 100, 'Measure name').optional(),
  display_name: createSafeTextSchema(1, 100, 'Display name').optional(),
  weight: z.coerce
    .number()
    .min(1, 'Weight must be at least 1')
    .max(10, 'Weight cannot exceed 10')
    .optional(),
  higher_is_better: z.boolean().optional(),
  format_type: z.enum(['number', 'currency', 'percentage']).optional(),
  is_active: z.boolean().optional(),
  // Data source and filtering configuration
  data_source_id: z.coerce.number().int().positive().nullable().optional(),
  value_column: createSafeTextSchema(1, 100, 'Value column').optional(),
  filter_criteria: filterCriteriaSchema.optional(),
});

/**
 * URL parameters for measure routes
 */
export const measureParamsSchema = z.object({
  measureId: z.string().regex(/^\d+$/, 'Measure ID must be a number'),
});

/**
 * Query parameters for listing measures
 */
export const measureQuerySchema = z.object({
  is_active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// =============================================================================
// Size Bucket Configuration Schema
// =============================================================================

/**
 * Schema for configuring size bucket percentile thresholds
 */
export const sizeBucketConfigSchema = z.object({
  small_max_percentile: z.coerce
    .number()
    .min(0, 'Percentile must be at least 0')
    .max(100, 'Percentile cannot exceed 100')
    .default(25),
  medium_max_percentile: z.coerce
    .number()
    .min(0, 'Percentile must be at least 0')
    .max(100, 'Percentile cannot exceed 100')
    .default(50),
  large_max_percentile: z.coerce
    .number()
    .min(0, 'Percentile must be at least 0')
    .max(100, 'Percentile cannot exceed 100')
    .default(75),
}).refine(
  (data) =>
    data.small_max_percentile < data.medium_max_percentile &&
    data.medium_max_percentile < data.large_max_percentile,
  {
    message: 'Percentile thresholds must be in ascending order (small < medium < large)',
    path: ['small_max_percentile'],
  }
);

// =============================================================================
// Generation Request Schema
// =============================================================================

/**
 * Schema for triggering report card generation
 */
export const generateRequestSchema = z.object({
  practiceUid: z.coerce.number().int().positive().optional(),
  force: z.boolean().default(false),
  /** When true, clears all report card data before regenerating */
  reset: z.boolean().default(false),
  /** When true, generates report cards for all historical months */
  historical: z.boolean().default(false),
  /** Number of historical months to generate (default 24) */
  historicalMonths: z.coerce.number().int().min(1).max(36).default(24),
});

// =============================================================================
// Location Comparison Schema
// =============================================================================

/**
 * Query parameters for location comparison
 */
export const locationComparisonQuerySchema = z.object({
  measure: createSafeTextSchema(1, 100, 'Measure name').optional(),
});

// =============================================================================
// Trend Query Schema
// =============================================================================

/**
 * Query parameters for trends endpoint
 */
export const trendQuerySchema = z.object({
  period: z.enum(['3_month', '6_month', '9_month']).optional(),
});

// =============================================================================
// Refined Schemas with Business Logic
// =============================================================================

/**
 * Refined create schema ensuring at least measure_name is provided
 */
export const measureCreateRefinedSchema = measureCreateSchema.refine(
  (data) => data.measure_name && data.measure_name.trim().length > 0,
  {
    message: 'Measure name is required',
    path: ['measure_name'],
  }
);

/**
 * Refined update schema ensuring at least one field is provided
 */
export const measureUpdateRefinedSchema = measureUpdateSchema.refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  {
    message: 'At least one field must be provided for update',
  }
);

// =============================================================================
// Type Exports
// =============================================================================

export type FilterCriteriaInput = z.infer<typeof filterCriteriaSchema>;
export type ReportCardQueryInput = z.infer<typeof reportCardQuerySchema>;
export type ReportCardParamsInput = z.infer<typeof reportCardParamsSchema>;
export type PeerComparisonQueryInput = z.infer<typeof peerComparisonQuerySchema>;
export type MeasureCreateInput = z.infer<typeof measureCreateSchema>;
export type MeasureUpdateInput = z.infer<typeof measureUpdateSchema>;
export type MeasureParamsInput = z.infer<typeof measureParamsSchema>;
export type MeasureQueryInput = z.infer<typeof measureQuerySchema>;
export type SizeBucketConfigInput = z.infer<typeof sizeBucketConfigSchema>;
export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;
export type LocationComparisonQueryInput = z.infer<typeof locationComparisonQuerySchema>;
export type TrendQueryInput = z.infer<typeof trendQuerySchema>;
