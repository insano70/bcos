import { apiClient } from '@/lib/api/client';
import type {
  ChartDefinition,
  ChartFilter,
  DualAxisConfig,
  MultipleSeriesConfig,
  PeriodComparisonConfig,
} from '@/lib/types/analytics';
import type { ChartConfig, DataSource } from './chart-builder-core';

interface SchemaInfo {
  fields: Record<string, unknown>;
  availableMeasures: Array<{ measure: string }>;
  availableFrequencies: Array<{ frequency: string }>;
  availableGroupByFields: Array<{ columnName: string; displayName: string }>;
}

/**
 * Find a data source by ID or table reference
 */
export async function findDataSource(
  dataSourceId?: number,
  tableReference?: string
): Promise<DataSource | null> {
  try {
    const response = await apiClient.get<{ dataSources: DataSource[] }>(
      '/api/admin/analytics/data-sources'
    );
    const dataSources = response.dataSources || [];

    // Try by ID first (most reliable)
    if (dataSourceId) {
      const found = dataSources.find((ds) => ds.id === dataSourceId);
      if (found) return found;
    }

    // Fall back to table reference matching
    if (tableReference) {
      const parts = tableReference.split('.');
      let schemaName: string;
      let tableName: string;

      if (parts.length === 2) {
        schemaName = parts[0]!;
        tableName = parts[1]!;
      } else if (parts.length === 1) {
        schemaName = 'ih'; // Default schema
        tableName = parts[0]!;
      } else {
        return null;
      }

      const found = dataSources.find(
        (ds) => ds.schemaName === schemaName && ds.tableName === tableName
      );
      if (found) return found;
    }

    return null;
  } catch (error) {
    console.error('Failed to find data source:', error);
    return null;
  }
}

/**
 * Parse a saved chart definition into ChartConfig format for editing
 */
export function parseChartForEdit(chart: ChartDefinition): Partial<ChartConfig> {
  const dataSource = chart.data_source as {
    table?: string;
    filters?: ChartFilter[];
    advancedFilters?: ChartFilter[];
  };
  const chartConfigData = (chart.chart_config as {
    calculatedField?: string;
    seriesConfigs?: MultipleSeriesConfig[];
    dateRangePreset?: string;
    series?: { groupBy?: string };
    dataSourceId?: number;
    colorPalette?: string;
    stackingMode?: 'normal' | 'percentage';
    periodComparison?: PeriodComparisonConfig;
    dualAxisConfig?: DualAxisConfig;
    frequency?: string;
  }) || {};

  // Extract filters
  const measureFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'measure');
  const frequencyFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'frequency');
  const startDateFilter = dataSource.filters?.find(
    (f: ChartFilter) => f.field === 'date_index' && f.operator === 'gte'
  );
  const endDateFilter = dataSource.filters?.find(
    (f: ChartFilter) => f.field === 'date_index' && f.operator === 'lte'
  );

  // Extract advanced configuration
  const advancedFilters = dataSource.advancedFilters || [];
  const seriesConfigs = chartConfigData.seriesConfigs || [];

  const result: Partial<ChartConfig> = {
    chartName: chart.chart_name || '',
    chartType:
      chart.chart_type === 'pie' || chart.chart_type === 'area' ? 'bar' : chart.chart_type,
    measure: String(measureFilter?.value || ''),
    frequency: String(chartConfigData.frequency || frequencyFilter?.value || ''),
    startDate: String(startDateFilter?.value || '2024-01-01'),
    endDate: String(endDateFilter?.value || '2025-12-31'),
    groupBy: chartConfigData.series?.groupBy || 'provider_name',
    calculatedField: chartConfigData.calculatedField,
    advancedFilters,
    useAdvancedFiltering: advancedFilters.length > 0,
    seriesConfigs,
    useMultipleSeries: seriesConfigs.length > 0,
  };

  // Add optional properties only if they exist
  if (chartConfigData.colorPalette) result.colorPalette = chartConfigData.colorPalette;
  if (chartConfigData.stackingMode) result.stackingMode = chartConfigData.stackingMode;
  if (chartConfigData.periodComparison) result.periodComparison = chartConfigData.periodComparison;
  if (chartConfigData.dualAxisConfig) result.dualAxisConfig = chartConfigData.dualAxisConfig;

  return result;
}

/**
 * Generate chart description based on configuration
 */
function generateDescription(config: ChartConfig): string {
  if (config.chartType === 'table') {
    return `Table view of ${config.selectedDataSource?.name || 'data'}`;
  }
  if (config.chartType === 'dual-axis') {
    return `Dual-axis chart showing ${config.dualAxisConfig?.primary.measure} and ${config.dualAxisConfig?.secondary.measure}`;
  }
  if (config.useMultipleSeries) {
    return `${config.chartType} chart showing ${config.seriesConfigs.length} series by ${config.groupBy}`;
  }
  return `${config.chartType} chart showing ${config.measure} by ${config.groupBy}`;
}

/**
 * Build chart definition payload for API save/update
 */
export function buildChartPayload(
  config: ChartConfig,
  dataSource: DataSource,
  selectedDatePreset: string
) {
  const filters: ChartFilter[] = [];

  // Add measure/frequency filters (except for special chart types)
  if (config.chartType !== 'table' && config.chartType !== 'dual-axis' && !config.useMultipleSeries) {
    filters.push(
      { field: 'measure', operator: 'eq', value: config.measure },
      { field: 'frequency', operator: 'eq', value: config.frequency }
    );
  }

  // Add date range filters
  if (config.startDate) {
    filters.push({ field: 'date_index', operator: 'gte', value: config.startDate });
  }
  if (config.endDate) {
    filters.push({ field: 'date_index', operator: 'lte', value: config.endDate });
  }

  return {
    chart_name: config.chartName,
    chart_description: generateDescription(config),
    chart_type: config.chartType,
    chart_category_id: null,
    chart_config: {
      x_axis: { field: 'period_end', label: 'Date', format: 'date' },
      y_axis: { field: 'measure_value', label: 'Amount', format: 'currency' },
      series:
        config.chartType !== 'table'
          ? {
              groupBy: config.groupBy,
              colorPalette: config.colorPalette || 'default',
            }
          : undefined,
      options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
      calculatedField: config.calculatedField,
      dateRangePreset: selectedDatePreset,
      seriesConfigs: config.seriesConfigs,
      dataSourceId: dataSource.id,
      stackingMode: config.stackingMode,
      colorPalette: config.colorPalette,
      periodComparison: config.periodComparison,
      dualAxisConfig: config.dualAxisConfig,
      ...(config.chartType === 'dual-axis' && config.frequency && { frequency: config.frequency }),
    },
    data_source: {
      table: `${dataSource.schemaName}.${dataSource.tableName}`,
      filters,
      advancedFilters: config.advancedFilters,
      groupBy: config.chartType !== 'table' ? [config.groupBy, 'period_end'] : [],
      orderBy: [{ field: 'period_end', direction: 'ASC' }],
    },
  };
}

/**
 * Smart defaults to apply when chart type changes
 */
type ChartTypeDefaultsFn = (
  config: ChartConfig,
  schema: SchemaInfo | null
) => Partial<ChartConfig>;

const CHART_TYPE_DEFAULTS: Record<string, ChartTypeDefaultsFn> = {
  'stacked-bar': (config, _schema) => ({
    groupBy: config.groupBy === 'none' ? 'provider_name' : config.groupBy,
    stackingMode: config.stackingMode || 'normal',
    colorPalette: config.colorPalette || 'blue',
  }),
  'horizontal-bar': (config, schema) => ({
    groupBy:
      config.groupBy === 'none'
        ? schema?.availableGroupByFields?.[0]?.columnName || 'practice_primary'
        : config.groupBy,
    colorPalette: config.colorPalette || 'blue',
  }),
  'dual-axis': (config, _schema) => ({
    measure: '',
    frequency: '',
    dualAxisConfig: config.dualAxisConfig || {
      enabled: true,
      primary: { measure: '', chartType: 'bar' as const, axisPosition: 'left' as const },
      secondary: { measure: '', chartType: 'line' as const, axisPosition: 'right' as const },
    },
  }),
};

/**
 * Apply smart defaults when chart type changes
 */
export function applyChartTypeDefaults(
  chartType: string,
  currentConfig: ChartConfig,
  schema: SchemaInfo | null
): Partial<ChartConfig> {
  const defaultFn = CHART_TYPE_DEFAULTS[chartType];
  return defaultFn ? defaultFn(currentConfig, schema) : {};
}
