/**
 * Dimension Expansion Validation Schemas
 *
 * Zod validation schemas for dimension expansion API requests
 * 
 * PERFORMANCE OPTIMIZATION:
 * - NEW FORMAT: Accepts chartExecutionConfig (eliminates metadata re-fetching)
 * - OLD FORMAT: Accepts chartDefinitionId (backwards compatible)
 */

import { z } from 'zod';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';

/**
 * Simple config schema (for reuse path)
 * Just the raw configs from the base chart render
 */
const simpleConfigSchema = z.object({
  finalChartConfig: z.record(z.string(), z.unknown()),
  runtimeFilters: z.record(z.string(), z.unknown()),
});

/**
 * OLD FORMAT: Dimension expansion with chartDefinitionId (backwards compatible)
 */
export const dimensionExpansionRequestSchema = z.object({
  dimensionColumn: z
    .string()
    .min(1, 'Dimension column is required')
    .max(100, 'Dimension column name too long')
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      'Invalid column name format'
    ),
  chartDefinitionId: z.string().uuid().optional(),
  baseFilters: z.record(z.string(), z.unknown()).optional().default({}),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DIMENSION_EXPANSION_LIMITS.MAXIMUM)
    .optional()
    .default(DIMENSION_EXPANSION_LIMITS.DEFAULT),
});

/**
 * SIMPLE FORMAT: Dimension expansion with configs from base chart
 * 
 * Frontend sends the configs that were used to render the base chart.
 * Backend just reuses them - no fetching, no rebuilding!
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
  ...simpleConfigSchema.shape,
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DIMENSION_EXPANSION_LIMITS.MAXIMUM)
    .optional()
    .default(DIMENSION_EXPANSION_LIMITS.DEFAULT),
});

/**
 * Unified schema: Accepts either format
 */
export const dimensionExpansionUnifiedSchema = z.union([
  dimensionExpansionConfigRequestSchema, // NEW: Has chartExecutionConfig
  dimensionExpansionRequestSchema.extend({ chartDefinitionId: z.string().uuid() }), // OLD: Has chartDefinitionId
]);

export type DimensionExpansionRequestValidated = z.infer<typeof dimensionExpansionRequestSchema>;
export type DimensionExpansionConfigRequestValidated = z.infer<typeof dimensionExpansionConfigRequestSchema>;
export type DimensionExpansionUnifiedValidated = z.infer<typeof dimensionExpansionUnifiedSchema>;

