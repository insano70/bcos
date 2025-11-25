/**
 * Dimension Chart Adapter
 *
 * Adapts chart execution configs for dimension expansion by injecting
 * dimension-specific filters into the config's advanced filters array.
 *
 * Single Responsibility: Transform base configs into dimension-specific configs
 *
 * Benefits:
 * - Focused 80-line service
 * - Reuses existing BatchExecutorService infrastructure
 * - Type-safe filter injection
 * - Clear separation of concerns
 */

import type { ChartExecutionConfig } from '@/lib/services/dashboard-rendering/types';
import type { DimensionValue, DimensionValueCombination } from '@/lib/types/dimensions';
import type { ChartFilter } from '@/lib/types/analytics';
import { log } from '@/lib/logger';

/**
 * Dimension Chart Adapter
 *
 * Creates dimension-specific chart configs by adding dimension filters.
 */
export class DimensionChartAdapter {
  /**
   * Create chart execution configs for each dimension value
   *
   * Takes a base chart config and creates N copies, each with a
   * dimension filter added to the advancedFilters array.
   *
   * Handles "Other" values specially:
   * - For "Other" values, uses NOT IN filter with all non-Other values
   * - For regular values, uses EQ filter
   *
   * Process:
   * 1. For each dimension value
   * 2. Clone base chart config
   * 3. Add dimension filter to advancedFilters (EQ or NOT IN)
   * 4. Generate unique chart ID
   *
   * @param dimensionValues - Array of dimension values to expand
   * @param baseConfig - Base chart execution config
   * @param dimensionColumn - Column name for dimension filter
   * @returns Array of dimension-specific chart configs
   */
  createDimensionConfigs(
    dimensionValues: DimensionValue[],
    baseConfig: ChartExecutionConfig,
    dimensionColumn: string
  ): ChartExecutionConfig[] {
    // Pre-compute non-Other values for NOT IN filter
    const nonOtherValues = dimensionValues
      .filter((v) => !v.isOther)
      .map((v) => v.value);

    return dimensionValues.map((dimensionValue) => {
      // Extract existing advanced filters
      const existingFilters = Array.isArray(baseConfig.runtimeFilters.advancedFilters)
        ? (baseConfig.runtimeFilters.advancedFilters as ChartFilter[])
        : [];

      // Create dimension filter - use NOT IN for "Other", EQ for regular values
      const dimensionFilter: ChartFilter = dimensionValue.isOther
        ? {
            field: dimensionColumn,
            operator: 'not_in',
            // Cast to string[] - dimension values are typically strings
            value: nonOtherValues as string[],
          }
        : {
            field: dimensionColumn,
            operator: 'eq',
            value: dimensionValue.value,
          };

      // Build dimension-specific runtime filters
      const dimensionRuntimeFilters: Record<string, unknown> = {
        ...baseConfig.runtimeFilters,
        advancedFilters: [...existingFilters, dimensionFilter],
      };

      // Create dimension-specific config
      const dimensionConfig: ChartExecutionConfig = {
        ...baseConfig,
        // Generate unique chart ID for this dimension value
        chartId: `${baseConfig.chartId}-dim-${this.sanitizeDimensionValue(dimensionValue.value)}`,
        // Override runtime filters with dimension-specific filters
        runtimeFilters: dimensionRuntimeFilters,
      };

      return dimensionConfig;
    });
  }

  /**
   * Create chart execution configs for each dimension value combination
   *
   * Takes a base chart config and creates N copies for multi-dimension expansion,
   * each with MULTIPLE dimension filters added to the advancedFilters array.
   *
   * Handles "Other" combinations specially:
   * - For dimensions marked as "Other", uses NOT IN filter with excluded values
   * - For regular dimensions, uses EQ filter
   *
   * Example: Location=Downtown AND LineOfBusiness=PhysicalTherapy
   * Example "Other": Location NOT IN [Downtown, Uptown] (for "Other" locations)
   *
   * Process:
   * 1. For each dimension value combination
   * 2. Clone base chart config
   * 3. Add dimension filters (EQ for regular, NOT IN for "Other")
   * 4. Generate unique chart ID
   *
   * @param combinations - Array of dimension value combinations (from cartesian product)
   * @param baseConfig - Base chart execution config
   * @returns Array of dimension-specific chart configs
   */
  createMultiDimensionConfigs(
    combinations: DimensionValueCombination[],
    baseConfig: ChartExecutionConfig
  ): ChartExecutionConfig[] {
    return combinations.map((combination, index) => {
      // Extract existing advanced filters
      const existingFilters = Array.isArray(baseConfig.runtimeFilters.advancedFilters)
        ? (baseConfig.runtimeFilters.advancedFilters as ChartFilter[])
        : [];

      // Create dimension filters (one per dimension in combination)
      // For "Other" dimensions, use NOT IN filter; for regular, use EQ
      const dimensionFilters: ChartFilter[] = Object.entries(combination.values).map(
        ([field, value]) => {
          // Check if this dimension is an "Other" dimension
          const isOtherDimension = combination.otherDimensions?.includes(field);

          if (isOtherDimension && combination.excludeValues?.[field]) {
            // For "Other" dimension: use NOT IN filter with excluded values
            return {
              field,
              operator: 'not_in',
              // Cast to string[] - dimension values are typically strings
              value: combination.excludeValues[field] as string[],
            };
          }

          // For regular dimension: use EQ filter
          return {
            field,
            operator: 'eq',
            value,
          };
        }
      );

      if (index < 3) {
        log.debug('Creating config for dimension combination', {
          combinationIndex: index,
          combinationLabel: combination.label,
          combinationValues: combination.values,
          isOther: combination.isOther,
          otherDimensions: combination.otherDimensions,
          existingFilterCount: existingFilters.length,
          dimensionFilterCount: dimensionFilters.length,
          dimensionFilters: dimensionFilters.map((f) => ({
            field: f.field,
            operator: f.operator,
            valueType: Array.isArray(f.value) ? 'array' : typeof f.value,
            valueCount: Array.isArray(f.value) ? f.value.length : 1,
          })),
          component: 'dimension-chart-adapter',
        });
      }

      // Build dimension-specific runtime filters
      const dimensionRuntimeFilters: Record<string, unknown> = {
        ...baseConfig.runtimeFilters,
        advancedFilters: [...existingFilters, ...dimensionFilters], // Append ALL dimension filters
      };

      // Create dimension-specific config
      const dimensionConfig: ChartExecutionConfig = {
        ...baseConfig,
        // Generate unique chart ID for this combination
        chartId: `${baseConfig.chartId}-multi-dim-${this.sanitizeCombinationLabel(combination.label)}`,
        // Override runtime filters with dimension-specific filters
        runtimeFilters: dimensionRuntimeFilters,
      };

      return dimensionConfig;
    });
  }

  /**
   * Sanitize dimension value for use in chart ID
   *
   * Removes special characters and spaces to create valid identifiers.
   *
   * @param value - Raw dimension value
   * @returns Sanitized value safe for IDs
   */
  private sanitizeDimensionValue(value: string | number): string {
    return String(value)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  /**
   * Sanitize combination label for use in chart ID
   *
   * Removes special characters and spaces to create valid identifiers.
   *
   * @param label - Combination label (e.g., "Downtown - Physical Therapy")
   * @returns Sanitized label safe for IDs
   */
  private sanitizeCombinationLabel(label: string): string {
    return label
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }
}
