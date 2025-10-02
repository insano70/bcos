import type { ChartDefinition, ChartFilter, ChartOrderBy } from '@/lib/types/analytics';

/**
 * Chart Templates
 * Predefined chart definitions for common use cases
 */

export const CHART_TEMPLATES = {
  CHARGES_VS_PAYMENTS: {
    chart_name: 'Charges vs Payments',
    chart_description: 'Monthly comparison of charges and payments by practice',
    chart_type: 'bar' as const,
    data_source: {
      table: 'ih.gr_app_measures',
      filters: [
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
        {
          field: 'measure',
          operator: 'in',
          value: ['Charges by Practice', 'Payments by Practice'],
        },
      ] as ChartFilter[],
      orderBy: [{ field: 'period_end', direction: 'ASC' }] as ChartOrderBy[],
    },
    chart_config: {
      x_axis: {
        field: 'period_end',
        label: 'Period',
        format: 'date' as const,
      },
      y_axis: {
        field: 'measure_value',
        label: 'Amount ($)',
        format: 'currency' as const,
      },
      series: {
        groupBy: 'measure',
        colorPalette: 'default',
      },
      options: {
        responsive: true,
        showLegend: true,
        showTooltips: true,
        animation: true,
      },
    },
    access_control: {
      roles: ['admin', 'super_admin'],
      practices: [],
      providers: [],
    },
    is_active: true,
  },

  PRACTICE_REVENUE_TREND: {
    chart_name: 'Practice Revenue Trend',
    chart_description: 'Monthly revenue tracking for practices',
    chart_type: 'line' as const,
    data_source: {
      table: 'ih.gr_app_measures',
      filters: [
        { field: 'measure', operator: 'eq', value: 'Charges by Practice' },
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
      ],
      orderBy: [{ field: 'date_index', direction: 'DESC' }] as ChartOrderBy[],
      limit: 12,
    },
    chart_config: {
      x_axis: {
        field: 'period_start',
        label: 'Period',
        format: 'date' as const,
      },
      y_axis: {
        field: 'measure_value',
        label: 'Revenue ($)',
        format: 'currency' as const,
      },
      series: {
        groupBy: 'practice_uid',
        colorPalette: 'default',
      },
      options: {
        responsive: true,
        showLegend: true,
        showTooltips: true,
        animation: true,
      },
    },
    access_control: {
      roles: ['admin', 'manager'],
      practices: [],
      providers: [],
    },
    is_active: true,
  },

  PROVIDER_PERFORMANCE: {
    chart_name: 'Provider Performance Comparison',
    chart_description: 'Monthly provider performance metrics',
    chart_type: 'bar' as const,
    data_source: {
      table: 'ih.gr_app_measures',
      filters: [
        { field: 'measure', operator: 'eq', value: 'Charges by Provider' },
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
      ],
      groupBy: ['provider_uid', 'period_start'],
      orderBy: [{ field: 'measure_value', direction: 'DESC' as const }],
      limit: 20,
    },
    chart_config: {
      x_axis: {
        field: 'provider_uid',
        label: 'Provider',
        format: 'string' as const,
      },
      y_axis: {
        field: 'measure_value',
        label: 'Charges ($)',
        format: 'currency' as const,
      },
      options: {
        responsive: true,
        showLegend: false,
        showTooltips: true,
        animation: true,
      },
    },
    access_control: {
      roles: ['admin', 'manager'],
      practices: [],
      providers: [],
    },
    is_active: true,
  },
} as const;

/**
 * Create chart definition from template
 */
export function createChartFromTemplate(
  templateKey: keyof typeof CHART_TEMPLATES,
  createdByUserId: string,
  overrides: Partial<ChartDefinition> = {}
): Omit<ChartDefinition, 'chart_definition_id' | 'created_at' | 'updated_at'> {
  const template = CHART_TEMPLATES[templateKey];

  const baseTemplate = {
    ...template,
    created_by: createdByUserId,
  };

  const result = {
    ...baseTemplate,
    ...overrides,
  } as Omit<ChartDefinition, 'chart_definition_id' | 'created_at' | 'updated_at'>;

  return result;
}
