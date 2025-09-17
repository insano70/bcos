import type { ChartDefinition, ChartFilter, ChartDataSourceConfig } from '@/lib/types/analytics';
import { logger } from '@/lib/logger';

/**
 * Chart Definition Validation Service
 * Validates chart configurations for security and correctness
 */

// Allowed tables - whitelist approach for security
const ALLOWED_TABLES = ['ih.gr_app_measures'] as const;

// Allowed fields for ih.gr_app_measures table
const ALLOWED_FIELDS = [
  'practice_uid',
  'provider_uid', 
  'measure',
  'measure_format',
  'period_based_on',
  'frequency',
  'period_start',
  'period_end',
  'date_index',
  'measure_value',
  'last_period_value',
  'last_year_value',
  'pct_change_vs_last_period',
  'pct_change_vs_last_year'
] as const;

// Allowed chart types
const ALLOWED_CHART_TYPES = ['line', 'bar', 'pie', 'doughnut', 'area'] as const;

// Allowed operators for filters
const ALLOWED_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'like', 'between'] as const;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ChartValidator {
  
  /**
   * Validate complete chart definition
   */
  validateChartDefinition(definition: Partial<ChartDefinition>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate required fields
    if (!definition.chart_name?.trim()) {
      errors.push('Chart name is required');
    }

    if (!definition.chart_type) {
      errors.push('Chart type is required');
    } else if (!ALLOWED_CHART_TYPES.includes(definition.chart_type as any)) {
      errors.push(`Invalid chart type: ${definition.chart_type}. Allowed: ${ALLOWED_CHART_TYPES.join(', ')}`);
    }

    if (!definition.data_source) {
      errors.push('Data source configuration is required');
    } else {
      const dataSourceValidation = this.validateDataSource(definition.data_source);
      errors.push(...dataSourceValidation.errors);
      warnings.push(...dataSourceValidation.warnings);
    }

    if (!definition.chart_config) {
      errors.push('Chart configuration is required');
    } else {
      const configValidation = this.validateChartConfig(definition.chart_config);
      errors.push(...configValidation.errors);
      warnings.push(...configValidation.warnings);
    }

    // Validate chart name length
    if (definition.chart_name && definition.chart_name.length > 255) {
      errors.push('Chart name must be 255 characters or less');
    }

    // Validate chart description length
    if (definition.chart_description && definition.chart_description.length > 1000) {
      warnings.push('Chart description is very long (over 1000 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate data source configuration
   */
  validateDataSource(dataSource: ChartDataSourceConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate table access
    if (!dataSource.table) {
      errors.push('Data source table is required');
    } else if (!ALLOWED_TABLES.includes(dataSource.table as any)) {
      errors.push(`Unauthorized table access: ${dataSource.table}. Allowed: ${ALLOWED_TABLES.join(', ')}`);
    }

    // Validate filters
    if (dataSource.filters) {
      for (const filter of dataSource.filters) {
        const filterValidation = this.validateFilter(filter);
        errors.push(...filterValidation.errors);
        warnings.push(...filterValidation.warnings);
      }
    }

    // Note: groupBy validation is handled in the chart series configuration

    // Validate orderBy fields
    if (dataSource.orderBy) {
      for (const orderBy of dataSource.orderBy) {
        if (!ALLOWED_FIELDS.includes(orderBy.field as any)) {
          errors.push(`Unauthorized orderBy field: ${orderBy.field}`);
        }
        if (!['ASC', 'DESC'].includes(orderBy.direction)) {
          errors.push(`Invalid orderBy direction: ${orderBy.direction}. Must be ASC or DESC`);
        }
      }
    }

    // Validate limit
    if (dataSource.limit && (dataSource.limit < 1 || dataSource.limit > 10000)) {
      warnings.push('Limit should be between 1 and 10000 for performance');
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate individual filter
   */
  validateFilter(filter: ChartFilter): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate field
    if (!filter.field) {
      errors.push('Filter field is required');
    } else if (!ALLOWED_FIELDS.includes(filter.field as any)) {
      errors.push(`Unauthorized filter field: ${filter.field}`);
    }

    // Validate operator
    if (!filter.operator) {
      errors.push('Filter operator is required');
    } else if (!ALLOWED_OPERATORS.includes(filter.operator as any)) {
      errors.push(`Invalid filter operator: ${filter.operator}. Allowed: ${ALLOWED_OPERATORS.join(', ')}`);
    }

    // Validate value based on operator
    if (filter.operator === 'in' || filter.operator === 'not_in') {
      if (!Array.isArray(filter.value)) {
        errors.push(`${filter.operator} operator requires array value`);
      } else if (filter.value.length === 0) {
        warnings.push(`${filter.operator} operator has empty array`);
      }
    }

    if (filter.operator === 'between') {
      if (!Array.isArray(filter.value) || filter.value.length !== 2) {
        errors.push('between operator requires array with exactly 2 values');
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate chart configuration
   */
  validateChartConfig(chartConfig: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate x_axis configuration
    if (!chartConfig.x_axis) {
      errors.push('X-axis configuration is required');
    } else {
      if (!chartConfig.x_axis.field) {
        errors.push('X-axis field is required');
      } else if (!ALLOWED_FIELDS.includes(chartConfig.x_axis.field)) {
        errors.push(`Unauthorized x-axis field: ${chartConfig.x_axis.field}`);
      }

      if (!chartConfig.x_axis.format) {
        warnings.push('X-axis format not specified');
      }
    }

    // Validate y_axis configuration
    if (!chartConfig.y_axis) {
      errors.push('Y-axis configuration is required');
    } else {
      if (!chartConfig.y_axis.field) {
        errors.push('Y-axis field is required');
      } else if (!ALLOWED_FIELDS.includes(chartConfig.y_axis.field)) {
        errors.push(`Unauthorized y-axis field: ${chartConfig.y_axis.field}`);
      }

      if (!chartConfig.y_axis.format) {
        warnings.push('Y-axis format not specified');
      }
    }

    // Validate series configuration (optional)
    if (chartConfig.series?.groupBy && !ALLOWED_FIELDS.includes(chartConfig.series.groupBy)) {
      errors.push(`Unauthorized series groupBy field: ${chartConfig.series.groupBy}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate chart definition for creation
   */
  validateForCreation(definition: Partial<ChartDefinition>): ValidationResult {
    const baseValidation = this.validateChartDefinition(definition);
    
    // Additional creation-specific validations
    if (!definition.created_by) {
      baseValidation.errors.push('created_by is required for creation');
    }

    return baseValidation;
  }

  /**
   * Validate chart definition for update
   */
  validateForUpdate(definition: Partial<ChartDefinition>): ValidationResult {
    // For updates, most fields are optional
    const errors: string[] = [];
    const warnings: string[] = [];

    // Only validate provided fields
    if (definition.chart_type && !ALLOWED_CHART_TYPES.includes(definition.chart_type as any)) {
      errors.push(`Invalid chart type: ${definition.chart_type}`);
    }

    if (definition.data_source) {
      const dataSourceValidation = this.validateDataSource(definition.data_source);
      errors.push(...dataSourceValidation.errors);
      warnings.push(...dataSourceValidation.warnings);
    }

    if (definition.chart_config) {
      const configValidation = this.validateChartConfig(definition.chart_config);
      errors.push(...configValidation.errors);
      warnings.push(...configValidation.warnings);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

// Export singleton instance
export const chartValidator = new ChartValidator();
