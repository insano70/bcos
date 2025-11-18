/**
 * Dimension Expansion Validation Schemas
 *
 * Zod validation schemas for dimension expansion API requests
 */

import { z } from 'zod';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';

/**
 * Dimension expansion request validation schema
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
  baseFilters: z.record(z.string(), z.unknown()).optional().default({}),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(DIMENSION_EXPANSION_LIMITS.MAXIMUM)
    .optional()
    .default(DIMENSION_EXPANSION_LIMITS.DEFAULT),
});

export type DimensionExpansionRequestValidated = z.infer<typeof dimensionExpansionRequestSchema>;

