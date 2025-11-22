/**
 * Dimension Combinations Utility
 *
 * Pure utility functions for generating cartesian products of dimension values.
 * Used for multi-dimension chart expansion.
 *
 * Single Responsibility: Cartesian product generation
 */

import type { DimensionValue, DimensionValueCombination } from '@/lib/types/dimensions';

/**
 * Generate cartesian product of dimension values
 *
 * Creates all possible combinations of dimension values across multiple dimensions.
 * For single dimension, converts to combination format for consistency.
 *
 * Example:
 * Input: {
 *   location: [
 *     { value: "downtown", label: "Downtown Clinic" },
 *     { value: "uptown", label: "Uptown Clinic" }
 *   ],
 *   line_of_business: [
 *     { value: "pt", label: "Physical Therapy" },
 *     { value: "ot", label: "Occupational Therapy" }
 *   ]
 * }
 *
 * Output: [
 *   {
 *     values: { location: "downtown", line_of_business: "pt" },
 *     label: "Downtown Clinic - Physical Therapy"
 *   },
 *   {
 *     values: { location: "downtown", line_of_business: "ot" },
 *     label: "Downtown Clinic - Occupational Therapy"
 *   },
 *   {
 *     values: { location: "uptown", line_of_business: "pt" },
 *     label: "Uptown Clinic - Physical Therapy"
 *   },
 *   {
 *     values: { location: "uptown", line_of_business: "ot" },
 *     label: "Uptown Clinic - Occupational Therapy"
 *   }
 * ]
 *
 * @param dimensionValuesByColumn - Map of column name to dimension values
 * @returns Array of all combinations with composed labels
 */
export function generateDimensionCombinations(
  dimensionValuesByColumn: Record<string, DimensionValue[]>
): DimensionValueCombination[] {
  const columns = Object.keys(dimensionValuesByColumn);

  if (columns.length === 0) {
    return [];
  }

  // Single dimension - convert to combination format for consistency
  if (columns.length === 1) {
    const column = columns[0];
    if (!column) {
      return [];
    }
    const values = dimensionValuesByColumn[column];
    if (!values) {
      return [];
    }
    return values.map((value) => ({
      values: { [column]: value.value },
      label: value.label,
      ...(value.recordCount !== undefined && { recordCount: value.recordCount }),
    }));
  }

  // Multiple dimensions - generate cartesian product
  const combinations: DimensionValueCombination[] = [];

  /**
   * Recursive helper to generate all combinations
   *
   * @param columnIndex - Current column index in iteration
   * @param currentValues - Accumulated values so far
   * @param currentLabels - Accumulated labels so far
   * @param currentRecordCounts - Accumulated record counts for estimation
   */
  function generateRecursive(
    columnIndex: number,
    currentValues: Record<string, string | number>,
    currentLabels: string[],
    currentRecordCounts: number[]
  ): void {
    // Base case: all columns processed, save combination
    if (columnIndex === columns.length) {
      // Estimate record count as minimum of individual dimension counts
      // (intersection will have at most the smallest dimension's count)
      const estimatedRecordCount = currentRecordCounts.length > 0
        ? Math.min(...currentRecordCounts)
        : undefined;

      combinations.push({
        values: { ...currentValues },
        label: currentLabels.join(' - '),
        ...(estimatedRecordCount !== undefined && { recordCount: estimatedRecordCount }),
      });
      return;
    }

    // Recursive case: iterate through values for current column
    const column = columns[columnIndex];
    if (!column) {
      return;
    }
    const values = dimensionValuesByColumn[column];
    if (!values) {
      return;
    }

    for (const value of values) {
      const recordCounts = value.recordCount !== undefined
        ? [...currentRecordCounts, value.recordCount]
        : currentRecordCounts;

      generateRecursive(
        columnIndex + 1,
        { ...currentValues, [column]: value.value },
        [...currentLabels, value.label],
        recordCounts
      );
    }
  }

  generateRecursive(0, {}, [], []);
  return combinations;
}

/**
 * Calculate total combination count before generating
 *
 * Used for validation to prevent cartesian explosion.
 * Returns the product of all dimension value counts.
 *
 * Example:
 * - 2 locations × 3 lines of business = 6 combinations
 * - 5 providers × 4 payers × 3 locations = 60 combinations
 *
 * @param dimensionValuesByColumn - Map of column name to dimension values
 * @returns Total number of combinations (product of all value counts)
 */
export function calculateCombinationCount(
  dimensionValuesByColumn: Record<string, DimensionValue[]>
): number {
  const counts = Object.values(dimensionValuesByColumn).map((values) => values.length);

  // Handle empty inputs
  if (counts.length === 0) {
    return 0;
  }

  // Calculate product
  return counts.reduce((product, count) => product * count, 1);
}
