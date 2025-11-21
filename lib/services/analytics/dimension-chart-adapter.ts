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
import type { DimensionValue } from '@/lib/types/dimensions';
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
}
