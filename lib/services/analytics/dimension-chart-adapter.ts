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
   * Process:
   * 1. For each dimension value
   * 2. Clone base chart config
   * 3. Add dimension filter to advancedFilters
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
    return dimensionValues.map((dimensionValue) => {
      // Extract existing advanced filters
      const existingFilters = Array.isArray(baseConfig.runtimeFilters.advancedFilters)
        ? (baseConfig.runtimeFilters.advancedFilters as ChartFilter[])
        : [];

      // Create dimension filter
      const dimensionFilter: ChartFilter = {
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
   * Example: Location=Downtown AND LineOfBusiness=PhysicalTherapy
   *
   * Process:
   * 1. For each dimension value combination
   * 2. Clone base chart config
   * 3. Add ALL dimension filters to advancedFilters (one per dimension in combination)
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
    return combinations.map((combination) => {
      // Extract existing advanced filters
      const existingFilters = Array.isArray(baseConfig.runtimeFilters.advancedFilters)
        ? (baseConfig.runtimeFilters.advancedFilters as ChartFilter[])
        : [];

      // Create dimension filters (one per dimension in combination)
      const dimensionFilters: ChartFilter[] = Object.entries(combination.values).map(
        ([field, value]) => ({
          field,
          operator: 'eq',
          value,
        })
      );

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
