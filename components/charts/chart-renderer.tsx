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

import type { ChartData } from '@/lib/types/analytics';
import type { DualAxisConfig } from '@/lib/types/analytics';

// Chart rendering components
import LineChart01 from './line-chart-01';
import AnalyticsBarChart from './analytics-bar-chart';
import AnalyticsStackedBarChart from './analytics-stacked-bar-chart';
import AnalyticsHorizontalBarChart from './analytics-horizontal-bar-chart';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import AnalyticsDualAxisChart from './analytics-dual-axis-chart';
import AnalyticsNumberChart from './analytics-number-chart';
import AnalyticsTableChart from './analytics-table-chart';
import DoughnutChart from './doughnut-chart';
import AreaChart from './area-chart';

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

  // Table-specific props
  columns?: ColumnDefinition[];
  formattedData?: Array<Record<string, FormattedCell>>;

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
 */
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

  // Render the appropriate chart component
  // Each component has its own prop requirements
  return (
    <Component
      data={data}
      rawData={rawData}
      columns={columns}
      formattedData={formattedData}
      {...otherProps}
    />
  );
}
