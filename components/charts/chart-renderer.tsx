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
import AnalyticsLineChart from './analytics-line-chart';
import { clientErrorLog } from '@/lib/utils/debug-client';
import AnalyticsNumberChart from './analytics-number-chart';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import AnalyticsStackedBarChart from './analytics-stacked-bar-chart';
import AnalyticsTableChart from './analytics-table-chart';
import AreaChart from './area-chart';
import DoughnutChart from './doughnut-chart';

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
 * Raw analytics data row
 */
interface AnalyticsRow {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Chart renderer props
 */
interface ChartRendererProps {
  chartType: string;
  data: ChartData;
  rawData?: AnalyticsRow[];

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

  // Animation props
  animationDuration?: number;

  // Accessibility props
  ariaLabel?: string;
  ariaDescribedBy?: string;

  // Theme props
  theme?: 'light' | 'dark';

  // Legend props
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';

  // Tooltip props
  showTooltips?: boolean;

  // Grid props
  showGrid?: boolean;
  gridColor?: string;
}

/**
 * Map of chart types to their rendering components
 *
 * This is the single source of truth for chart type dispatch.
 * To add a new chart type:
 * 1. Import the component above
 * 2. Add an entry to this map
 *
 * Note: Type assertion is necessary here because each chart component has different
 * prop interfaces (LineChart01Props, AnalyticsBarChartProps, etc.) and TypeScript
 * doesn't support heterogeneous component maps without a union type of all props.
 * Type safety is maintained through the specific component calls in the render logic below
 * where each chart type receives properly typed props.
 */
const CHART_COMPONENTS = {
  line: AnalyticsLineChart,
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
} as unknown as Record<string, React.ComponentType<Record<string, unknown>>>;

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
  animationDuration,
  ariaLabel,
  ariaDescribedBy,
  theme,
  showLegend,
  legendPosition,
  showTooltips,
  showGrid,
  gridColor,
}: ChartRendererProps) {
  // Get the component for this chart type
  const Component = CHART_COMPONENTS[chartType];

  // Handle unsupported chart types
  if (!Component) {
    clientErrorLog('ChartRenderer: Unsupported chart type', {
      chartType,
      typeofChartType: typeof chartType,
      availableTypes: Object.keys(CHART_COMPONENTS),
      data,
    });
    
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
        animationDuration={animationDuration ?? 2}
        responsive={responsive}
        minHeight={minHeight}
        maxHeight={maxHeight}
        aspectRatio={aspectRatio}
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
      />
    );
  }

  // Standard chart rendering (line, bar, stacked-bar, horizontal-bar, pie, doughnut, area)
  // Pass ref for export functionality
  const chartProps: Record<string, unknown> = {
    ref: chartRef,
    data,
    width,
    height,
    ...(frequency && { frequency }),
    ...(stackingMode && { stackingMode }),
    ...(animationDuration !== undefined && { animationDuration }),
    ...(ariaLabel && { ariaLabel }),
    ...(ariaDescribedBy && { ariaDescribedBy }),
    ...(theme && { theme }),
    ...(showLegend !== undefined && { showLegend }),
    ...(legendPosition && { legendPosition }),
    ...(showTooltips !== undefined && { showTooltips }),
    ...(showGrid !== undefined && { showGrid }),
    ...(gridColor && { gridColor }),
    ...(responsive !== undefined && { responsive }),
    ...(minHeight !== undefined && { minHeight }),
    ...(maxHeight !== undefined && { maxHeight }),
    ...(aspectRatio !== undefined && { aspectRatio }),
    ...(colorPalette && { colorPalette }),
  };

  return <Component {...chartProps} />;
}
