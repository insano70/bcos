/**
 * Dimension Expansion Validation Schemas
 *
 * Zod validation schemas for dimension expansion API requests.
 *
 * Frontend sends finalChartConfig and runtimeFilters from base chart rendering
 * to eliminate metadata re-fetching and ensure consistency.
 *
 * Phase 1: Added support for value-level selections to prevent combinatorial explosion.
 */

import { z } from 'zod';
import { DIMENSION_EXPANSION_LIMITS, MAX_PARALLEL_DIMENSION_CHARTS } from '@/lib/constants/dimension-expansion';

/**
 * Value-level selection schema (Phase 1)
 *
 * Allows users to select specific values within a dimension
 * instead of expanding by all values.
 */
const dimensionValueSelectionSchema = z.object({
  columnName: z
    .string()
    .min(1, 'Column name is required')
    .max(100, 'Column name too long')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Invalid column name format'),
  selectedValues: z
    .array(z.union([z.string(), z.number()]))
    .min(1, 'At least one value must be selected')
    .max(20, 'Maximum 20 values per dimension'),
  displayName: z.string().optional(),
});

/**
 * Multi-dimension expansion request schema
 *
 * Requires dimensionColumns array (1-3 dimensions) to prevent cartesian explosion.
 * Reuses finalChartConfig and runtimeFilters from base chart rendering.
 *
 * Phase 1: Added optional `selections` for value-level filtering.
 * When `selections` is provided, it takes precedence over `dimensionColumns`.
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
  // Phase 1: Optional value-level selections
  // When provided, only selected values are used (prevents combinatorial explosion)
  selections: z
    .array(dimensionValueSelectionSchema)
    .max(3, 'Maximum 3 dimension selections allowed')
    .optional(),
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

/**
 * Value-level expansion request schema (Phase 1)
 *
 * Alternative to multi-dimension expansion that uses explicit value selections
 * instead of discovering all values. This prevents combinatorial explosion
 * by letting users control exactly which values are expanded.
 */
export const valueLevelExpansionRequestSchema = z.object({
  selections: z
    .array(dimensionValueSelectionSchema)
    .min(1, 'At least one selection required')
    .max(3, 'Maximum 3 dimension selections allowed'),
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

export type ValueLevelExpansionRequestValidated = z.infer<typeof valueLevelExpansionRequestSchema>;

export type MultiDimensionExpansionRequestValidated = z.infer<
  typeof multiDimensionExpansionRequestSchema
>;

// Legacy schema for backward compatibility if needed, but we prefer strict multi-dim
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
