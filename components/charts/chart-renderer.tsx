/**
 * ChartRenderer Component
 *
 * Phase 4.2: Dynamic chart type dispatcher
 *
 * Simplifies analytics-chart.tsx by extracting chart type dispatch logic
 * into a reusable component. Maps chart types to their rendering components.
 *
 * Benefits:
 * - Single source of truth for chart type → component mapping
 * - Eliminates large switch/if-else blocks in parent components
 * - Easy to add new chart types (just update the map)
 * - Type-safe dispatch with TypeScript
 */

import type { ChartData, DualAxisConfig } from '@/lib/types/analytics';
import AnalyticsBarChart from './analytics-bar-chart';
import AnalyticsDualAxisChart from './analytics-dual-axis-chart';
import AnalyticsHorizontalBarChart from './analytics-horizontal-bar-chart';
import AnalyticsNumberChart from './analytics-number-chart';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import AnalyticsStackedBarChart from './analytics-stacked-bar-chart';
import AnalyticsTableChart from './analytics-table-chart';
import AreaChart from './area-chart';
import DoughnutChart from './doughnut-chart';
// Chart rendering components
import LineChart01 from './line-chart-01';

/**
 * Formatted cell structure for table charts
 */
interface FormattedCell {
  formatted: string;
  raw: unknown;
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Column definition for table charts
 */
interface ColumnDefinition {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: Record<string, unknown> | null;
}

/**
 * Chart renderer props
 */
interface ChartRendererProps {
  chartType: string;
  data: ChartData;
  rawData?: Record<string, unknown>[];

  // Chart-specific props
  title?: string;
  groupBy?: string;
  colorPalette?: string;
  stackingMode?: string;
  dualAxisConfig?: DualAxisConfig;
  measure?: string;

  // Table-specific props
  columns?: ColumnDefinition[];
  formattedData?: Array<Record<string, FormattedCell>>;

  // Chart reference for export functionality
  chartRef?: React.RefObject<HTMLCanvasElement | null>;

  // Sizing props
  width?: number;
  height?: number;
  responsive?: boolean;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
  frequency?: string;

  // Additional props passed through
  [key: string]: unknown;
}

/**
 * Map of chart types to their rendering components
 *
 * This is the single source of truth for chart type dispatch.
 * To add a new chart type:
 * 1. Import the component above
 * 2. Add an entry to this map
 *
 * Note: Using `React.ComponentType` here because each chart component has different
 * prop interfaces (LineChart01Props, AnalyticsBarChartProps, etc.) and TypeScript
 * doesn't support heterogeneous component maps without a union type of all props.
 * The actual props are validated through TypeScript at the call site in the render logic.
 * eslint-disable-next-line is used to suppress the any type warning for this valid use case.
 */
// biome-ignore lint/suspicious/noExplicitAny: Dynamic component dispatch with heterogeneous prop types
const CHART_COMPONENTS: Record<string, React.ComponentType<any>> = {
  line: LineChart01,
  bar: AnalyticsBarChart,
  'stacked-bar': AnalyticsStackedBarChart,
  'horizontal-bar': AnalyticsHorizontalBarChart,
  'progress-bar': AnalyticsProgressBarChart,
  'dual-axis': AnalyticsDualAxisChart,
  number: AnalyticsNumberChart,
  table: AnalyticsTableChart,
  doughnut: DoughnutChart,
  pie: DoughnutChart, // Doughnut component handles both pie and doughnut
  area: AreaChart,
};

/**
 * ChartRenderer
 *
 * Dynamically renders the appropriate chart component based on chartType.
 * Handles chart-type-specific data transformations and prop requirements.
 *
 * @param props - Chart renderer props
 * @returns Rendered chart component or error message
 *
 * @example
 * ```tsx
 * <ChartRenderer
 *   chartType="bar"
 *   data={chartData}
 *   colorPalette="vibrant"
 * />
 * ```
 */
export default function ChartRenderer({
  chartType,
  data,
  rawData,
  columns,
  formattedData,
  chartRef,
  width = 800,
  height = 400,
  frequency,
  stackingMode,
  colorPalette,
  dualAxisConfig,
  title,
  measure,
  responsive,
  minHeight,
  maxHeight,
  aspectRatio,
  ...otherProps
}: ChartRendererProps) {
  // Get the component for this chart type
  const Component = CHART_COMPONENTS[chartType];

  // Handle unsupported chart types
  if (!Component) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 font-semibold mb-2">
            Unsupported chart type: {chartType}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Available types: {Object.keys(CHART_COMPONENTS).join(', ')}
          </p>
        </div>
      </div>
    );
  }

  // Special handling for progress bar charts
  // Phase 3.4: Transform ChartData to ProgressBarData format
  if (chartType === 'progress-bar') {
    const dataset = data.datasets[0];

    // Extract custom fields from dataset (typed in ChartDataset interface)
    const rawValues = dataset?.rawValues;
    const originalMeasureType = dataset?.originalMeasureType;

    // Transform to progress bar data format
    const progressData = data.labels.map((label, index) => ({
      label: String(label),
      value: rawValues?.[index] ?? Number(dataset?.data[index] || 0),
      percentage: Number(dataset?.data[index] || 0),
    }));

    return (
      <AnalyticsProgressBarChart
        data={progressData}
        colorPalette={colorPalette || 'default'}
        measureType={originalMeasureType || data.measureType}
        height={height}
        {...otherProps}
      />
    );
  }

  // Special handling for table charts
  if (chartType === 'table') {
    const tableProps = {
      data: rawData || [],
      columns:
        columns?.map((col) => ({
          columnName: col.columnName,
          displayName: col.displayName,
          dataType: col.dataType,
          formatType: col.formatType,
          displayIcon: col.displayIcon,
          iconType: col.iconType,
          iconColorMode: col.iconColorMode,
          iconColor: col.iconColor,
          iconMapping: col.iconMapping,
        })) || [],
      colorPalette: colorPalette || 'default',
      height,
      ...(formattedData && { formattedData }),
    };

    return <AnalyticsTableChart {...tableProps} />;
  }

  // Special handling for number charts
  if (chartType === 'number') {
    return (
      <AnalyticsNumberChart
        data={data}
        title={measure}
        animationDuration={2}
        responsive={responsive}
        minHeight={minHeight}
        maxHeight={maxHeight}
        aspectRatio={aspectRatio}
        {...otherProps}
      />
    );
  }

  // Special handling for dual-axis charts
  if (chartType === 'dual-axis') {
    if (!dualAxisConfig) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-red-600">Dual-axis configuration is required</p>
        </div>
      );
    }

    return (
      <AnalyticsDualAxisChart
        dualAxisConfig={dualAxisConfig}
        chartData={data}
        title={title}
        width={width}
        height={height}
        responsive={responsive}
        minHeight={minHeight}
        maxHeight={maxHeight}
        aspectRatio={aspectRatio}
        {...otherProps}
      />
    );
  }

  // Standard chart rendering (line, bar, stacked-bar, horizontal-bar, pie, doughnut, area)
  // Pass ref for export functionality
  const chartProps = {
    ref: chartRef,
    data,
    width,
    height,
    ...(frequency && { frequency }),
    ...(stackingMode && { stackingMode }),
    ...otherProps,
  };

  return <Component {...chartProps} />;
}
