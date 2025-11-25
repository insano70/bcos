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
 * Handles "Other" values specially:
 * - Tracks which dimensions have "Other" values
 * - Includes excludeValues for proper NOT IN filtering
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
 *   ...
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

  // Pre-compute non-Other values per column for excludeValues in "Other" combinations
  const nonOtherValuesByColumn: Record<string, Array<string | number>> = {};
  for (const col of columns) {
    const values = dimensionValuesByColumn[col];
    if (values) {
      nonOtherValuesByColumn[col] = values
        .filter((v) => !v.isOther)
        .map((v) => v.value);
    }
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
    return values.map((value) => {
      const combination: DimensionValueCombination = {
        values: { [column]: value.value },
        label: value.label,
        ...(value.recordCount !== undefined && { recordCount: value.recordCount }),
      };

      // Handle "Other" value
      if (value.isOther) {
        combination.isOther = true;
        combination.otherDimensions = [column];
        combination.excludeValues = {
          [column]: nonOtherValuesByColumn[column] || [],
        };
      }

      return combination;
    });
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
   * @param currentOtherDimensions - Dimensions with "Other" value in this combination
   */
  function generateRecursive(
    columnIndex: number,
    currentValues: Record<string, string | number>,
    currentLabels: string[],
    currentRecordCounts: number[],
    currentOtherDimensions: string[]
  ): void {
    // Base case: all columns processed, save combination
    if (columnIndex === columns.length) {
      // Estimate record count as minimum of individual dimension counts
      // (intersection will have at most the smallest dimension's count)
      const estimatedRecordCount = currentRecordCounts.length > 0
        ? Math.min(...currentRecordCounts)
        : undefined;

      const combination: DimensionValueCombination = {
        values: { ...currentValues },
        label: currentLabels.join(' - '),
        ...(estimatedRecordCount !== undefined && { recordCount: estimatedRecordCount }),
      };

      // Handle "Other" combinations
      if (currentOtherDimensions.length > 0) {
        combination.isOther = true;
        combination.otherDimensions = [...currentOtherDimensions];
        combination.excludeValues = {};
        for (const otherCol of currentOtherDimensions) {
          combination.excludeValues[otherCol] = nonOtherValuesByColumn[otherCol] || [];
        }
      }

      combinations.push(combination);
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

      // Track if this value is "Other"
      const otherDimensions = value.isOther
        ? [...currentOtherDimensions, column]
        : currentOtherDimensions;

      generateRecursive(
        columnIndex + 1,
        { ...currentValues, [column]: value.value },
        [...currentLabels, value.label],
        recordCounts,
        otherDimensions
      );
    }
  }

  generateRecursive(0, {}, [], [], []);
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
