/**
 * Dimension Expansion Validation Schemas
 *
 * Zod validation schemas for dimension expansion API requests.
 *
 * Frontend sends finalChartConfig and runtimeFilters from base chart rendering
 * to eliminate metadata re-fetching and ensure consistency.
 */

import { z } from 'zod';
import { DIMENSION_EXPANSION_LIMITS, MAX_PARALLEL_DIMENSION_CHARTS } from '@/lib/constants/dimension-expansion';

/**
 * Dimension expansion request schema
 *
 * Requires finalChartConfig and runtimeFilters from the base chart rendering.
 */
export const dimensionExpansionConfigRequestSchema = z.object({
  dimensionColumn: z
    .string()
    .min(1, 'Dimension column is required')
    .max(100, 'Dimension column name too long')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Invalid column name format'
    ),
  finalChartConfig: z.record(z.string(), z.unknown()),
  runtimeFilters: z.record(z.string(), z.unknown()),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PARALLEL_DIMENSION_CHARTS)
    .optional()
    .default(DIMENSION_EXPANSION_LIMITS.DEFAULT),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .default(0),
});

export type DimensionExpansionConfigRequestValidated = z.infer<typeof dimensionExpansionConfigRequestSchema>;

/**
 * Multi-dimension expansion request schema
 *
 * Requires dimensionColumns array (1-3 dimensions) to prevent cartesian explosion.
 * Reuses finalChartConfig and runtimeFilters from base chart rendering.
 */
export const multiDimensionExpansionRequestSchema = z.object({
  dimensionColumns: z
    .array(
      z
        .string()
        .min(1, 'Dimension column is required')
        .max(100, 'Dimension column name too long')
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid column name format')
    )
    .min(1, 'At least one dimension required')
    .max(3, 'Maximum 3 dimensions allowed'),
  finalChartConfig: z.record(z.string(), z.unknown()),
  runtimeFilters: z.record(z.string(), z.unknown()),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PARALLEL_DIMENSION_CHARTS)
    .optional()
    .default(DIMENSION_EXPANSION_LIMITS.DEFAULT),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .default(0),
});

export type MultiDimensionExpansionRequestValidated = z.infer<
  typeof multiDimensionExpansionRequestSchema
>;

