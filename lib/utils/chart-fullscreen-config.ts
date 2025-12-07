/**
 * Chart Fullscreen Configuration Builder
 *
 * Pure functions for building Chart.js configuration objects.
 * Extracted from chart-fullscreen-modal.tsx for better testability and maintainability.
 *
 * Single Responsibility: Build Chart.js configuration objects
 */

import type { ChartOptions } from 'chart.js';
import moment from 'moment';
import { chartColors } from '@/components/charts/chartjs-config';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { createPeriodComparisonTooltipCallbacks } from '@/lib/utils/period-comparison-tooltips';
import type { ChartData } from '@/lib/types/analytics';

/**
 * Chart type for fullscreen modal
 */
export type FullscreenChartType = 'line' | 'bar' | 'stacked-bar' | 'horizontal-bar';

/**
 * Stacking mode for bar charts
 */
export type StackingMode = 'normal' | 'percentage';

/**
 * Frequency type for time-based charts
 */
export type FrequencyType = 'Weekly' | 'Monthly' | 'Quarterly' | string;

/**
 * Time configuration for Chart.js time scale
 */
export interface TimeConfig {
  unit: string;
  displayFormats: Record<string, string>;
  tooltipFormat: string;
}

/**
 * Parameters for building chart options
 */
export interface ChartOptionsParams {
  chartType: FullscreenChartType;
  chartData: ChartData;
  frequency: FrequencyType;
  stackingMode: StackingMode;
  darkMode: boolean;
}

/**
 * Get time configuration based on frequency
 *
 * @param frequency - Chart frequency (Weekly, Monthly, Quarterly)
 * @returns Time configuration object for Chart.js
 */
export function getTimeConfig(frequency: FrequencyType): TimeConfig {
  switch (frequency) {
    case 'Daily':
      return {
        unit: 'day',
        displayFormats: {
          day: 'DD-MMM-YY',
        },
        tooltipFormat: 'DD-MMM-YYYY',
      };
    case 'Weekly':
      return {
        unit: 'week',
        displayFormats: {
          week: 'DD-MMM-YY',
        },
        tooltipFormat: 'DD-MMM-YYYY',
      };
    case 'Monthly':
      return {
        unit: 'month',
        displayFormats: {
          month: 'MMM YYYY',
        },
        tooltipFormat: 'MMM YYYY',
      };
    case 'Quarterly':
      return {
        unit: 'quarter',
        displayFormats: {
          quarter: '[Q]Q YYYY',
        },
        tooltipFormat: '[Q]Q YYYY',
      };
    default:
      return {
        unit: 'month',
        displayFormats: {
          month: 'MMM YYYY',
        },
        tooltipFormat: 'MMM YYYY',
      };
  }
}

/**
 * Build scales configuration for Chart.js
 *
 * @param params - Chart configuration parameters
 * @returns Scales configuration object
 */
export function buildScalesConfig(params: ChartOptionsParams): ChartOptions['scales'] {
  const { chartType, chartData, stackingMode, darkMode } = params;
  const { textColor, gridColor } = chartColors;
  const isHorizontal = chartType === 'horizontal-bar';

  if (isHorizontal) {
    // Horizontal bars: X is value, Y is category
    return {
      x: {
        border: {
          display: false,
        },
        grid: {
          color: darkMode ? gridColor.dark : gridColor.light,
        },
        beginAtZero: true,
        ticks: {
          maxTicksLimit: 5,
          color: darkMode ? textColor.dark : textColor.light,
          font: {
            size: 14,
          },
          callback: (value: string | number) => {
            const numValue = typeof value === 'string' ? parseFloat(value) : value;
            const measureType = chartData.measureType || 'number';
            return formatValueCompact(numValue, measureType);
          },
        },
      },
      y: {
        type: 'category',
        border: {
          display: false,
        },
        grid: {
          display: false,
        },
        ticks: {
          color: darkMode ? textColor.dark : textColor.light,
          font: {
            size: 14,
          },
        },
      },
    };
  }

  // Vertical bars/lines: X is category, Y is value
  return {
    x: {
      type: 'category',
      stacked: chartType === 'stacked-bar',
      border: {
        display: false,
      },
      grid: {
        display: false,
      },
      ticks: {
        color: darkMode ? textColor.dark : textColor.light,
        maxRotation: 0,
        autoSkipPadding: 48,
        font: {
          size: 14,
        },
      },
    },
    y: {
      stacked: chartType === 'stacked-bar',
      border: {
        display: false,
      },
      grid: {
        color: darkMode ? gridColor.dark : gridColor.light,
      },
      beginAtZero: true,
      max: chartType === 'stacked-bar' && stackingMode === 'percentage' ? 100 : undefined,
      ticks: {
        maxTicksLimit: 5,
        color: darkMode ? textColor.dark : textColor.light,
        font: {
          size: 14,
        },
        callback: (value: string | number) => {
          const numValue = typeof value === 'string' ? parseFloat(value) : value;

          if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
            return `${numValue}%`;
          }

          const measureType = chartData.measureType || 'number';
          return formatValueCompact(numValue, measureType);
        },
      },
    },
  };
}

/**
 * Build tooltip configuration for Chart.js
 *
 * @param params - Chart configuration parameters
 * @param hasPeriodComparison - Whether chart has period comparison data
 * @returns Tooltip configuration object
 */
export function buildTooltipConfig(
  params: ChartOptionsParams,
  hasPeriodComparison: boolean
): ChartOptions['plugins'] {
  const { chartType, chartData, frequency, stackingMode, darkMode } = params;
  const { tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  if (hasPeriodComparison) {
    return {
      legend: {
        display: false,
      },
      tooltip: createPeriodComparisonTooltipCallbacks(frequency, darkMode) as never,
      zoom: buildZoomConfig(),
    };
  }

  // Detect mobile viewport for tooltip positioning
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 768;

  return {
    legend: {
      display: false,
    },
    tooltip: {
      enabled: true,
      mode: 'nearest',
      intersect: true,
      backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
      borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
      borderWidth: 1,
      titleColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
      bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
      bodySpacing: 8,
      padding: isMobileViewport ? 10 : 12, // Slightly smaller padding on mobile
      boxPadding: 6,
      usePointStyle: true,
      // Mobile-optimized tooltip positioning
      caretPadding: isMobileViewport ? 8 : 4, // More space on mobile to avoid finger blocking
      cornerRadius: 8,
      // Position tooltip to avoid edge cutoff on mobile
      ...(isMobileViewport && {
        position: 'nearest' as const,
        yAlign: 'bottom' as const, // Prefer showing below data point on mobile
      }),
      callbacks: {
        title: (context: { label?: string }[]) => {
          const labelValue = context[0]?.label || '';
          const parsedDate = moment(
            labelValue,
            ['YYYY-MM-DD', 'MMM YYYY', 'DD-MMM-YY', moment.ISO_8601],
            true
          );

          if (!parsedDate.isValid()) {
            return labelValue;
          }

          if (frequency === 'Weekly') {
            return parsedDate.format('MMM D, YYYY');
          } else if (frequency === 'Quarterly') {
            return parsedDate.format('[Q]Q YYYY');
          } else {
            return parsedDate.format('MMM YYYY');
          }
        },
        label: (context: { dataset: { label?: string }; parsed: { y: number } }) => {
          const label = context.dataset.label || '';
          const value = context.parsed.y;
          const measureType = chartData.measureType || 'number';
          const formattedValue = formatValue(value, measureType);

          if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
            return `${label}: ${value.toFixed(1)}%`;
          }

          return `${label}: ${formattedValue}`;
        },
      },
    } as never,
    zoom: buildZoomConfig(),
  };
}

/**
 * Zoom plugin configuration type
 */
interface ZoomPluginConfig {
  pan: { enabled: boolean; mode: 'x' };
  zoom: {
    wheel: { enabled: boolean; speed: number };
    pinch: { enabled: boolean };
    mode: 'x';
  };
  limits: {
    x: { min: 'original'; max: 'original' };
    y: { min: number; max: 'original' };
  };
}

/**
 * Build zoom plugin configuration
 *
 * @returns Zoom plugin configuration object
 */
function buildZoomConfig(): ZoomPluginConfig {
  return {
    pan: {
      enabled: true,
      mode: 'x' as const,
    },
    zoom: {
      wheel: {
        enabled: true,
        speed: 0.05,
      },
      pinch: {
        enabled: true,
      },
      mode: 'x' as const,
    },
    limits: {
      x: { min: 'original' as const, max: 'original' as const },
      y: { min: 0, max: 'original' as const },
    },
  };
}

/**
 * Build complete Chart.js options object
 *
 * Main orchestrator function that combines all configuration builders.
 *
 * @param params - Chart configuration parameters
 * @returns Complete Chart.js options object
 */
export function buildChartOptions(params: ChartOptionsParams): ChartOptions {
  const { chartType, chartData } = params;

  // Check if this is period comparison data
  const hasPeriodComparison = chartData.datasets.some(
    (ds) => ds.label?.includes('Current Period') || ds.label?.includes('Previous Period')
  );

  const isHorizontal = chartType === 'horizontal-bar';

  return {
    indexAxis: isHorizontal ? 'y' : 'x',
    layout: {
      padding: {
        top: 8,
        bottom: 4,
        left: 12,
        right: 12,
      },
    },
    scales: buildScalesConfig(params),
    interaction: {
      mode: 'nearest',
      intersect: true,
    },
    plugins: buildTooltipConfig(params, hasPeriodComparison),
    responsive: true,
    maintainAspectRatio: false,
  } as ChartOptions;
}
