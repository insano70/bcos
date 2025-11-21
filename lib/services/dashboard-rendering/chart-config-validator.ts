/**
 * Chart Config Validator
 *
 * Validates chart definitions before config building.
 * Catches configuration errors early in the pipeline.
 *
 * Single Responsibility:
 * - Validate chart definition structure
 * - Validate data source configuration
 * - Validate chart-type-specific requirements
 * - Validate date ranges
 * - Validate practice UIDs
 * - Validate against template requirements
 */

import { log } from '@/lib/logger';
import type { ChartDefinition, ResolvedFilters } from './types';
import { configTemplatesRegistry } from './config-templates';

/**
 * Validation result for chart config
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Chart types that require measure-based data
 */
const MEASURE_BASED_CHART_TYPES = [
  'line',
  'bar',
  'stacked-bar',
  'horizontal-bar',
  'area',
  'pie',
  'doughnut',
  'dual-axis',
  'number',
  'progress-bar',
] as const;

/**
 * Valid chart types
 */
const VALID_CHART_TYPES = [
  ...MEASURE_BASED_CHART_TYPES,
  'table', // table-based
] as const;

/**
 * Data source filter (from chart definition)
 */
interface DataSourceFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

/**
 * Chart Config Validator
 *
 * Validates chart definitions and returns structured validation results.
 * Separates errors (fatal) from warnings (non-fatal).
 */
export class ChartConfigValidator {
  /**
   * Validate chart definition
   *
   * Performs comprehensive validation of chart definition and universal filters.
   * Returns structured result with errors and warnings.
   *
   * @param chart - Chart definition to validate
   * @param universalFilters - Universal filters for context
   * @returns Validation result with errors and warnings
   */
  validate(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this.validateStructure(chart, errors);
    this.validateDataSource(chart, errors, warnings);
    this.validateChartTypeRequirements(chart, errors, warnings);
    this.validateDateRange(universalFilters, errors);
    this.validatePracticeUids(universalFilters, errors, warnings);

    const isValid = errors.length === 0;

    // Log validation results
    if (!isValid) {
      log.error(
        'Chart config validation failed',
        new Error(errors.join(', ')),
        {
          chartId: chart.chart_definition_id,
          chartName: chart.chart_name,
          errors,
          warnings,
          component: 'chart-config-validator',
        }
      );
    } else if (warnings.length > 0) {
      log.warn('Chart config validation warnings', {
        chartId: chart.chart_definition_id,
        chartName: chart.chart_name,
        warnings,
        component: 'chart-config-validator',
      });
    }

    return { isValid, errors, warnings };
  }

  /**
   * Validate basic structure
   *
   * Ensures required top-level fields are present and valid.
   *
   * @param chart - Chart definition
   * @param errors - Error array to append to
   */
  private validateStructure(chart: ChartDefinition, errors: string[]): void {
    if (!chart.chart_definition_id) {
      errors.push('Missing chart_definition_id');
    }

    if (!chart.chart_name) {
      errors.push('Missing chart_name');
    }

    if (!chart.chart_type) {
      errors.push('Missing chart_type');
    } else if (
      !VALID_CHART_TYPES.includes(
        chart.chart_type as (typeof VALID_CHART_TYPES)[number]
      )
    ) {
      errors.push(`Invalid chart_type: ${chart.chart_type}`);
    }
  }

  /**
   * Validate data source configuration
   *
   * Ensures data source ID is present and valid.
   * Validates against template requirements (non-fatal warnings).
   *
   * @param chart - Chart definition
   * @param errors - Error array to append to
   * @param warnings - Warning array to append to
   */
  private validateDataSource(
    chart: ChartDefinition,
    errors: string[],
    warnings: string[]
  ): void {
    const chartConfigTyped = chart.chart_config as { dataSourceId?: number };
    const dataSourceId = chartConfigTyped?.dataSourceId;

    if (!dataSourceId) {
      errors.push('Missing dataSourceId in chart_config');
    } else if (dataSourceId <= 0) {
      errors.push(`Invalid dataSourceId: ${dataSourceId} (must be positive)`);
    }

    // Validate against template requirements (warnings only)
    if (chart.chart_type) {
      const templateValidation = configTemplatesRegistry.validateAgainstTemplate(
        chart.chart_type,
        chartConfigTyped || {}
      );

      if (!templateValidation.isValid) {
        for (const field of templateValidation.missingFields) {
          warnings.push(
            `Missing recommended field for ${chart.chart_type}: ${field}`
          );
        }
      }
    }
  }

  /**
   * Validate chart-type-specific requirements
   *
   * Validates requirements specific to each chart type:
   * - Measure-based charts: frequency required
   * - Dual-axis charts: dualAxisConfig required
   * - Progress bar charts: aggregation recommended
   *
   * @param chart - Chart definition
   * @param errors - Error array to append to
   * @param warnings - Warning array to append to
   */
  private validateChartTypeRequirements(
    chart: ChartDefinition,
    errors: string[],
    warnings: string[]
  ): void {
    if (
      !MEASURE_BASED_CHART_TYPES.includes(
        chart.chart_type as (typeof MEASURE_BASED_CHART_TYPES)[number]
      )
    ) {
      return;
    }

    const dataSource = chart.data_source as { filters?: DataSourceFilter[] };
    const filters = dataSource?.filters || [];
    const chartConfigTyped = chart.chart_config as {
      frequency?: string;
      dualAxisConfig?: unknown;
      aggregation?: string;
    };

    // Check for frequency (required for measure-based charts)
    const hasFrequency =
      filters.some((f) => f.field === 'frequency' && f.value) ||
      chartConfigTyped.frequency;

    if (!hasFrequency && chart.chart_type !== 'dual-axis') {
      warnings.push(
        'Measure-based chart missing frequency filter (will use default)'
      );
    }

    // Dual-axis specific validation
    if (chart.chart_type === 'dual-axis' && !chartConfigTyped.dualAxisConfig) {
      errors.push('Dual-axis chart missing dualAxisConfig');
    }

    // Progress bar specific validation
    if (chart.chart_type === 'progress-bar' && !chartConfigTyped.aggregation) {
      warnings.push(
        'Progress bar chart missing aggregation (will use default)'
      );
    }
  }

  /**
   * Validate date range consistency
   *
   * Ensures startDate is before endDate if both are present.
   *
   * @param universalFilters - Universal filters
   * @param errors - Error array to append to
   */
  private validateDateRange(
    universalFilters: ResolvedFilters,
    errors: string[]
  ): void {
    const { startDate, endDate } = universalFilters;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        errors.push(
          `Invalid date range: startDate (${startDate}) is after endDate (${endDate})`
        );
      }
    }
  }

  /**
   * Validate practice UIDs
   *
   * Ensures practice UIDs are valid positive numbers.
   * Warns if empty array (may result in no data).
   *
   * @param universalFilters - Universal filters
   * @param errors - Error array to append to
   * @param warnings - Warning array to append to
   */
  private validatePracticeUids(
    universalFilters: ResolvedFilters,
    errors: string[],
    warnings: string[]
  ): void {
    const { practiceUids } = universalFilters;

    if (practiceUids && Array.isArray(practiceUids)) {
      if (practiceUids.length === 0) {
        warnings.push('Empty practiceUids array may result in no data');
      }

      // Check for invalid practice UIDs
      const invalidPractices = practiceUids.filter(
        (p) => typeof p !== 'number' || p <= 0
      );
      if (invalidPractices.length > 0) {
        errors.push(`Invalid practice UIDs: ${invalidPractices.join(', ')}`);
      }
    }
  }
}
